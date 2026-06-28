import { Role } from "@prisma/client";
import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";

export default async function ImportPage() {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const sessions = await prisma.importSession.findMany({ orderBy: { uploadDate: "desc" }, take: 20 });
  const latest = sessions[0];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">Transaction Import</h1>
            <p className="mt-1 text-sm text-slate-500">Upload PostFinance PDF statements for review, or import CSV and Excel bank exports directly.</p>
          </div>
          {latest ? (
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <ImportStat label="Last imported" value={String(latest.importedRecords)} />
              <ImportStat label="Duplicates" value={String(latest.duplicatedRecords)} />
              <ImportStat label="Errors" value={String(latest.errorsJson ? JSON.parse(latest.errorsJson).length : 0)} />
            </div>
          ) : null}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Upload Bank Export</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportForm />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Import Sessions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2">File</th>
                <th>Uploaded</th>
                <th>Imported</th>
                <th>Status</th>
                <th>Duplicates</th>
                <th>Errors</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-3 font-medium text-slate-900">{session.filename}</td>
                  <td className="text-slate-500">{session.uploadDate.toLocaleString()}</td>
                  <td>
                    <Badge tone="success">{session.importedRecords || session.parsedRecordCount}</Badge>
                  </td>
                  <td>
                    <Badge tone={session.status === "FAILED" ? "danger" : session.status === "IMPORTED" ? "success" : "info"}>{session.status}</Badge>
                  </td>
                  <td>
                    <Badge tone={session.duplicatedRecords > 0 ? "warning" : "neutral"}>{session.duplicatedRecords}</Badge>
                  </td>
                  <td>
                    <Badge tone={session.errorsJson ? "danger" : "neutral"}>{session.errorsJson ? JSON.parse(session.errorsJson).length : 0}</Badge>
                  </td>
                  <td className="text-right">
                    {session.sourceType === "PDF" ? (
                      <Link href={`/transactions/import/${session.id}`} className="text-sm font-medium text-cyan-700 hover:text-cyan-900">
                        Review
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-slate-500">
                    No import sessions yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function ImportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}
