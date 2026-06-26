"use server";

import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { generateAnnualReports } from "@/lib/reports/annual-report";

export async function generateAnnualReportAction(formData: FormData) {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER]);
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2000) throw new Error("Choose a valid year.");
  await generateAnnualReports(year);
}
