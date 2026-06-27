import Link from "next/link";
import { addMonths, startOfMonth, startOfYear } from "date-fns";
import { AlertCircle, ArrowRight, CheckCircle2, CircleDollarSign, FileCheck2, Inbox, TrendingDown, TrendingUp } from "lucide-react";
import { ClosingStatus, TransactionStatus } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardCharts } from "@/components/dashboard-charts";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";
import { money, monthName } from "@/lib/utils";

export default async function DashboardPage() {
  await requireUser();
  const today = new Date();
  const [latestApprovedTransaction, lastClosing] = await Promise.all([
    prisma.transaction.findFirst({
      where: { status: TransactionStatus.APPROVED },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }]
    }),
    prisma.monthlyClosing.findFirst({ orderBy: [{ year: "desc" }, { month: "desc" }] })
  ]);
  const referenceDate =
    latestApprovedTransaction?.date ??
    (lastClosing ? new Date(lastClosing.year, lastClosing.month - 1, 1) : today);
  const monthStart = startOfMonth(referenceDate);
  const monthEnd = addMonths(monthStart, 1);
  const yearStart = startOfYear(referenceDate);
  const rollingStart = addMonths(monthStart, -11);

  const [currentTransactions, ytdTransactions, rollingTransactions, uncategorized, pendingReviews, openClosings, recentTransactions] = await Promise.all([
    prisma.transaction.findMany({
      where: {
        status: TransactionStatus.APPROVED,
        date: { gte: monthStart, lt: monthEnd }
      }
    }),
    prisma.transaction.findMany({
      where: {
        status: TransactionStatus.APPROVED,
        date: { gte: yearStart, lt: monthEnd }
      },
      include: { category: true }
    }),
    prisma.transaction.findMany({
      where: {
        status: TransactionStatus.APPROVED,
        date: { gte: rollingStart, lt: monthEnd }
      },
      include: { category: true }
    }),
    prisma.transaction.count({ where: { categoryId: null } }),
    prisma.transaction.count({ where: { status: { in: [TransactionStatus.DRAFT, TransactionStatus.REVIEWED] } } }),
    prisma.monthlyClosing.count({ where: { status: { in: [ClosingStatus.DRAFT, ClosingStatus.UNDER_REVIEW, ClosingStatus.APPROVED] } } }),
    prisma.transaction.findMany({
      include: { category: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 6
    })
  ]);

  const monthlyRows = Array.from({ length: 12 }, (_, index) => {
    const periodStart = addMonths(monthStart, index - 11);
    const periodEnd = addMonths(periodStart, 1);
    const rows = rollingTransactions.filter((transaction) => transaction.date >= periodStart && transaction.date < periodEnd);
    const income = rows.filter((transaction) => Number(transaction.amount) > 0).reduce((total, transaction) => total + Number(transaction.amount), 0);
    const expenses = Math.abs(rows.filter((transaction) => Number(transaction.amount) < 0).reduce((total, transaction) => total + Number(transaction.amount), 0));
    const balance = rollingTransactions
      .filter((transaction) => transaction.date < periodEnd)
      .reduce((total, transaction) => total + Number(transaction.amount), 0);
    return { month: monthName(periodStart.getMonth() + 1).slice(0, 3), income, expenses, balance };
  });

  const currentIncome = currentTransactions.filter((transaction) => Number(transaction.amount) > 0).reduce((total, transaction) => total + Number(transaction.amount), 0);
  const currentExpenses = currentTransactions.filter((transaction) => Number(transaction.amount) < 0).reduce((total, transaction) => total + Number(transaction.amount), 0);
  const ytdIncome = ytdTransactions.filter((transaction) => Number(transaction.amount) > 0).reduce((total, transaction) => total + Number(transaction.amount), 0);
  const ytdExpenses = ytdTransactions.filter((transaction) => Number(transaction.amount) < 0).reduce((total, transaction) => total + Number(transaction.amount), 0);
  const currentBalance = currentIncome + currentExpenses;
  const ytdBalance = ytdIncome + ytdExpenses;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-950">Treasury Dashboard</h1>
              <Badge tone={pendingReviews > 0 ? "warning" : "success"}>
                {pendingReviews > 0 ? `${pendingReviews} pending` : "Review queue clear"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              {monthName(referenceDate.getMonth() + 1)} {referenceDate.getFullYear()} · Last closing{" "}
              {lastClosing ? `${monthName(lastClosing.month)} ${lastClosing.year} (${lastClosing.status})` : "not started"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/transactions/import">
                <Inbox className="h-4 w-4" />
                Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/transactions">
                Review ledger
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="Current Income" value={money(currentIncome)} icon={TrendingUp} tone="success" />
        <Metric title="Current Expenses" value={money(Math.abs(currentExpenses))} icon={TrendingDown} tone="warning" />
        <Metric title="Month Balance" value={money(currentBalance)} icon={CircleDollarSign} tone={currentBalance >= 0 ? "success" : "danger"} />
        <Metric title="YTD Balance" value={money(ytdBalance)} icon={FileCheck2} tone={ytdBalance >= 0 ? "info" : "danger"} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <DashboardCharts
            monthly={monthlyRows}
            expensesByCategory={categoryRows(ytdTransactions.filter((transaction) => Number(transaction.amount) < 0), true)}
            incomeByCategory={categoryRows(ytdTransactions.filter((transaction) => Number(transaction.amount) > 0))}
          />
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Closing Readiness</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Queue title="Uncategorized" value={uncategorized} href="/transactions?status=DRAFT" />
              <Queue title="Pending Review" value={pendingReviews} href="/transactions" />
              <Queue title="Open Closings" value={openClosings} href="/closings" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent Ledger Activity</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-900">{transaction.description}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{transaction.date.toISOString().slice(0, 10)}</span>
                      <span>{transaction.category?.name ?? "Uncategorized"}</span>
                    </div>
                  </div>
                  <div className={Number(transaction.amount) >= 0 ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-amber-700"}>
                    {money(transaction.amount)}
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">No transactions imported yet.</div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Metric({
  title,
  value,
  icon: Icon,
  tone
}: {
  title: string;
  value: string;
  icon: typeof TrendingUp;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const toneClass = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    danger: "bg-rose-50 text-rose-700",
    info: "bg-cyan-50 text-cyan-700"
  }[tone];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>{title}</CardTitle>
        <span className={`flex h-9 w-9 items-center justify-center rounded-md ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold text-slate-950">{value}</div>
      </CardContent>
    </Card>
  );
}

function Queue({ title, value, href }: { title: string; value: number; href: string }) {
  const clear = value === 0;
  return (
    <Link href={href} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3 transition hover:border-cyan-300 hover:bg-cyan-50/40">
      <div className="flex items-center gap-3">
        {clear ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />}
        <span className="text-sm font-medium text-slate-800">{title}</span>
      </div>
      <span className="text-lg font-semibold text-slate-950">{value}</span>
    </Link>
  );
}

function categoryRows(
  transactions: Array<{ amount: unknown; category: { name: string; color: string } | null }>,
  absolute = false
) {
  const totals = new Map<string, { value: number; color: string }>();
  for (const transaction of transactions) {
    const name = transaction.category?.name ?? "Uncategorized";
    const existing = totals.get(name) ?? { value: 0, color: transaction.category?.color ?? "#64748b" };
    existing.value += absolute ? Math.abs(Number(transaction.amount)) : Number(transaction.amount);
    totals.set(name, existing);
  }
  return Array.from(totals.entries()).map(([name, row]) => ({ name, ...row }));
}
