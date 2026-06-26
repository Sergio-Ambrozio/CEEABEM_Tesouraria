import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { prisma } from "@/lib/prisma/db";
import { money, monthName } from "@/lib/utils";

const reportRoot = path.join(process.cwd(), "storage", "reports");

export async function generateMonthlyReport(monthlyClosingId: string) {
  const closing = await prisma.monthlyClosing.findUniqueOrThrow({
    where: { id: monthlyClosingId },
    include: {
      transactions: { include: { category: true }, orderBy: { date: "asc" } },
      approvedBy: true
    }
  });

  const folder = path.join(reportRoot, `${closing.year}-${String(closing.month).padStart(2, "0")}`);
  await mkdir(folder, { recursive: true });

  const pdfPath = path.join(folder, "monthly-report.pdf");
  const excelPath = path.join(folder, "monthly-transactions.xlsx");

  await Promise.all([writeMonthlyPdf(pdfPath, closing), writeMonthlyExcel(excelPath, closing)]);

  return prisma.monthlyReport.upsert({
    where: { monthlyClosingId },
    update: { pdfPath, excelPath, generatedAt: new Date() },
    create: { monthlyClosingId, pdfPath, excelPath }
  });
}

async function writeMonthlyPdf(filePath: string, closing: Awaited<ReturnType<typeof getClosingShape>>) {
  await new Promise<void>((resolve, reject) => {
    const document = new PDFDocument({ margin: 48 });
    const stream = fs.createWriteStream(filePath);
    document.pipe(stream);

    const income = closing.transactions.filter((transaction) => Number(transaction.amount) > 0);
    const expenses = closing.transactions.filter((transaction) => Number(transaction.amount) < 0);
    const totals = categoryTotals(closing.transactions);

    document.fontSize(20).text("CEEABEM Monthly Treasury Report");
    document.moveDown(0.3);
    document.fontSize(12).text(`${monthName(closing.month)} ${closing.year}`);
    document.moveDown();
    document.text(`Opening balance: ${money(closing.openingBalance)}`);
    document.text(`Income: ${money(sum(income))}`);
    document.text(`Expenses: ${money(sum(expenses))}`);
    document.text(`Closing balance: ${money(closing.closingBalance)}`);
    document.text(`Status: ${closing.status}`);
    if (closing.approvedBy) document.text(`Approved by: ${closing.approvedBy.name}`);
    if (closing.treasurerNotes) {
      document.moveDown();
      document.fontSize(14).text("Treasurer Notes");
      document.fontSize(11).text(closing.treasurerNotes);
    }

    document.moveDown();
    document.fontSize(14).text("Category Totals");
    document.fontSize(10);
    for (const row of totals) {
      document.text(`${row.category}: ${money(row.total)}`);
    }

    document.moveDown();
    document.fontSize(14).text("Transactions");
    document.fontSize(9);
    for (const transaction of closing.transactions) {
      document.text(
        `${transaction.date.toISOString().slice(0, 10)} | ${transaction.description} | ${transaction.category?.name ?? "Uncategorized"} | ${money(transaction.amount)}`
      );
    }

    document.end();
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

async function writeMonthlyExcel(filePath: string, closing: Awaited<ReturnType<typeof getClosingShape>>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CEEABEM Treasury Management System";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 20 }
  ];
  summary.addRows([
    { metric: "Month", value: `${monthName(closing.month)} ${closing.year}` },
    { metric: "Opening Balance", value: Number(closing.openingBalance) },
    { metric: "Income", value: sum(closing.transactions.filter((transaction) => Number(transaction.amount) > 0)) },
    { metric: "Expenses", value: sum(closing.transactions.filter((transaction) => Number(transaction.amount) < 0)) },
    { metric: "Closing Balance", value: Number(closing.closingBalance) },
    { metric: "Status", value: closing.status }
  ]);

  const transactions = workbook.addWorksheet("Transactions");
  transactions.columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Description", key: "description", width: 42 },
    { header: "Reference", key: "reference", width: 18 },
    { header: "Debit", key: "debit", width: 14 },
    { header: "Credit", key: "credit", width: 14 },
    { header: "Amount", key: "amount", width: 14 },
    { header: "Category", key: "category", width: 22 },
    { header: "Status", key: "status", width: 12 },
    { header: "Notes", key: "notes", width: 40 }
  ];
  transactions.addRows(
    closing.transactions.map((transaction) => ({
      date: transaction.date,
      description: transaction.description,
      reference: transaction.reference,
      debit: Number(transaction.debit),
      credit: Number(transaction.credit),
      amount: Number(transaction.amount),
      category: transaction.category?.name,
      status: transaction.status,
      notes: transaction.notes
    }))
  );

  const categories = workbook.addWorksheet("Category Totals");
  categories.columns = [
    { header: "Category", key: "category", width: 28 },
    { header: "Total", key: "total", width: 16 }
  ];
  categories.addRows(categoryTotals(closing.transactions));

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
    .sort((a, b) => a.category.localeCompare(b.category));
}

async function getClosingShape(monthlyClosingId: string) {
  return prisma.monthlyClosing.findUniqueOrThrow({
    where: { id: monthlyClosingId },
    include: {
      transactions: { include: { category: true }, orderBy: { date: "asc" } },
      approvedBy: true
    }
  });
}
