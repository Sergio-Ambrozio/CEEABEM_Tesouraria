"use server";

import { revalidatePath } from "next/cache";
import { AuditAction, ClosingStatus, EmailStatus, Role, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { generateMonthlyReport } from "@/lib/reports/monthly-report";
import { sendMonthlyClosingEmail } from "@/lib/email/monthly-closing-email";

export async function closeMonthAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const month = Number(formData.get("month"));
  const year = Number(formData.get("year"));
  const treasurerNotes = String(formData.get("treasurerNotes") ?? "").trim();

  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) {
    throw new Error("Choose a valid month and year.");
  }

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  const transactions = await prisma.transaction.findMany({
    where: { date: { gte: start, lt: end } },
    orderBy: { date: "asc" }
  });

  if (transactions.length === 0) throw new Error("There are no transactions for this month.");
  if (transactions.some((transaction) => transaction.status !== TransactionStatus.APPROVED)) {
    throw new Error("All transactions must be approved before closing the month.");
  }
  if (transactions.some((transaction) => transaction.monthlyClosingId)) {
    throw new Error("At least one transaction is already included in a monthly closing.");
  }

  const openingBalance = await calculateOpeningBalance(start);
  const closingBalance = openingBalance + transactions.reduce((total, transaction) => total + Number(transaction.amount), 0);

  const closing = await prisma.monthlyClosing.upsert({
    where: { month_year: { month, year } },
    update: {
      openingBalance,
      closingBalance,
      status: ClosingStatus.APPROVED,
      approvedById: user.id,
      approvedAt: new Date(),
      treasurerNotes
    },
    create: {
      month,
      year,
      openingBalance,
      closingBalance,
      status: ClosingStatus.APPROVED,
      approvedById: user.id,
      approvedAt: new Date(),
      treasurerNotes
    }
  });

  await prisma.transaction.updateMany({
    where: { id: { in: transactions.map((transaction) => transaction.id) } },
    data: { monthlyClosingId: closing.id, lockedAt: new Date() }
  });

  await generateMonthlyReport(closing.id);
  const emailLog = await sendMonthlyClosingEmail(closing.id);

  const after = await prisma.monthlyClosing.update({
    where: { id: closing.id },
    data:
      emailLog.status === EmailStatus.SENT
        ? { status: ClosingStatus.SENT, emailSentAt: emailLog.sentAt }
        : { status: ClosingStatus.APPROVED }
  });

  await audit({
    entityType: "MonthlyClosing",
    entityId: closing.id,
    action: AuditAction.CLOSE_MONTH,
    after,
    userId: user.id
  });

  revalidatePath("/closings");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
}

export async function reopenClosingAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const id = String(formData.get("id"));
  const before = await prisma.monthlyClosing.findUniqueOrThrow({ where: { id } });
  const after = await prisma.monthlyClosing.update({
    where: { id },
    data: { status: ClosingStatus.UNDER_REVIEW, approvedAt: null, approvedById: null, emailSentAt: null }
  });
  await prisma.transaction.updateMany({ where: { monthlyClosingId: id }, data: { lockedAt: null } });
  await audit({ entityType: "MonthlyClosing", entityId: id, action: AuditAction.REOPEN, before, after, userId: user.id });
  revalidatePath("/closings");
  revalidatePath("/transactions");
}

async function calculateOpeningBalance(start: Date) {
  const previousClosing = await prisma.monthlyClosing.findFirst({
    where: { OR: [{ year: { lt: start.getFullYear() } }, { year: start.getFullYear(), month: { lt: start.getMonth() + 1 } }] },
    orderBy: [{ year: "desc" }, { month: "desc" }]
  });
  if (previousClosing) return Number(previousClosing.closingBalance);

  const priorTransactions = await prisma.transaction.findMany({ where: { date: { lt: start } } });
  return priorTransactions.reduce((total, transaction) => total + Number(transaction.amount), 0);
}
