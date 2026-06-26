import { Role } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";

export default async function AdminPage() {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const [users, auditLogs, emailLogs] = await Promise.all([
    prisma.user.findMany({ orderBy: { email: "asc" } }),
    prisma.auditLog.findMany({ include: { user: true }, orderBy: { createdAt: "desc" }, take: 80 }),
    prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 40 })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="text-sm text-muted-foreground">Role registry, audit trail, and email automation logs.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Users and Roles</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b last:border-0">
                  <td className="py-3">{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email Logs</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {emailLogs.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="py-3">{log.createdAt.toLocaleString()}</td>
                  <td>{log.recipient}</td>
                  <td>{log.subject}</td>
                  <td>{log.status}</td>
                  <td>{log.errorMessage ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b last:border-0">
                  <td className="py-3">{log.createdAt.toLocaleString()}</td>
                  <td>{log.user?.email ?? "System"}</td>
                  <td>{log.action}</td>
                  <td>{log.entityType}</td>
                  <td className="font-mono text-xs">{log.entityId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
