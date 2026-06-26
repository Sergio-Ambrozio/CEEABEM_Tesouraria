import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { MonthlyClosing, Prisma } from "@prisma/client";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma/db";
import { money, monthName } from "@/lib/utils";

const reportRoot = path.join(process.cwd(), "storage", "reports");
type AnnualTransaction = Prisma.TransactionGetPayload<{ include: { category: true } }>;

export async function generateAnnualReports(year: number) {
  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) },
      status: "APPROVED"
    },
    include: { category: true },
    orderBy: { date: "asc" }
  });
  const closings = await prisma.monthlyClosing.findMany({ where: { year }, orderBy: { month: "asc" } });

  const folder = path.join(reportRoot, String(year));
  await mkdir(folder, { recursive: true });
  const pdfPath = path.join(folder, "annual-report.pdf");
  const excelPath = path.join(folder, "annual-report.xlsx");

  await Promise.all([
    writeAnnualPdf(pdfPath, year, transactions, closings),
    writeAnnualExcel(excelPath, year, transactions, closings)
  ]);

  return { pdfPath, excelPath };
}

async function writeAnnualPdf(
  filePath: string,
  year: number,
  transactions: AnnualTransaction[],
  closings: MonthlyClosing[]
) {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(filePath);
    document.pipe(stream);
    const income = transactions.filter((transaction) => Number(transaction.amount) > 0);
    const expenses = transactions.filter((transaction) => Number(transaction.amount) < 0);

    document.fontSize(20).text("CEEABEM Annual Treasury Report");
    document.moveDown(0.3);
    document.fontSize(12).text(String(year));
    document.moveDown();
    document.text(`Annual Income Statement: ${money(sum(income))}`);
    document.text(`Annual Expense Summary: ${money(sum(expenses))}`);
    document.text(`Net Movement: ${money(sum(transactions))}`);
    document.moveDown();
    document.fontSize(14).text("Monthly Comparison");
    document.fontSize(10);
    for (const month of Array.from({ length: 12 }, (_, index) => index + 1)) {
      const monthly = transactions.filter((transaction) => transaction.date.getMonth() + 1 === month);
      const closing = closings.find((item) => item.month === month);
      document.text(
        `${monthName(month)} | Income ${money(sum(monthly.filter((transaction) => Number(transaction.amount) > 0)))} | Expenses ${money(sum(monthly.filter((transaction) => Number(transaction.amount) < 0)))} | Balance ${money(closing?.closingBalance ?? 0)}`
      );
    }
    document.moveDown();
    document.fontSize(14).text("Category Totals");
    document.fontSize(10);
    for (const row of categoryTotals(transactions)) document.text(`${row.category}: ${money(row.total)}`);
    document.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function writeAnnualExcel(
  filePath: string,
  year: number,
  transactions: AnnualTransaction[],
  closings: MonthlyClosing[]
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CEEABEM Treasury Management System";
  const summary = workbook.addWorksheet("Annual Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 26 },
    { header: "Value", key: "value", width: 18 }
  ];
  summary.addRows([
    { metric: "Year", value: year },
    { metric: "Income", value: sum(transactions.filter((transaction) => Number(transaction.amount) > 0)) },
    { metric: "Expenses", value: sum(transactions.filter((transaction) => Number(transaction.amount) < 0)) },
    { metric: "Net Movement", value: sum(transactions) }
  ]);

  const monthly = workbook.addWorksheet("Monthly Comparison");
  monthly.columns = [
    { header: "Month", key: "month", width: 18 },
    { header: "Income", key: "income", width: 16 },
    { header: "Expenses", key: "expenses", width: 16 },
    { header: "Closing Balance", key: "closingBalance", width: 18 }
  ];
  monthly.addRows(
    Array.from({ length: 12 }, (_, index) => index + 1).map((month) => {
      const rows = transactions.filter((transaction) => transaction.date.getMonth() + 1 === month);
      return {
        month: monthName(month),
        income: sum(rows.filter((transaction) => Number(transaction.amount) > 0)),
        expenses: sum(rows.filter((transaction) => Number(transaction.amount) < 0)),
        closingBalance: Number(closings.find((closing) => closing.month === month)?.closingBalance ?? 0)
      };
    })
  );

  const categories = workbook.addWorksheet("Category Totals");
  categories.columns = [
    { header: "Category", key: "category", width: 28 },
    { header: "Total", key: "total", width: 16 }
  ];
  categories.addRows(categoryTotals(transactions));
  await workbook.xlsx.writeFile(filePath);
}

function sum(transactions: Array<{ amount: unknown }>) {
  return transactions.reduce((total, transaction) => total + Number(transaction.amount), 0);
}

function categoryTotals(transactions: Array<{ amount: unknown; category: { name: string } | null }>) {
  const totals = new Map<string, number>();
  for (const transaction of transactions) {
    const name = transaction.category?.name ?? "Uncategorized";
    totals.set(name, (totals.get(name) ?? 0) + Number(transaction.amount));
  }
  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}
