import fs from "node:fs";
import path from "node:path";
import { Download, FileSpreadsheet } from "lucide-react";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { generateAnnualReportAction } from "@/lib/actions/report-actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";
import { monthName } from "@/lib/utils";

export default async function ReportsPage() {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const reports = await prisma.monthlyReport.findMany({
    include: { monthlyClosing: true },
    orderBy: { generatedAt: "desc" }
  });
  const annualFiles = listAnnualReports();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">Monthly and annual reports remain stored for future access and audit review.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Annual Reports</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={generateAnnualReportAction} className="flex max-w-sm gap-2">
            <Input name="year" type="number" min={2000} defaultValue={new Date().getFullYear()} required />
            <Button type="submit">
              <FileSpreadsheet className="h-4 w-4" />
              Generate
            </Button>
          </form>
          <div className="grid gap-2 md:grid-cols-2">
            {annualFiles.map((file) => (
              <a key={file.path} className="rounded-md border p-3 text-sm hover:bg-muted" href={`/api/reports/${encodeURIComponent(file.token)}/download`}>
                {file.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly Reports</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Period</th>
                <th>Generated</th>
                <th className="text-right">Files</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="border-b last:border-0">
                  <td className="py-3">{monthName(report.monthlyClosing.month)} {report.monthlyClosing.year}</td>
                  <td>{report.generatedAt.toLocaleString()}</td>
                  <td className="space-x-2 text-right">
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/reports/${report.id}/download?type=pdf`}>
                        <Download className="h-4 w-4" />
                        PDF
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a href={`/api/reports/${report.id}/download?type=excel`}>
                        <Download className="h-4 w-4" />
                        Excel
                      </a>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function listAnnualReports() {
  const root = path.join(process.cwd(), "storage", "reports");
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{4}$/.test(entry.name))
    .flatMap((entry) => {
      const folder = path.join(root, entry.name);
      return fs
        .readdirSync(folder)
        .filter((file) => file.endsWith(".pdf") || file.endsWith(".xlsx"))
        .map((file) => ({
          path: path.join(folder, file),
          label: `${entry.name} ${file}`,
          token: Buffer.from(path.join(entry.name, file)).toString("base64url")
        }));
    });
}
