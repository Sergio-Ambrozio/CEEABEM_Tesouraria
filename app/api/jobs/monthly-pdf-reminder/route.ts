import nodemailer from "nodemailer";
import { addMonths, endOfMonth, format, startOfMonth } from "date-fns";
import { EmailStatus, ScheduledJobStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma/db";
import { ensureDatabaseReady } from "@/lib/prisma/ensure-database";

export async function GET(request: NextRequest) {
  if (process.env.CRON_SECRET && request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  await ensureDatabaseReady();
  const now = new Date();
  const previousMonth = addMonths(now, -1);
  const periodStart = startOfMonth(previousMonth);
  const periodEnd = endOfMonth(previousMonth);
  const run = await prisma.scheduledJobRun.create({
    data: {
      jobName: "monthly-pdf-statement-reminder",
      status: isFirstBusinessDay(now) ? ScheduledJobStatus.STARTED : ScheduledJobStatus.SKIPPED,
      periodStart,
      periodEnd,
      summaryJson: JSON.stringify({ reason: isFirstBusinessDay(now) ? "Reminder started" : "Not first business day" })
    }
  });

  if (!isFirstBusinessDay(now)) {
    await prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date() }
    });
    return NextResponse.json({ status: "skipped" });
  }

  const recipient = process.env.TREASURER_EMAIL ?? "";
  const subject = `CEEABEM PostFinance PDF statement upload reminder - ${format(previousMonth, "MMMM yyyy")}`;
  const text = [
    `Please download the PostFinance PDF statement for ${format(periodStart, "yyyy-MM-dd")} to ${format(periodEnd, "yyyy-MM-dd")}.`,
    "Then upload it in the CEEABEM Treasury Tool import screen for extraction and review.",
    "This reminder does not approve transactions or close the month."
  ].join("\n\n");

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !recipient) {
    await prisma.emailLog.create({
      data: {
        recipient: recipient || "not-configured",
        subject,
        status: EmailStatus.SKIPPED,
        errorMessage: "SMTP configuration or TREASURER_EMAIL is incomplete."
      }
    });
    await prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        status: ScheduledJobStatus.SUCCEEDED,
        summaryJson: JSON.stringify({ email: "skipped", periodStart, periodEnd }),
        finishedAt: new Date()
      }
    });
    return NextResponse.json({ status: "ok", email: "skipped" });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: recipient,
      subject,
      text
    });
    await prisma.emailLog.create({
      data: { recipient, subject, status: EmailStatus.SENT, sentAt: new Date() }
    });
    await prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        status: ScheduledJobStatus.SUCCEEDED,
        summaryJson: JSON.stringify({ email: "sent", periodStart, periodEnd }),
        finishedAt: new Date()
      }
    });
    return NextResponse.json({ status: "ok", email: "sent" });
  } catch (error) {
    await prisma.emailLog.create({
      data: {
        recipient,
        subject,
        status: EmailStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown SMTP error."
      }
    });
    await prisma.scheduledJobRun.update({
      where: { id: run.id },
      data: {
        status: ScheduledJobStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Reminder failed.",
        finishedAt: new Date()
      }
    });
    return NextResponse.json({ status: "failed" }, { status: 500 });
  }
}

function isFirstBusinessDay(date: Date) {
  const cursor = startOfMonth(date);
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() + 1);
  }
  return date.getFullYear() === cursor.getFullYear() && date.getMonth() === cursor.getMonth() && date.getDate() === cursor.getDate();
}
