import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";
import { readStoredFile } from "@/lib/storage/files";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const { id } = await params;
  const attachment = await prisma.transactionAttachment.findUniqueOrThrow({ where: { id } });
  if (attachment.deletedAt) {
    return new NextResponse("Attachment has been deleted.", { status: 404 });
  }

  const buffer = await readStoredFile(attachment.storagePath);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": attachment.mimeType,
      "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
