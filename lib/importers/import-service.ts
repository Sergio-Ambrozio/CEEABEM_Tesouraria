import crypto from "node:crypto";
import { AuditAction, ImportSourceType, TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { audit } from "@/lib/audit";
import { categorizeDraftTransactions } from "@/lib/categorization/categorizer";
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

function transactionHash(row: { date: Date; description: string; reference?: string; amount: number }) {
  const stable = [
    row.date.toISOString().slice(0, 10),
    row.description.trim().toLowerCase(),
    (row.reference ?? "").trim().toLowerCase(),
    row.amount.toFixed(2)
  ].join("|");

  return crypto.createHash("sha256").update(stable).digest("hex");
}
