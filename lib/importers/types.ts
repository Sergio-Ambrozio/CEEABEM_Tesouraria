export type ImportedTransactionRow = {
  date: Date;
  description: string;
  reference?: string;
  debit: number;
  credit: number;
  amount: number;
  categoryName?: string;
  notes?: string;
};

export type ImportPreview = {
  rows: ImportedTransactionRow[];
  errors: string[];
};

export interface TransactionImporter {
  parse(buffer: Buffer, filename: string): Promise<ImportPreview>;
}
