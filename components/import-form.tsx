"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, Upload } from "lucide-react";
import { importTransactionsAction } from "@/lib/actions/import-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importTransactionsAction, {
    message: undefined,
    error: undefined,
    importedRecords: undefined,
    duplicatedRecords: undefined,
    errorCount: undefined,
    errors: undefined,
    sessionId: undefined
  });
  const [filename, setFilename] = useState("");
  const hasResult = state.importedRecords !== undefined || state.sessionId || state.error;
  const resultTone = useMemo(() => {
    if (state.error) return "danger";
    if ((state.errorCount ?? 0) > 0) return "warning";
    return "success";
  }, [state.error, state.errorCount]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-cyan-700 shadow-sm ring-1 ring-slate-200">
              <FileText className="h-6 w-6" />
            </span>
            <div>
              <Label htmlFor="file" className="text-base text-slate-950">
                Bank statement or export
              </Label>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge tone="info">PDF</Badge>
                <Badge tone="info">CSV</Badge>
                <Badge tone="info">XLSX</Badge>
                {filename ? <span className="text-sm font-medium text-slate-700">{filename}</span> : null}
              </div>
            </div>
          </div>
          <Input
            id="file"
            type="file"
            name="file"
            accept=".pdf,.csv,.xlsx"
            required
            className="max-w-sm bg-white"
            onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? "")}
          />
        </div>
      </div>

      {hasResult ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-start gap-3">
            {state.error ? (
              <AlertCircle className="mt-0.5 h-5 w-5 text-rose-600" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-950">{state.error ?? state.message}</span>
                <Badge tone={resultTone}>{state.error ? "Failed" : "Processed"}</Badge>
              </div>
              {!state.error ? (
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <ResultCount label="Imported" value={state.importedRecords ?? 0} />
                  <ResultCount label="Duplicates" value={state.duplicatedRecords ?? 0} />
                  <ResultCount label="Errors" value={state.errorCount ?? 0} />
                </div>
              ) : null}
              {state.errors?.length ? (
                <ul className="mt-3 space-y-1 text-sm text-amber-800">
                  {state.errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {pending ? "Importing" : "Import file"}
        </Button>
        {state.sessionId ? (
          <Button asChild variant="outline">
            <Link href={`/transactions/import/${state.sessionId}`}>Review extracted rows</Link>
          </Button>
        ) : state.importedRecords ? (
          <Button asChild variant="outline">
            <Link href="/transactions?status=REVIEWED">Review transactions</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function ResultCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-950">{value}</div>
    </div>
  );
}
