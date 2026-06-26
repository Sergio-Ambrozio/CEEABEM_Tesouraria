import ExcelJS from "exceljs";
import type { ImportedTransactionRow, ImportPreview, TransactionImporter } from "./types";

const headerAliases: Record<string, string[]> = {
  date: ["date", "booking date", "transaction date", "value date", "data", "data valor", "data movimento", "datum"],
  description: [
    "description",
    "details",
    "memo",
    "text",
    "transaction",
    "booking text",
    "narrative",
    "descricao",
    "descrição",
    "descritivo",
    "historico",
    "histórico",
    "movimento"
  ],
  reference: ["reference", "ref", "reference number", "id", "document", "transaction id", "referencia", "referência", "numero", "número"],
  debit: ["debit", "withdrawal", "expense", "paid out", "debit amount", "outflow", "debito", "débito", "saida", "saída", "despesa"],
  credit: ["credit", "deposit", "income", "paid in", "credit amount", "inflow", "credito", "crédito", "entrada", "receita"],
  amount: ["amount", "value", "net amount", "signed amount", "movement", "valor", "montante", "quantia", "valor eur", "valor chf"],
  categoryName: ["category", "categoria", "rubrica"],
  notes: ["notes", "note", "observacoes", "observações"]
};

export const spreadsheetImporter: TransactionImporter = {
  async parse(buffer, filename) {
    const workbook = new ExcelJS.Workbook();
    let records: Record<string, unknown>[];
    if (filename.toLowerCase().endsWith(".csv")) {
      records = parseCsv(buffer.toString("utf8"));
    } else {
      const payload = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      await workbook.xlsx.load(payload as unknown as never);
      const sheet = workbook.worksheets[0];
      if (!sheet) return { rows: [], errors: [`${filename}: no worksheet was found.`] };
      records = worksheetToRecords(sheet);
    }

    const rows: ImportedTransactionRow[] = [];
    const errors: string[] = [];

    records.forEach((record, index) => {
      const rowNumber = index + 2;
      const normalized = normalizeRecord(record);
      const date = parseDate(normalized.date);
      const description = String(normalized.description ?? "").trim();
      const debit = parseMoney(normalized.debit);
      const credit = parseMoney(normalized.credit);
      const explicitAmount = parseMoney(normalized.amount);
      const amount = explicitAmount !== 0 || normalized.amount ? explicitAmount : credit - debit;

      if (!date) {
        errors.push(`${filename}: row ${rowNumber} has an invalid date.`);
        return;
      }
      if (!description) {
        errors.push(`${filename}: row ${rowNumber} is missing a description.`);
        return;
      }
      if (amount === 0 && debit === 0 && credit === 0) {
        errors.push(`${filename}: row ${rowNumber} has no amount, debit, or credit.`);
        return;
      }

      rows.push({
        date,
        description,
        reference: optionalString(normalized.reference),
        debit,
        credit,
        amount,
        categoryName: optionalString(normalized.categoryName),
        notes: optionalString(normalized.notes)
      });
    });

    return { rows, errors };
  }
};

function parseCsv(text: string) {
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === delimiter && !quoted) {
      row.push(current);
      current = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }
    current += char;
  }

  row.push(current);
  if (row.some((cell) => cell.trim())) rows.push(row);

  const [headers = [], ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), cells[index]?.trim() ?? ""]))
  );
}

function detectDelimiter(text: string) {
  const header = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  return candidates
    .map((delimiter) => ({ delimiter, count: header.split(delimiter).length }))
    .sort((a, b) => b.count - a.count)[0].delimiter;
}

function worksheetToRecords(sheet: ExcelJS.Worksheet) {
  const headers = (sheet.getRow(1).values as unknown[])
    .slice(1)
    .map((value) => String(value ?? "").trim());
  const records: Record<string, unknown>[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const record: Record<string, unknown> = {};
    headers.forEach((header, index) => {
      record[header] = cellValue(row.getCell(index + 1).value);
    });
    records.push(record);
  });

  return records;
}

function cellValue(value: unknown): unknown {
  if (value && typeof value === "object") {
    if ("text" in value) return (value as { text?: unknown }).text;
    if ("result" in value) return (value as { result?: unknown }).result;
    if ("richText" in value) {
      return (value as { richText?: Array<{ text?: string }> }).richText?.map((part) => part.text ?? "").join("");
    }
  }
  return value;
}

function normalizeRecord(record: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(record)) {
    const key = rawKey.trim().toLowerCase();
    const canonical = Object.entries(headerAliases).find(([, aliases]) => aliases.includes(key))?.[0];
    if (canonical) output[canonical] = value;
  }
  return output;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value;
  if (typeof value === "number") {
    return new Date(Math.round((value - 25569) * 86400 * 1000));
  }
  if (value && typeof value === "object" && "result" in value) {
    return parseDate((value as { result?: unknown }).result);
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const dotted = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dotted) {
    const year = dotted[3].length === 2 ? Number(`20${dotted[3]}`) : Number(dotted[3]);
    const date = new Date(year, Number(dotted[2]) - 1, Number(dotted[1]));
    return Number.isNaN(date.valueOf()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function parseMoney(value: unknown) {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  const negative = raw.startsWith("(") && raw.endsWith(")");
  let text = raw
    .replace(/[()]/g, "")
    .replace(/['\s]/g, "")
    .replace(/[^\d,.-]/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma > dot) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else {
    text = text.replace(/,/g, "");
  }
  const number = Number(text);
  if (negative && Number.isFinite(number)) return -Math.abs(number);
  return Number.isFinite(number) ? number : 0;
}

function optionalString(value: unknown) {
  const text = String(value ?? "").trim();
  return text || undefined;
}
