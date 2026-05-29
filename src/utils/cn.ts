import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind-bewusstes Zusammenführen von Klassennamen. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
