"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AttachmentStatus, AuditAction, Role, RuleMatchType, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { storeFile } from "@/lib/storage/files";

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

export async function uploadTransactionAttachmentAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER]);
  const transactionId = String(formData.get("transactionId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Choose a receipt or supporting document to attach.");
  }
  if (!isSupportedAttachment(file)) {
    throw new Error("Attachments must be PDF, JPG, PNG, or HEIC files.");
  }

  await prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
  const stored = await storeFile("attachments", file, transactionId);
  const attachment = await prisma.transactionAttachment.create({
    data: {
      transactionId,
      filename: stored.filename,
      mimeType: stored.mimeType,
      fileSize: stored.fileSize,
      storagePath: stored.storagePath,
      notes: String(formData.get("notes") ?? "").trim() || null,
      receiptRequired: formData.get("receiptRequired") === "on",
      status: AttachmentStatus.PENDING_REVIEW,
      uploadedById: user.id
    }
  });

  await audit({
    entityType: "TransactionAttachment",
    entityId: attachment.id,
    action: AuditAction.ATTACH_FILE,
    after: attachment,
    userId: user.id
  });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

export async function reviewTransactionAttachmentAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER]);
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as AttachmentStatus;
  const allowedStatuses = new Set<AttachmentStatus>([AttachmentStatus.REVIEWED, AttachmentStatus.REJECTED, AttachmentStatus.PENDING_REVIEW]);
  if (!allowedStatuses.has(status)) {
    throw new Error("Invalid attachment review status.");
  }
  const before = await prisma.transactionAttachment.findUniqueOrThrow({ where: { id } });
  const after = await prisma.transactionAttachment.update({
    where: { id },
    data: {
      status,
      reviewedById: status === AttachmentStatus.PENDING_REVIEW ? null : user.id,
      reviewedAt: status === AttachmentStatus.PENDING_REVIEW ? null : new Date()
    }
  });
  await audit({
    entityType: "TransactionAttachment",
    entityId: id,
    action: AuditAction.REVIEW_ATTACHMENT,
    before,
    after,
    userId: user.id
  });
  revalidatePath("/transactions");
}

export async function deleteTransactionAttachmentAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const id = String(formData.get("id") ?? "");
  const before = await prisma.transactionAttachment.findUniqueOrThrow({ where: { id } });
  const after = await prisma.transactionAttachment.update({
    where: { id },
    data: { deletedAt: new Date() }
  });
  await audit({
    entityType: "TransactionAttachment",
    entityId: id,
    action: AuditAction.DELETE,
    before,
    after,
    userId: user.id
  });
  revalidatePath("/transactions");
}

function assertEditable(transaction: { monthlyClosing: { status: string } | null }) {
  if (transaction.monthlyClosing?.status === "APPROVED" || transaction.monthlyClosing?.status === "SENT") {
    throw new Error("This transaction belongs to an approved monthly closing. Reopen the closing before editing.");
  }
}

function isSupportedAttachment(file: File) {
  const name = file.name.toLowerCase();
  return (
    file.type === "application/pdf" ||
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/heic" ||
    name.endsWith(".pdf") ||
    name.endsWith(".jpg") ||
    name.endsWith(".jpeg") ||
    name.endsWith(".png") ||
    name.endsWith(".heic")
  );
}
