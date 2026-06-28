import crypto from "node:crypto";
import {
  AttachmentStatus,
  AuditAction,
  BankConnectorType,
  ImportedTransactionRawStatus,
  ImportSessionStatus,
  ImportSourceType,
  TransactionStatus
} from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { audit } from "@/lib/audit";
import { categorizeDraftTransactions } from "@/lib/categorization/categorizer";
import { storeFile } from "@/lib/storage/files";
import { parsePdfStatement } from "./pdf-statement-importer";
import { spreadsheetImporter } from "./spreadsheet-importer";

export async function importTransactionsFromFile(file: File, userId: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = file.name;
  const extension = filename.split(".").pop()?.toLowerCase();

  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Only CSV and XLSX files are supported in this release.");
  }

  const preview = await spreadsheetImporter.parse(buffer, filename);
  const sourceType = extension === "csv" ? ImportSourceType.CSV : ImportSourceType.XLSX;
  const session = await prisma.importSession.create({
    data: {
      filename,
      sourceType,
      connectorType: BankConnectorType.MANUAL_CSV_XLSX_UPLOAD,
      status: ImportSessionStatus.IMPORTED,
      errorsJson: preview.errors.length ? JSON.stringify(preview.errors) : undefined,
      createdById: userId
    }
  });

  const importedIds: string[] = [];
  let duplicatedRecords = 0;

  for (const row of preview.rows) {
    const duplicateHash = transactionHash(row);
    const existing = await prisma.transaction.findUnique({ where: { duplicateHash } });
    if (existing) {
      duplicatedRecords += 1;
      continue;
    }

    const { categoryName, ...transactionRow } = row;
    const category = categoryName
      ? await prisma.category.findFirst({
          where: {
            name: { equals: categoryName },
            active: true
          }
        })
      : null;

    const transaction = await prisma.transaction.create({
      data: {
        ...transactionRow,
        categoryId: category?.id,
        duplicateHash,
        sourceFile: filename,
        sourceType,
        sourceConnector: BankConnectorType.MANUAL_CSV_XLSX_UPLOAD,
        originalImportedDataJson: JSON.stringify(row),
        importSessionId: session.id,
        status: TransactionStatus.DRAFT
      }
    });
    importedIds.push(transaction.id);
  }

  await categorizeDraftTransactions(importedIds);

  const updatedSession = await prisma.importSession.update({
    where: { id: session.id },
    data: {
      importedRecords: importedIds.length,
      duplicatedRecords
    }
  });

  await audit({
    entityType: "ImportSession",
    entityId: updatedSession.id,
    action: AuditAction.IMPORT,
    after: updatedSession,
    userId
  });

  return updatedSession;
}

export async function createPdfImportSession(file: File, userId: string) {
  const filename = file.name;
  if (!filename.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF bank statement to parse.");
  }

  const stored = await storeFile("imports", file, "pdf-statements");
  const buffer = Buffer.from(await file.arrayBuffer());
  const session = await prisma.importSession.create({
    data: {
      filename,
      sourceType: ImportSourceType.PDF,
      connectorType: BankConnectorType.MANUAL_PDF_UPLOAD,
      status: ImportSessionStatus.PARSING,
      sourcePath: stored.storagePath,
      sourceMimeType: stored.mimeType,
      createdById: userId,
      startedAt: new Date(),
      attachments: {
        create: {
          filename: stored.filename,
          mimeType: stored.mimeType,
          fileSize: stored.fileSize,
          storagePath: stored.storagePath,
          status: AttachmentStatus.UPLOADED,
          notes: "Original uploaded PostFinance PDF statement",
          uploadedById: userId
        }
      }
    }
  });

  try {
    const preview = await parsePdfStatement(buffer);
    let duplicatedRecords = 0;
    let lowConfidenceCount = 0;

    for (const [index, row] of preview.rows.entries()) {
      const duplicateHash = transactionHash(row);
      const existing = await prisma.transaction.findUnique({ where: { duplicateHash } });
      if (existing) duplicatedRecords += 1;
      if (row.confidence < 0.78 || row.warnings.length > 0) lowConfidenceCount += 1;

      await prisma.importedTransactionRaw.create({
        data: {
          importSessionId: session.id,
          rowIndex: index + 1,
          transactionDate: row.date,
          valueDate: row.valueDate,
          description: row.description,
          reference: row.reference,
          debit: row.debit,
          credit: row.credit,
          amount: row.amount,
          balance: row.balance,
          rawJson: JSON.stringify({ rawText: row.rawText }),
          normalizedJson: JSON.stringify(row),
          confidence: row.confidence,
          parseWarningsJson: row.warnings.length ? JSON.stringify(row.warnings) : undefined,
          duplicateHash,
          matchedTransactionId: existing?.id,
          status: existing ? ImportedTransactionRawStatus.DUPLICATE : row.confidence < 0.78 ? ImportedTransactionRawStatus.NEEDS_ATTENTION : ImportedTransactionRawStatus.EXTRACTED
        }
      });
    }

    const status =
      preview.errors.length > 0 && preview.rows.length === 0
        ? ImportSessionStatus.FAILED
        : duplicatedRecords > 0
          ? ImportSessionStatus.DUPLICATE_DETECTED
          : lowConfidenceCount > 0 || preview.errors.length > 0
            ? ImportSessionStatus.PARTIALLY_FAILED
            : ImportSessionStatus.PARSED;

    const updated = await prisma.importSession.update({
      where: { id: session.id },
      data: {
        status,
        rawRecordCount: preview.rows.length,
        parsedRecordCount: preview.rows.length,
        duplicatedRecords,
        lowConfidenceCount,
        errorsJson: preview.errors.length ? JSON.stringify(preview.errors) : undefined,
        completedAt: new Date()
      }
    });

    await audit({
      entityType: "ImportSession",
      entityId: updated.id,
      action: AuditAction.PARSE_IMPORT,
      after: updated,
      userId
    });

    return updated;
  } catch (error) {
    const updated = await prisma.importSession.update({
      where: { id: session.id },
      data: {
        status: ImportSessionStatus.FAILED,
        errorsJson: JSON.stringify([error instanceof Error ? error.message : "PDF parsing failed."]),
        completedAt: new Date()
      }
    });
    await audit({ entityType: "ImportSession", entityId: updated.id, action: AuditAction.PARSE_IMPORT, after: updated, userId });
    return updated;
  }
}

export async function importReviewedPdfRows(importSessionId: string, rows: ReviewedPdfRow[], userId: string) {
  const session = await prisma.importSession.findUniqueOrThrow({
    where: { id: importSessionId },
    include: { rawTransactions: true }
  });
  if (session.sourceType !== ImportSourceType.PDF) {
    throw new Error("Only PDF import sessions can be confirmed here.");
  }

  const rawById = new Map(session.rawTransactions.map((row) => [row.id, row]));
  const importedIds: string[] = [];
  let duplicatedRecords = 0;

  for (const row of rows) {
    const raw = rawById.get(row.id);
    if (!raw) continue;
    if (row.skip) {
      await prisma.importedTransactionRaw.update({
        where: { id: row.id },
        data: { status: ImportedTransactionRawStatus.SKIPPED }
      });
      continue;
    }

    const duplicateHash = transactionHash(row);
    const existing = await prisma.transaction.findUnique({ where: { duplicateHash } });
    if (existing) {
      duplicatedRecords += 1;
      await prisma.importedTransactionRaw.update({
        where: { id: row.id },
        data: {
          duplicateHash,
          matchedTransactionId: existing.id,
          status: ImportedTransactionRawStatus.DUPLICATE
        }
      });
      continue;
    }

    const transaction = await prisma.transaction.create({
      data: {
        date: row.date,
        valueDate: row.valueDate,
        description: row.description,
        reference: row.reference || null,
        debit: row.debit,
        credit: row.credit,
        amount: row.amount,
        balance: row.balance,
        duplicateHash,
        sourceFile: session.filename,
        sourceType: ImportSourceType.PDF,
        sourceConnector: BankConnectorType.MANUAL_PDF_UPLOAD,
        sourceRawId: raw.id,
        originalImportedDataJson: raw.normalizedJson ?? raw.rawJson,
        importSessionId: session.id,
        status: TransactionStatus.DRAFT
      }
    });

    importedIds.push(transaction.id);
    await prisma.importedTransactionRaw.update({
      where: { id: row.id },
      data: {
        transactionDate: row.date,
        valueDate: row.valueDate,
        description: row.description,
        reference: row.reference || null,
        debit: row.debit,
        credit: row.credit,
        amount: row.amount,
        balance: row.balance,
        duplicateHash,
        matchedTransactionId: transaction.id,
        normalizedJson: JSON.stringify(row),
        status: ImportedTransactionRawStatus.IMPORTED
      }
    });
  }

  await categorizeDraftTransactions(importedIds);

  const updated = await prisma.importSession.update({
    where: { id: session.id },
    data: {
      importedRecords: importedIds.length,
      duplicatedRecords: session.duplicatedRecords + duplicatedRecords,
      status: duplicatedRecords > 0 ? ImportSessionStatus.DUPLICATE_DETECTED : ImportSessionStatus.IMPORTED,
      completedAt: new Date()
    }
  });

  await audit({
    entityType: "ImportSession",
    entityId: updated.id,
    action: AuditAction.IMPORT,
    after: updated,
    userId
  });

  return updated;
}

export type ReviewedPdfRow = {
  id: string;
  date: Date;
  valueDate?: Date;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  amount: number;
  balance?: number;
  skip?: boolean;
};

export function transactionHash(row: { date: Date; description: string; reference?: string | null; amount: number }) {
  const stable = [
    row.date.toISOString().slice(0, 10),
    row.description.trim().toLowerCase(),
    (row.reference ?? "").trim().toLowerCase(),
    row.amount.toFixed(2)
  ].join("|");

  return crypto.createHash("sha256").update(stable).digest("hex");
}
