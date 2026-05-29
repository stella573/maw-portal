import { Resend } from "resend";
import { getServerEnv } from "@/lib/env";

/**
 * Resend-Client für ausgehende E-Mails (Send API).
 * Lazy initialisiert, damit fehlende Keys erst beim tatsächlichen Versand auffallen.
 */
let cached: Resend | null = null;

export function getResend(): Resend {
  const { RESEND_API_KEY } = getServerEnv();
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY ist nicht gesetzt.");
  }
  if (!cached) cached = new Resend(RESEND_API_KEY);
  return cached;
}

export function getFromEmail(): string {
  const { RESEND_FROM_EMAIL } = getServerEnv();
  if (!RESEND_FROM_EMAIL) {
    throw new Error("RESEND_FROM_EMAIL ist nicht gesetzt.");
  }
  return RESEND_FROM_EMAIL;
}
