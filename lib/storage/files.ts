import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const allowedRoots = new Set(["imports", "attachments", "reports"]);

export type StoredFile = {
  filename: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
};

export async function storeFile(root: "imports" | "attachments" | "reports", file: File, prefix: string): Promise<StoredFile> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = sanitizeFilename(file.name);
  const storagePath = storagePathFor(root, prefix, filename);
  const absolutePath = absoluteStoragePath(storagePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer);

  return {
    filename,
    mimeType: file.type || "application/octet-stream",
    fileSize: buffer.length,
    storagePath
  };
}

export async function readStoredFile(storagePath: string) {
  return readFile(absoluteStoragePath(storagePath));
}

export function absoluteStoragePath(storagePath: string) {
  const normalized = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const [root] = normalized.split(path.sep);
  if (!allowedRoots.has(root)) {
    throw new Error("Invalid storage path.");
  }
  return path.join(storageRoot(), normalized);
}

function storageRoot() {
  if (process.env.FILE_STORAGE_ROOT) return process.env.FILE_STORAGE_ROOT;
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") return "/tmp/ceeabem-storage";
  return path.join(process.cwd(), "storage");
}

function storagePathFor(root: "imports" | "attachments" | "reports", prefix: string, filename: string) {
  return path.join(root, sanitizeFilename(prefix), `${Date.now()}-${filename}`);
}

function sanitizeFilename(filename: string) {
  return filename
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120) || "file";
}
