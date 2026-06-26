import { Role, RuleMatchType } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/prisma/db";

let readyPromise: Promise<void> | null = null;

const sqliteSchema = `
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "parentCategoryId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT '#155e75',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_parentCategoryId_fkey" FOREIGN KEY ("parentCategoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "CategorizationRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'CONTAINS',
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategorizationRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "debit" DECIMAL DEFAULT 0,
    "credit" DECIMAL DEFAULT 0,
    "amount" DECIMAL NOT NULL,
    "categoryId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sourceFile" TEXT,
    "notes" TEXT,
    "duplicateHash" TEXT NOT NULL,
    "importSessionId" TEXT,
    "monthlyClosingId" TEXT,
    "lockedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_importSessionId_fkey" FOREIGN KEY ("importSessionId") REFERENCES "ImportSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Transaction_monthlyClosingId_fkey" FOREIGN KEY ("monthlyClosingId") REFERENCES "MonthlyClosing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "ImportSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "uploadDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedRecords" INTEGER NOT NULL DEFAULT 0,
    "duplicatedRecords" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" TEXT,
    "createdById" TEXT,
    CONSTRAINT "ImportSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MonthlyClosing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedById" TEXT,
    "approvedAt" DATETIME,
    "emailSentAt" DATETIME,
    "treasurerNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyClosing_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthlyClosingId" TEXT NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "excelPath" TEXT NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MonthlyReport_monthlyClosingId_fkey" FOREIGN KEY ("monthlyClosingId") REFERENCES "MonthlyClosing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "monthlyClosingId" TEXT,
    "recipient" TEXT NOT NULL,
    "cc" TEXT,
    "subject" TEXT NOT NULL,
    "sentAt" DATETIME,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_monthlyClosingId_fkey" FOREIGN KEY ("monthlyClosingId") REFERENCES "MonthlyClosing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Category_name_parentCategoryId_key" ON "Category"("name", "parentCategoryId");
CREATE INDEX "CategorizationRule_enabled_priority_idx" ON "CategorizationRule"("enabled", "priority");
CREATE UNIQUE INDEX "Transaction_duplicateHash_key" ON "Transaction"("duplicateHash");
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");
CREATE INDEX "Transaction_monthlyClosingId_idx" ON "Transaction"("monthlyClosingId");
CREATE INDEX "MonthlyClosing_status_idx" ON "MonthlyClosing"("status");
CREATE UNIQUE INDEX "MonthlyClosing_month_year_key" ON "MonthlyClosing"("month", "year");
CREATE UNIQUE INDEX "MonthlyReport_monthlyClosingId_key" ON "MonthlyReport"("monthlyClosingId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
`;

const users = [
  ["admin@ceeabem.local", "Administrator", Role.ADMINISTRATOR],
  ["treasurer@ceeabem.local", "Treasurer", Role.TREASURER],
  ["reviewer@ceeabem.local", "Account Reviewer", Role.ACCOUNT_REVIEWER],
  ["auditor@ceeabem.local", "Read-only Auditor", Role.AUDITOR]
] as const;

const categories = [
  { name: "Donations", color: "#0f766e" },
  { name: "Mensalidade", color: "#155e75" },
  { name: "Rent", color: "#b45309" },
  { name: "Internet", color: "#2563eb" },
  { name: "Utilities", color: "#7c3aed" },
  { name: "Events", color: "#be123c" },
  { name: "Books and Materials", color: "#047857" },
  { name: "Bank Fees", color: "#475569" }
];

export async function ensureDatabaseReady() {
  if (!shouldBootstrapDemoSqlite()) return;
  readyPromise ??= bootstrapDemoSqlite();
  return readyPromise;
}

function shouldBootstrapDemoSqlite() {
  return process.env.DEMO_SQLITE_ON_VERCEL === "true" && process.env.DATABASE_URL?.startsWith("file:");
}

async function bootstrapDemoSqlite() {
  const existing = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='User'"
  );
  if (existing.length === 0) {
    for (const statement of sqliteSchema.split(";").map((item) => item.trim()).filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
  }

  const passwordHash = await hashPassword("ChangeMe123!");
  for (const [email, name, role] of users) {
    await prisma.user.upsert({
      where: { email },
      update: { name, role, active: true },
      create: { email, name, role, passwordHash }
    });
  }

  for (const category of categories) {
    const existingCategory = await prisma.category.findFirst({
      where: { name: category.name, parentCategoryId: null }
    });
    if (existingCategory) {
      await prisma.category.update({ where: { id: existingCategory.id }, data: category });
    } else {
      await prisma.category.create({ data: category });
    }
  }

  const ruleSeeds = [
    ["Rent", "Rent"],
    ["Internet", "Internet"],
    ["Donation", "Donations"],
    ["Mensalidade", "Mensalidade"],
    ["Fee", "Bank Fees"]
  ] as const;

  for (const [keyword, categoryName] of ruleSeeds) {
    const existingRule = await prisma.categorizationRule.findFirst({ where: { keyword } });
    if (existingRule) continue;
    const category = await prisma.category.findFirstOrThrow({ where: { name: categoryName } });
    await prisma.categorizationRule.create({
      data: {
        keyword,
        matchType: RuleMatchType.CONTAINS,
        categoryId: category.id,
        priority: 10,
        enabled: true
      }
    });
  }
}
