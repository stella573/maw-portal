import { z } from "zod";

/**
 * Zentrale, validierte Environment-Konfiguration.
 * Trennt bewusst öffentliche (Client) von server-only Variablen.
 * Server-only Werte werden NIE im Client-Bundle referenziert.
 *
 * Wichtig: Die Auflösung erfolgt LAZY und wirft beim Build NICHT hart.
 * Next.js evaluiert Module bereits beim `next build` (Prerendering). Würde hier
 * direkt `parse()` laufen, bräche der Build ab, sobald die Variablen (z. B. auf
 * Vercel) noch nicht gesetzt sind. Stattdessen: validieren, bei Fehlern warnen
 * und Best-Effort-Werte liefern – der echte Fehler tritt dann klar zur Laufzeit
 * auf (z. B. wenn der Supabase-Client tatsächlich verwendet wird).
 *
 * NEXT_PUBLIC_*-Variablen werden von Next zur Build-Zeit ins Bundle inlined;
 * sie müssen daher in Vercel VOR dem Build gesetzt sein, damit der Client sie
 * zur Laufzeit kennt.
 */

// Toleriert App-URL ohne Schema (z. B. "portal.miningadventureworld.de") –
// ergänzt automatisch https://, damit kein "Invalid url" mehr auftritt.
const appUrl = z
  .string()
  .optional()
  .transform((v) => {
    if (!v || !v.trim()) return "http://localhost:3000";
    const trimmed = v.trim().replace(/\/+$/, "");
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  })
  .pipe(z.string().url());

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: appUrl,
});

const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Optionales Override für das Standard-/Stufe-1-Claude-Modell der
  // Rechnungsverarbeitung. Fehlt es, greift der Default (Haiku → Sonnet-Eskalation).
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  // Schaltet den automatischen Upload zu GetMyInvoices frei. Aus Sicherheits-
  // gründen serverseitig steuerbar (Werte: "true"/"1" aktivieren).
  GETMYINVOICES_AUTO_UPLOAD: z.string().optional(),
  // Personio-Integration (Mitarbeiter-Sync). Optional, damit Build/Start ohne
  // diese Werte nicht bricht – der Sync meldet zur Laufzeit klar, wenn sie fehlen.
  PERSONIO_CLIENT_ID: z.string().min(1).optional(),
  PERSONIO_CLIENT_SECRET: z.string().min(1).optional(),
  // Schützt den Cron-Sync-Endpoint (Vercel Cron sendet diesen als Bearer-Token).
  PERSONIO_SYNC_SECRET: z.string().min(1).optional(),
});

type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | null = null;

function resolvePublicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;

  const raw = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  };

  const parsed = publicSchema.safeParse(raw);
  if (parsed.success) {
    cachedPublic = parsed.data;
    return cachedPublic;
  }

  // Kein harter Crash: warnen und Best-Effort-Werte liefern. Der Supabase-
  // Client schlägt dann zur Laufzeit mit einer klaren Meldung fehl, falls die
  // Werte wirklich fehlen – statt den gesamten Build zu blockieren.
  if (process.env.NODE_ENV !== "production" || typeof window === "undefined") {
    console.warn(
      "[env] NEXT_PUBLIC_* Variablen fehlen oder sind ungültig. " +
        "In Vercel unter Project Settings → Environment Variables setzen. " +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
  }

  cachedPublic = {
    NEXT_PUBLIC_SUPABASE_URL: raw.NEXT_PUBLIC_SUPABASE_URL ?? "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: raw.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    NEXT_PUBLIC_APP_URL: raw.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
  return cachedPublic;
}

/**
 * Öffentliche Env-Variablen. Lazy über Getter aufgelöst, damit der Import nie
 * den Build crasht. API bleibt wie ein einfaches Objekt nutzbar.
 */
export const publicEnv: PublicEnv = {
  get NEXT_PUBLIC_SUPABASE_URL() {
    return resolvePublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return resolvePublicEnv().NEXT_PUBLIC_SUPABASE_ANON_KEY;
  },
  get NEXT_PUBLIC_APP_URL() {
    return resolvePublicEnv().NEXT_PUBLIC_APP_URL;
  },
};

/**
 * Server-Env nur lazy auf dem Server auflösen, damit es nie im Client landet.
 * Wirft bewusst, wenn der zwingend benötigte Service-Role-Key fehlt – wird aber
 * nur in serverseitigen Pfaden zur Laufzeit aufgerufen, nicht beim Build.
 */
export function getServerEnv() {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() darf nur serverseitig aufgerufen werden.");
  }
  return serverSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    GETMYINVOICES_AUTO_UPLOAD: process.env.GETMYINVOICES_AUTO_UPLOAD,
    RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
    PERSONIO_CLIENT_ID: process.env.PERSONIO_CLIENT_ID,
    PERSONIO_CLIENT_SECRET: process.env.PERSONIO_CLIENT_SECRET,
    PERSONIO_SYNC_SECRET: process.env.PERSONIO_SYNC_SECRET,
  });
}
