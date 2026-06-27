"use client";

import type React from "react";
import { Component } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MonthlyRow = { month: string; income: number; expenses: number; balance: number };
type CategoryRow = { name: string; value: number; color: string };

export function DashboardCharts({
  monthly,
  expensesByCategory,
  incomeByCategory
}: {
  monthly: MonthlyRow[];
  expensesByCategory: CategoryRow[];
  incomeByCategory: CategoryRow[];
}) {
  const safeMonthly = monthly.map((row) => ({
    month: row.month,
    income: finiteNumber(row.income),
    expenses: finiteNumber(row.expenses),
    balance: finiteNumber(row.balance)
  }));
  const safeExpensesByCategory = expensesByCategory
    .map((row) => ({
      name: row.name,
      value: finiteNumber(row.value),
      color: safeColor(row.color)
    }))
    .filter((row) => row.value > 0);
  const safeIncomeByCategory = incomeByCategory
    .map((row) => ({
      name: row.name,
      value: finiteNumber(row.value),
      color: safeColor(row.color)
    }))
    .filter((row) => row.value > 0);

  return (
    <DashboardChartsBoundary>
      <div className="grid gap-4 2xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Income and Expenses</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ChartFrame empty={safeMonthly.every((row) => row.income === 0 && row.expenses === 0)}>
              <ResponsiveContainer>
                <BarChart data={safeMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={48} />
                  <Tooltip />
                  <Bar dataKey="income" fill="#0f766e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" fill="#b45309" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Balance Evolution</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            <ChartFrame empty={safeMonthly.every((row) => row.balance === 0)}>
              <ResponsiveContainer>
                <AreaChart data={safeMonthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={48} />
                  <Tooltip />
                  <Area type="monotone" dataKey="balance" stroke="#0e7490" fill="#67e8f9" fillOpacity={0.35} />
                  <Line type="monotone" dataKey="balance" stroke="#0e7490" />
                </AreaChart>
              </ResponsiveContainer>
            </ChartFrame>
          </CardContent>
        </Card>
        <CategoryPie title="Expenses by Category" data={safeExpensesByCategory} />
        <CategoryPie title="Income by Category" data={safeIncomeByCategory} />
      </div>
    </DashboardChartsBoundary>
  );
}

function CategoryPie({ title, data }: { title: string; data: CategoryRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ChartFrame empty={data.length === 0}>
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" outerRadius={95} label>
                {data.map((row) => (
                  <Cell key={row.name} fill={row.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartFrame>
      </CardContent>
    </Card>
  );
}

function ChartFrame({ children, empty }: { children: React.ReactNode; empty: boolean }) {
  if (empty) {
    return (
      <div className="flex h-full items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        No approved activity yet.
      </div>
    );
  }
  return <>{children}</>;
}

function finiteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function safeColor(value: string) {
  return value?.trim() ? value : "#64748b";
}

class DashboardChartsBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Dashboard charts failed to render", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Dashboard visuals unavailable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-amber-300 bg-amber-50 px-6 text-center text-sm text-amber-900">
              The financial charts could not be rendered for this view. Reload the page to retry while the ledger data remains available below.
            </div>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
