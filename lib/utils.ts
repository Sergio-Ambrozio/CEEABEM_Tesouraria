import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(value: number | string | { toString(): string }) {
  const numeric = Number(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "CHF"
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function monthName(month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    new Date(2024, month - 1, 1)
  );
}

export function toJson(value: unknown) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "bigint") return item.toString();
    if (item && typeof item === "object" && "toString" in item) {
      const maybeDecimal = item as { constructor?: { name?: string }; toString(): string };
      if (maybeDecimal.constructor?.name === "Decimal") return maybeDecimal.toString();
    }
    return item;
  });
}
