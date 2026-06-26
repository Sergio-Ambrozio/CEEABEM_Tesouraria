"use client";

import type React from "react";
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
  return (
    <div className="grid gap-4 2xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Monthly Income and Expenses</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          <ChartFrame empty={monthly.every((row) => row.income === 0 && row.expenses === 0)}>
            <ResponsiveContainer>
              <BarChart data={monthly}>
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
          <ChartFrame empty={monthly.every((row) => row.balance === 0)}>
            <ResponsiveContainer>
              <AreaChart data={monthly}>
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
      <CategoryPie title="Expenses by Category" data={expensesByCategory} />
      <CategoryPie title="Income by Category" data={incomeByCategory} />
    </div>
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
