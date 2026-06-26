import nodemailer from "nodemailer";
import { EmailStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";

export async function sendMonthlyClosingEmail(monthlyClosingId: string) {
  const closing = await prisma.monthlyClosing.findUniqueOrThrow({
    where: { id: monthlyClosingId },
    include: { report: true }
  });

  const recipient = process.env.REVIEWER_EMAIL ?? "";
  const cc = process.env.TREASURER_EMAIL ?? "";
  const subject = `CEEABEM monthly closing ${closing.month}/${closing.year}`;

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD || !recipient) {
    return prisma.emailLog.create({
      data: {
        monthlyClosingId,
        recipient: recipient || "not-configured",
        cc,
        subject,
        status: EmailStatus.SKIPPED,
        errorMessage: "SMTP configuration is incomplete."
      }
    });
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
      cc,
      subject,
      text: "Attached are the approved CEEABEM monthly treasury reports.",
      attachments: closing.report
        ? [
            { filename: "monthly-report.pdf", path: closing.report.pdfPath },
            { filename: "monthly-transactions.xlsx", path: closing.report.excelPath }
          ]
        : []
    });

    return prisma.emailLog.create({
      data: {
        monthlyClosingId,
        recipient,
        cc,
        subject,
        status: EmailStatus.SENT,
        sentAt: new Date()
      }
    });
  } catch (error) {
    return prisma.emailLog.create({
      data: {
        monthlyClosingId,
        recipient,
        cc,
        subject,
        status: EmailStatus.FAILED,
        errorMessage: error instanceof Error ? error.message : "Unknown SMTP error."
      }
    });
  }
}
