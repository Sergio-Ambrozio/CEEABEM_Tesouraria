import { Role } from "@prisma/client";

export const roleLabels: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  TREASURER: "Treasurer",
  ACCOUNT_REVIEWER: "Account Reviewer",
  AUDITOR: "Read-only Auditor"
};

export function canWrite(role: Role) {
  return role === Role.ADMINISTRATOR || role === Role.TREASURER;
}

export function canApprove(role: Role) {
  return role === Role.ADMINISTRATOR || role === Role.TREASURER || role === Role.ACCOUNT_REVIEWER;
}

export function canAdminister(role: Role) {
  return role === Role.ADMINISTRATOR;
}
