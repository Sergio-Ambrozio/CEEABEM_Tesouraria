import type { Transaction } from "@prisma/client";

export type CategorizationSuggestion = {
  categoryId: string;
  confidence: number;
  reason: string;
};

export interface CategorizationProvider {
  name: string;
  suggest(transaction: Pick<Transaction, "description" | "reference" | "amount">): Promise<CategorizationSuggestion | null>;
}
