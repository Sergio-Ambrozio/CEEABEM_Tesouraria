import { CheckCircle2, Lock } from "lucide-react";
import { Role, TransactionStatus } from "@prisma/client";
import { TransactionReviewForm } from "@/components/transaction-review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { approveTransactionAction } from "@/lib/actions/transaction-actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";
import { money } from "@/lib/utils";

export default async function TransactionsPage({
  searchParams
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const params = await searchParams;
  const status = params?.status as TransactionStatus | undefined;
  const [transactions, categories] = await Promise.all([
    prisma.transaction.findMany({
      where: status && Object.values(TransactionStatus).includes(status) ? { status } : {},
      include: { category: true, monthlyClosing: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 150
    }),
    prisma.category.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  ]);
  const totals = {
    draft: transactions.filter((transaction) => transaction.status === TransactionStatus.DRAFT).length,
    reviewed: transactions.filter((transaction) => transaction.status === TransactionStatus.REVIEWED).length,
    approved: transactions.filter((transaction) => transaction.status === TransactionStatus.APPROVED).length
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Transaction Review</h1>
            <p className="mt-1 text-sm text-slate-500">Imported records move from categorization to approval before monthly closing.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={totals.draft > 0 ? "warning" : "neutral"}>{totals.draft} draft</Badge>
            <Badge tone={totals.reviewed > 0 ? "info" : "neutral"}>{totals.reviewed} reviewed</Badge>
            <Badge tone="success">{totals.approved} approved</Badge>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Ledger Workbench</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {transactions.map((transaction) => {
            const locked = transaction.monthlyClosing?.status === "APPROVED" || transaction.monthlyClosing?.status === "SENT";
            return (
              <div key={transaction.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-3 grid gap-2 md:grid-cols-[140px_1fr_120px_130px] md:items-center">
                  <div className="text-sm text-slate-500">{transaction.date.toISOString().slice(0, 10)}</div>
                  <div>
                    <div className="font-medium text-slate-950">{transaction.description}</div>
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span>{transaction.reference ?? "No reference"}</span>
                      <Badge tone={transaction.category ? "info" : "warning"}>{transaction.category?.name ?? "Uncategorized"}</Badge>
                    </div>
                  </div>
                  <div className={Number(transaction.amount) >= 0 ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>
                    {money(transaction.amount)}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    {locked ? <Lock className="h-4 w-4" /> : null}
                    <Badge tone={transaction.status === "APPROVED" ? "success" : transaction.status === "REVIEWED" ? "info" : "warning"}>
                      {transaction.status}
                    </Badge>
                  </div>
                </div>
                <TransactionReviewForm
                  transaction={{
                    id: transaction.id,
                    categoryId: transaction.categoryId,
                    notes: transaction.notes,
                    description: transaction.description
                  }}
                  categories={categories.map((category) => ({ id: category.id, name: category.name }))}
                  disabled={locked}
                />
                <div className="mt-3 flex justify-end">
                  <form action={approveTransactionAction}>
                    <input type="hidden" name="id" value={transaction.id} />
                    <Button type="submit" size="sm" disabled={locked || transaction.status === TransactionStatus.APPROVED || !transaction.categoryId}>
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                  </form>
                </div>
              </div>
            );
          })}
          {transactions.length === 0 ? <p className="text-sm text-muted-foreground">No transactions found.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
