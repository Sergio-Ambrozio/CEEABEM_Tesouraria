"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AuditAction, Role, RuleMatchType, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const reviewSchema = z.object({
  id: z.string(),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
  createRule: z.boolean().optional(),
  ruleKeyword: z.string().optional()
});

async function upsertReviewRule(data: z.infer<typeof reviewSchema>) {
  if (data.createRule && data.categoryId && data.ruleKeyword?.trim()) {
    await prisma.categorizationRule.create({
      data: {
        keyword: data.ruleKeyword.trim(),
        matchType: RuleMatchType.CONTAINS,
        categoryId: data.categoryId,
        priority: 50,
        enabled: true
      }
    });
  }
}

export async function reviewTransactionAction(input: z.infer<typeof reviewSchema>) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER]);
  const data = reviewSchema.parse(input);
  const before = await prisma.transaction.findUniqueOrThrow({
    where: { id: data.id },
    include: { monthlyClosing: true }
  });
  assertEditable(before);

  const after = await prisma.transaction.update({
    where: { id: data.id },
    data: {
      categoryId: data.categoryId || null,
      notes: data.notes || null,
      status: data.categoryId ? TransactionStatus.REVIEWED : TransactionStatus.DRAFT
    }
  });

  await upsertReviewRule(data);

  await audit({ entityType: "Transaction", entityId: data.id, action: AuditAction.UPDATE, before, after, userId: user.id });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function reviewAndApproveTransactionAction(input: z.infer<typeof reviewSchema>) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER]);
  const data = reviewSchema.parse(input);
  if (!data.categoryId) throw new Error("A transaction must be categorized before approval.");

  const before = await prisma.transaction.findUniqueOrThrow({
    where: { id: data.id },
    include: { monthlyClosing: true }
  });
  assertEditable(before);

  const reviewed = await prisma.transaction.update({
    where: { id: data.id },
    data: {
      categoryId: data.categoryId,
      notes: data.notes || null,
      status: TransactionStatus.APPROVED
    }
  });

  await upsertReviewRule(data);

  await audit({ entityType: "Transaction", entityId: data.id, action: AuditAction.APPROVE, before, after: reviewed, userId: user.id });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function approveTransactionAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER]);
  const id = String(formData.get("id"));
  const before = await prisma.transaction.findUniqueOrThrow({
    where: { id },
    include: { monthlyClosing: true }
  });
  assertEditable(before);
  if (!before.categoryId) throw new Error("A transaction must be categorized before approval.");

  const after = await prisma.transaction.update({
    where: { id },
    data: { status: TransactionStatus.APPROVED }
  });
  await audit({ entityType: "Transaction", entityId: id, action: AuditAction.APPROVE, before, after, userId: user.id });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

function assertEditable(transaction: { monthlyClosing: { status: string } | null }) {
  if (transaction.monthlyClosing?.status === "APPROVED" || transaction.monthlyClosing?.status === "SENT") {
    throw new Error("This transaction belongs to an approved monthly closing. Reopen the closing before editing.");
  }
}
