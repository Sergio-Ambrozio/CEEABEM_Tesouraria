import type { ImportedTransactionRow } from "@/lib/importers/types";

type PdfTextItem = {
  str?: string;
  transform?: number[];
};

export type PdfExtractedRow = ImportedTransactionRow & {
  valueDate?: Date;
  balance?: number;
  confidence: number;
  warnings: string[];
  rawText: string;
};

type TextLine = {
  text: string;
  page: number;
  y: number;
};

export async function parsePdfStatement(buffer: Buffer): Promise<{ rows: PdfExtractedRow[]; errors: string[] }> {
  const lines = await extractTextLines(buffer);
  const rows: PdfExtractedRow[] = [];
  const errors: string[] = [];

  for (const line of lines) {
    const parsed = parseStatementLine(line.text);
    if (parsed) {
      rows.push(parsed);
    }
  }

  if (rows.length === 0) {
    errors.push("No transactions were detected. The statement may be scanned, encrypted, or use an unsupported layout.");
  }

  return { rows, errors };
}

async function extractTextLines(buffer: Buffer): Promise<TextLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const document = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
    useSystemFonts: true
  }).promise;
  const lines: TextLine[] = [];

  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const buckets = new Map<number, string[]>();

    for (const item of content.items as PdfTextItem[]) {
      const text = item.str?.trim();
      const y = item.transform?.[5];
      if (!text || typeof y !== "number") continue;
      const bucket = Math.round(y / 3) * 3;
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), text]);
    }

    for (const [y, fragments] of buckets.entries()) {
      const text = fragments.join(" ").replace(/\s+/g, " ").trim();
      if (text) lines.push({ text, page: pageNumber, y });
    }
  }

  return lines.sort((a, b) => a.page - b.page || b.y - a.y);
}

function parseStatementLine(text: string): PdfExtractedRow | null {
  const dateMatches = Array.from(text.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})\b/g));
  if (dateMatches.length === 0) return null;

  const textWithoutDates = dateMatches.reduce((current, match) => current.replace(match[0], " "), text);
  const amounts = extractAmounts(textWithoutDates);
  if (amounts.length === 0) return null;

  const date = parseDateMatch(dateMatches[0]);
  if (!date) return null;

  const valueDate = dateMatches[1] ? parseDateMatch(dateMatches[1]) ?? undefined : undefined;
  const amount = amounts[0];
  const balance = amounts.length > 1 ? amounts[amounts.length - 1].value : undefined;
  const signedAmount = amount.signedValue;
  const debit = signedAmount < 0 ? Math.abs(signedAmount) : 0;
  const credit = signedAmount > 0 ? signedAmount : 0;
  const warnings: string[] = [];

  let description = textWithoutDates;
  for (const amountMatch of amounts) {
    description = description.replace(amountMatch.raw, " ");
  }
  description = description.replace(/\b(CHF|EUR|USD)\b/gi, " ").replace(/\s+/g, " ").trim();

  if (!description) warnings.push("Missing description");
  if (amounts.length > 2) warnings.push("Multiple monetary values detected");

  const confidence = Math.max(0.45, 0.95 - warnings.length * 0.18 - (amounts.length > 2 ? 0.12 : 0));

  return {
    date,
    valueDate,
    description: description || text,
    reference: referenceFromText(text),
    debit,
    credit,
    amount: signedAmount,
    balance,
    confidence,
    warnings,
    rawText: text
  };
}

function extractAmounts(text: string) {
  const matches = Array.from(text.matchAll(/(?<!\d)([-+])?\s*(?:CHF\s*)?(\d{1,3}(?:[ '\u2019]\d{3})*|\d+)[.,](\d{2})(?!\d)/gi));
  return matches.map((match) => {
    const raw = match[0];
    const normalized = `${match[2].replace(/[ '\u2019]/g, "")}.${match[3]}`;
    const value = Number(normalized);
    const hasCreditHint = /(\+|credit|gutschrift|haben)/i.test(raw) || /(\+|credit|gutschrift|haben)/i.test(text);
    const hasDebitHint = /(-|debit|belastung|soll)/i.test(raw) || /(-|debit|belastung|soll)/i.test(text);
    const signedValue = match[1] === "-" || (hasDebitHint && !hasCreditHint) ? -value : value;
    return { raw, value, signedValue };
  });
}

function parseDateMatch(match: RegExpMatchArray) {
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return date;
}

function referenceFromText(text: string) {
  const match = text.match(/\b(?:ref(?:erence)?|referenz|mitteilung)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\-/.]{4,})/i);
  return match?.[1];
}
