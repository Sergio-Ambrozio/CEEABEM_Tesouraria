import { FileCheck2, RotateCcw } from "lucide-react";
import { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { closeMonthAction, reopenClosingAction } from "@/lib/actions/closing-actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";
import { money, monthName } from "@/lib/utils";

export default async function ClosingsPage() {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const [closings, approvedByMonth] = await Promise.all([
    prisma.monthlyClosing.findMany({
      include: { approvedBy: true, report: true, _count: { select: { transactions: true } } },
      orderBy: [{ year: "desc" }, { month: "desc" }]
    }),
    prisma.transaction.groupBy({
      by: ["status"],
      _count: true
    })
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Monthly Closing</h1>
        <p className="text-sm text-muted-foreground">Close approved months, lock transactions, generate reports, and trigger reviewer email delivery.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Close Month</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={closeMonthAction} className="grid gap-3 md:grid-cols-[120px_140px_1fr_auto]">
            <div className="space-y-2">
              <Label htmlFor="month">Month</Label>
              <Input id="month" name="month" type="number" min={1} max={12} defaultValue={new Date().getMonth() + 1} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="year">Year</Label>
              <Input id="year" name="year" type="number" min={2000} defaultValue={new Date().getFullYear()} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="treasurerNotes">Treasurer Notes</Label>
              <Textarea id="treasurerNotes" name="treasurerNotes" rows={2} />
            </div>
            <div className="flex items-end">
              <Button type="submit">
                <FileCheck2 className="h-4 w-4" />
                Close Month
              </Button>
            </div>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">
            Review readiness: {approvedByMonth.map((row) => `${row.status}: ${row._count}`).join(" · ") || "No transactions imported yet"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Closing Register</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Period</th>
                <th>Status</th>
                <th>Opening</th>
                <th>Closing</th>
                <th>Transactions</th>
                <th>Approved By</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {closings.map((closing) => (
                <tr key={closing.id} className="border-b last:border-0">
                  <td className="py-3">{monthName(closing.month)} {closing.year}</td>
                  <td>{closing.status}</td>
                  <td>{money(closing.openingBalance)}</td>
                  <td>{money(closing.closingBalance)}</td>
                  <td>{closing._count.transactions}</td>
                  <td>{closing.approvedBy?.name ?? "-"}</td>
                  <td className="text-right">
                    <form action={reopenClosingAction}>
                      <input type="hidden" name="id" value={closing.id} />
                      <Button type="submit" variant="outline" size="sm" disabled={closing.status === "UNDER_REVIEW"}>
                        <RotateCcw className="h-4 w-4" />
                        Reopen
                      </Button>
                    </form>
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
