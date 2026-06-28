import Link from "next/link";
import type React from "react";
import { ArrowLeft, CheckCircle2, FileText, TriangleAlert } from "lucide-react";
import { ImportedTransactionRawStatus, ImportSourceType, Role } from "@prisma/client";
import { confirmPdfImportAction } from "@/lib/actions/import-actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const { id } = await params;
  const session = await prisma.importSession.findUniqueOrThrow({
    where: { id },
    include: {
      rawTransactions: { orderBy: { rowIndex: "asc" } },
      attachments: true
    }
  });
  const errors = session.errorsJson ? (JSON.parse(session.errorsJson) as string[]) : [];
  const editableRows = session.rawTransactions.filter((row) => row.status !== ImportedTransactionRawStatus.IMPORTED);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
              <Link href="/transactions/import">
                <ArrowLeft className="h-4 w-4" />
                Import sessions
              </Link>
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-950">Review Extracted Statement</h1>
              <Badge tone={session.status === "FAILED" ? "danger" : session.lowConfidenceCount > 0 ? "warning" : "info"}>{session.status}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-500">{session.filename}</p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            <ImportStat label="Rows" value={String(session.rawRecordCount)} />
            <ImportStat label="Low confidence" value={String(session.lowConfidenceCount)} />
            <ImportStat label="Duplicates" value={String(session.duplicatedRecords)} />
          </div>
        </div>
      </section>

      {errors.length ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="mb-2 flex items-center gap-2 font-medium">
            <TriangleAlert className="h-4 w-4" />
            Parser notes
          </div>
          <ul className="space-y-1">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Correct Before Import</CardTitle>
        </CardHeader>
        <CardContent>
          {session.sourceType === ImportSourceType.PDF && editableRows.length > 0 ? (
            <form action={confirmPdfImportAction} className="space-y-4">
              <input type="hidden" name="importSessionId" value={session.id} />
              {editableRows.map((row) => {
                const warnings = row.parseWarningsJson ? (JSON.parse(row.parseWarningsJson) as string[]) : [];
                return (
                  <div key={row.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <input type="hidden" name="rowId" value={row.id} />
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-950">Row {row.rowIndex}</span>
                        <Badge tone={row.status === "DUPLICATE" ? "warning" : row.status === "NEEDS_ATTENTION" ? "danger" : "info"}>
                          {Math.round(row.confidence * 100)}% confidence
                        </Badge>
                        {row.status === "DUPLICATE" ? <Badge tone="warning">Possible duplicate</Badge> : null}
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" name={`${row.id}:skip`} defaultChecked={row.status === "DUPLICATE"} />
                        Skip row
                      </label>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[150px_150px_1fr_120px_120px_120px]">
                      <Field label="Date">
                        <Input type="date" name={`${row.id}:date`} defaultValue={dateValue(row.transactionDate)} required />
                      </Field>
                      <Field label="Value date">
                        <Input type="date" name={`${row.id}:valueDate`} defaultValue={dateValue(row.valueDate)} />
                      </Field>
                      <Field label="Description">
                        <Textarea name={`${row.id}:description`} defaultValue={row.description ?? ""} rows={2} required />
                      </Field>
                      <Field label="Debit">
                        <Input type="number" step="0.01" name={`${row.id}:debit`} defaultValue={decimalValue(row.debit)} />
                      </Field>
                      <Field label="Credit">
                        <Input type="number" step="0.01" name={`${row.id}:credit`} defaultValue={decimalValue(row.credit)} />
                      </Field>
                      <Field label="Balance">
                        <Input type="number" step="0.01" name={`${row.id}:balance`} defaultValue={decimalValue(row.balance)} />
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                      <Field label="Reference">
                        <Input name={`${row.id}:reference`} defaultValue={row.reference ?? ""} />
                      </Field>
                      <Field label="Amount">
                        <Input type="number" step="0.01" name={`${row.id}:amount`} defaultValue={decimalValue(row.amount)} required />
                      </Field>
                    </div>
                    {warnings.length ? <p className="mt-3 text-xs text-amber-800">{warnings.join(", ")}</p> : null}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-3">
                <Button type="submit">
                  <CheckCircle2 className="h-4 w-4" />
                  Import reviewed rows
                </Button>
                <Button asChild variant="outline">
                  <Link href="/transactions/import">Cancel</Link>
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <FileText className="h-4 w-4" />
              No editable extracted rows remain for this session.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
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

function dateValue(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : "";
}

function decimalValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return Number(value).toFixed(2);
}
