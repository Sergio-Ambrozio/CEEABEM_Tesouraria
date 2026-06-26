import { PrismaClient, Role, RuleMatchType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

async function main() {
  const passwordHash = await bcrypt.hash("ChangeMe123!", 12);

  for (const [email, name, role] of users) {
    await prisma.user.upsert({
      where: { email },
      update: { name, role, active: true },
      create: { email, name, role, passwordHash }
    });
  }

  for (const category of categories) {
    const existing = await prisma.category.findFirst({
      where: { name: category.name, parentCategoryId: null }
    });
    if (existing) {
      await prisma.category.update({ where: { id: existing.id }, data: category });
    } else {
      await prisma.category.create({ data: category });
    }
  }

  const ruleSeeds = [
    ["Rent", "Rent"],
    ["Internet", "Internet"],
    ["Donation", "Donations"],
    ["Fee", "Bank Fees"]
  ] as const;

  for (const [keyword, categoryName] of ruleSeeds) {
    const category = await prisma.category.findFirstOrThrow({ where: { name: categoryName } });
    const existing = await prisma.categorizationRule.findFirst({ where: { keyword } });
    if (!existing) {
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
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
