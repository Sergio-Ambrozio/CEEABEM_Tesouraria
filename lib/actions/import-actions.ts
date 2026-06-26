"use server";

import { revalidatePath } from "next/cache";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { importTransactionsFromFile } from "@/lib/importers/import-service";

type ImportState = {
  message?: string;
  error?: string;
  importedRecords?: number;
  duplicatedRecords?: number;
  errorCount?: number;
  errors?: string[];
};

export async function importTransactionsAction(_prevState: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a CSV or XLSX file to import." };
  }

  try {
    const session = await importTransactionsFromFile(file, user.id);
    revalidatePath("/transactions");
    revalidatePath("/transactions/import");
    revalidatePath("/dashboard");
    const errors = session.errorsJson ? (JSON.parse(session.errorsJson) as string[]) : [];
    return {
      message: `Import complete`,
      importedRecords: session.importedRecords,
      duplicatedRecords: session.duplicatedRecords,
      errorCount: errors.length,
      errors: errors.slice(0, 8)
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Import failed." };
  }
}
