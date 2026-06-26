import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type");
  let filePath: string;

  if (type === "pdf" || type === "excel") {
    const report = await prisma.monthlyReport.findUniqueOrThrow({ where: { id } });
    filePath = type === "pdf" ? report.pdfPath : report.excelPath;
  } else {
    const decoded = Buffer.from(id, "base64url").toString("utf8");
    filePath = path.join(process.cwd(), "storage", "reports", decoded);
  }

  const root = path.join(process.cwd(), "storage", "reports");
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root)) {
    return new NextResponse("Invalid report path.", { status: 400 });
  }

  const file = await readFile(resolved);
  const filename = path.basename(resolved);
  const contentType = filename.endsWith(".pdf")
    ? "application/pdf"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return new NextResponse(file, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`
    }
  });
}
