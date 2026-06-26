import { TransactionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { ruleBasedCategorizationProvider } from "./rule-provider";

const providers = [ruleBasedCategorizationProvider];

export async function categorizeTransaction(transactionId: string) {
  const transaction = await prisma.transaction.findUniqueOrThrow({
    where: { id: transactionId }
  });

  if (transaction.categoryId) {
    return prisma.transaction.update({
      where: { id: transactionId },
      data: { status: TransactionStatus.REVIEWED }
    });
  }

  for (const provider of providers) {
    const suggestion = await provider.suggest(transaction);
    if (suggestion) {
      return prisma.transaction.update({
        where: { id: transactionId },
        data: {
          categoryId: suggestion.categoryId,
          status: TransactionStatus.REVIEWED,
          notes: appendNote(transaction.notes, `Auto categorized by ${provider.name}: ${suggestion.reason}`)
        }
      });
    }
  }

  return transaction;
}

export async function categorizeDraftTransactions(transactionIds: string[]) {
  for (const transactionId of transactionIds) {
    await categorizeTransaction(transactionId);
  }
}

function appendNote(notes: string | null, note: string) {
  return [notes, note].filter(Boolean).join("\n");
}
