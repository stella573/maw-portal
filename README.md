# MAW Internal Portal

Internes Unternehmensportal der **Mining Adventure World (MAW)** – ein
Freizeitunternehmen mit Escape Rooms, Challenge Rooms, LaserTag, Outdoor-
Abenteuern und Events an mehreren Standorten in Deutschland.

Das Portal ist als langfristig produktive, modulare Enterprise-Anwendung
ausgelegt. Phase 1 liefert das technische Fundament und das erste Modul
**MailDesk** (internes Ticketsystem).

---

## Status: Phase 1 – Fundament

Dieses Repository enthält aktuell die **technische Basis**:

- ✅ Architektur & Datenmodell (siehe [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md))
- ✅ Projekt-Scaffold (Next.js App Router, TypeScript, Tailwind v4)
- ✅ Vollständiges DB-Schema als versionierte Migrationen
- ✅ Rollen- & Rechtemodell (RBAC) mit Standort-Scoping
- ✅ RLS-Policies (Default-Deny) + SQL-Helper
- ✅ Audit-Log (append-only)
- ✅ Supabase-Client-Setup (browser/server/admin/middleware) + Auth-Guard
- ✅ Navigation/Layout-Skelett (Sidebar, Topbar, Dark-Mode-ready)
- ✅ API-Skelette: Resend-Inbound-Webhook, Mail-Send

> Das vollständige MailDesk-UI (Inbox, Detail, Antwort-Editor, KI-Vorschläge)
> folgt in Phase 1.3 – siehe [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Tech-Stack

| Bereich   | Technologie |
|-----------|-------------|
| Frontend  | Next.js (App Router), React 19, TypeScript, TailwindCSS v4 |
| Backend   | Supabase (PostgreSQL, Auth, RLS, Storage) |
| E-Mail    | Resend (Send API + Inbound Webhook) |
| KI        | Anthropic Claude (nur Antwort­vorschläge, kein Auto-Versand) |
| Hosting   | Vercel |

---

## Schnellstart

```bash
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # http://localhost:3000
```

Datenbank einrichten und ersten Owner anlegen: siehe
[`docs/SETUP.md`](docs/SETUP.md).

---

## Projektstruktur (Auszug)

```
src/
├─ app/            # Routen (App Router): (auth), (portal), api
├─ components/     # UI- & Layout-Komponenten
├─ modules/        # Fachmodule (z. B. maildesk)
├─ lib/            # Infrastruktur (supabase, auth, resend, ai, audit, env)
├─ services/       # Domänenübergreifende Server-Services
├─ config/         # Navigation & Modul-Flags
├─ types/          # Globale & DB-Typen
└─ utils/          # Hilfsfunktionen
supabase/
├─ migrations/     # Versioniertes SQL-Schema + RLS
└─ seed.sql        # Rollen, Rechte, Demo-Standort
docs/              # ARCHITECTURE, SETUP, ROADMAP
```

Vollständige Beschreibung: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Sicherheit (Kurzfassung)

- RLS auf **allen** Tabellen (`ENABLE` + `FORCE`), Default-Deny.
- Permission-Prüfung in DB **und** App-Layer; Code prüft Rechte, nicht Rollennamen.
- Service-Role-Key nur serverseitig (`lib/supabase/admin.ts`, `server-only`).
- Eingehender Webhook mit Signaturprüfung; Zod-Validierung an allen Grenzen.
- Append-only Audit-Log. KI sendet niemals automatisch.

Details: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §10.

---

## Skripte

| Befehl              | Zweck                       |
|---------------------|-----------------------------|
| `npm run dev`       | Entwicklungsserver          |
| `npm run build`     | Produktions-Build           |
| `npm run start`     | Produktions-Server lokal    |
| `npm run lint`      | ESLint                      |
| `npm run typecheck` | TypeScript ohne Emit        |
