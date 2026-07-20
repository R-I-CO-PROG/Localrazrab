import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat("ru-RU").format(num);
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + "…";
}

/** Русская плюрализация: pluralizeRu(1,["концепция","концепции","концепций"]) → "концепция". */
export function pluralizeRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

/** «5 концепций», «1 концепция». */
export function conceptCountLabel(n: number): string {
  return `${n} ${pluralizeRu(n, ["концепция", "концепции", "концепций"])}`;
}

/** «3 визуализации», «1 визуализация». */
export function visualizationCountLabel(n: number): string {
  return `${n} ${pluralizeRu(n, ["визуализация", "визуализации", "визуализаций"])}`;
}
