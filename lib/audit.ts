import { AuditAction } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { toJson } from "@/lib/utils";

type AuditInput = {
  entityType: string;
  entityId: string;
  action: AuditAction;
  before?: unknown;
  after?: unknown;
  userId?: string;
};

export async function audit({ entityType, entityId, action, before, after, userId }: AuditInput) {
  await prisma.auditLog.create({
    data: {
      entityType,
      entityId,
      action,
      beforeJson: before === undefined ? undefined : toJson(before),
      afterJson: after === undefined ? undefined : toJson(after),
      userId
    }
  });
}
