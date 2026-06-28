"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { createPdfImportSession, importReviewedPdfRows, importTransactionsFromFile, type ReviewedPdfRow } from "@/lib/importers/import-service";

type ImportState = {
  message?: string;
  error?: string;
  importedRecords?: number;
  duplicatedRecords?: number;
  errorCount?: number;
  errors?: string[];
  sessionId?: string;
};

export async function importTransactionsAction(_prevState: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV or XLSX file to import." };
  }

  try {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const session = extension === "pdf" ? await createPdfImportSession(file, user.id) : await importTransactionsFromFile(file, user.id);
    revalidatePath("/transactions");
    revalidatePath("/transactions/import");
    revalidatePath("/dashboard");
    const errors = session.errorsJson ? (JSON.parse(session.errorsJson) as string[]) : [];
    return {
      message: extension === "pdf" ? "PDF parsed for review" : "Import complete",
      importedRecords: session.importedRecords,
      duplicatedRecords: session.duplicatedRecords,
      errorCount: errors.length,
      errors: errors.slice(0, 8),
      sessionId: session.id
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Import failed." };
  }
}

export async function confirmPdfImportAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const importSessionId = String(formData.get("importSessionId") ?? "");
  const rowIds = formData.getAll("rowId").map(String);
  const rows: ReviewedPdfRow[] = rowIds.map((id) => {
    const debit = numberFromForm(formData.get(`${id}:debit`));
    const credit = numberFromForm(formData.get(`${id}:credit`));
    const amountField = formData.get(`${id}:amount`);
    const amount = amountField ? numberFromForm(amountField) : credit - debit;
    return {
      id,
      date: dateFromForm(formData.get(`${id}:date`)),
      valueDate: optionalDateFromForm(formData.get(`${id}:valueDate`)),
      description: String(formData.get(`${id}:description`) ?? "").trim(),
      reference: String(formData.get(`${id}:reference`) ?? "").trim() || undefined,
      debit,
      credit,
      amount,
      balance: optionalNumberFromForm(formData.get(`${id}:balance`)),
      skip: formData.get(`${id}:skip`) === "on"
    };
  });

  await importReviewedPdfRows(importSessionId, rows, user.id);
  revalidatePath("/transactions");
  revalidatePath("/transactions/import");
  revalidatePath(`/transactions/import/${importSessionId}`);
  revalidatePath("/dashboard");
  redirect("/transactions?status=DRAFT");
}

function dateFromForm(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  const date = new Date(`${text}T00:00:00`);
  if (!text || Number.isNaN(date.getTime())) throw new Error("Every imported row needs a valid transaction date.");
  return date;
}

function optionalDateFromForm(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  if (!text) return undefined;
  return dateFromForm(value);
}

function numberFromForm(value: FormDataEntryValue | null) {
  const numeric = Number(String(value ?? "0").replace(",", "."));
  if (!Number.isFinite(numeric)) throw new Error("Imported rows contain an invalid amount.");
  return numeric;
}

function optionalNumberFromForm(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  if (!text) return undefined;
  return numberFromForm(value);
}
