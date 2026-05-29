# MAW Internal Portal – Architektur

> Internes Unternehmensportal der **Mining Adventure World (MAW)**.
> Dieses Dokument ist die verbindliche technische Grundlage. Es wird mit jedem
> größeren Schritt gepflegt und ist die "Source of Truth" für Architektur­
> entscheidungen.

Stand: Phase 1 (Fundament + Modul *MailDesk*)

---

## 1. Gesamtarchitektur

```
┌──────────────────────────────────────────────────────────────────┐
│                        Client (Browser)                            │
│   Next.js App Router · React Server Components · TailwindCSS        │
└───────────────┬──────────────────────────────────┬────────────────┘
                │ (Server Actions / Route Handlers) │
                ▼                                    ▼
┌──────────────────────────────┐      ┌─────────────────────────────┐
│  Next.js (Vercel)            │      │  Externe Webhooks            │
│  - Server Components         │◀─────│  Resend Inbound (E-Mail)     │
│  - Route Handlers (/api)     │      └─────────────────────────────┘
│  - Server Actions            │
│  - Middleware (Auth Guard)   │      ┌─────────────────────────────┐
└──────────┬───────────────────┘      │  Externe Services           │
           │                          │  - Resend  (Send API)       │
           │  service / RLS-Clients   │  - Claude  (Antwortvorschl.) │
           ▼                          └─────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│                          Supabase                                   │
│   PostgreSQL · Auth · Row Level Security · Storage                  │
└──────────────────────────────────────────────────────────────────┘
```

### Grundprinzipien

1. **Security by default** – Jede Tabelle hat RLS aktiviert. Kein Zugriff ohne
   explizite Policy. Der Service-Role-Key wird **ausschließlich** serverseitig
   in dedizierten, geprüften Pfaden (Webhooks, Admin-Operationen) genutzt.
2. **Server-first** – Datenzugriff bevorzugt über Server Components / Server
   Actions / Route Handlers. Der Browser erhält nie den Service-Role-Key.
3. **Modularität** – Jedes fachliche Modul (MailDesk, Mitarbeiter, …) ist in
   `src/modules/<modul>` gekapselt (eigene Komponenten, Services, Typen).
4. **Mandantenfähigkeit über Standorte** – Berechtigungen sind nicht nur
   rollen-, sondern auch standortbezogen (location scoping).
5. **Auditierbarkeit** – Sicherheitsrelevante Aktionen werden in `audit_logs`
   protokolliert (teils per DB-Trigger, teils per Service-Layer).

---

## 2. Tech-Stack & technische Entscheidungen

| Bereich        | Technologie                         | Begründung |
|----------------|-------------------------------------|------------|
| Framework      | Next.js (App Router) + React 19     | SSR/RSC, Server Actions, Vercel-nativ |
| Sprache        | TypeScript (strict)                 | Typsicherheit, Wartbarkeit |
| Styling        | TailwindCSS v4                      | Konsistentes, schnelles UI, Dark-Mode-ready |
| DB / Auth      | Supabase (Postgres, Auth, RLS, Storage) | Managed Postgres + RLS + Auth aus einer Hand |
| Supabase-Client| `@supabase/ssr`                     | Offizielle Cookie-basierte SSR-Integration |
| Validierung    | Zod                                 | Schema-Validierung an API-/Action-Grenzen |
| E-Mail         | Resend (Send API + Inbound Webhook) | Moderne API, Webhook-Support |
| KI             | Anthropic Claude API                | Antwort­vorschläge (nie Auto-Versand) |
| Icons          | lucide-react                        | Konsistente, leichte Icon-Library |
| Hosting        | Vercel                              | Native Next.js-Plattform |

**Bewusste Entscheidungen / Nicht-Ziele in Phase 1:**

- Kein eigenes ORM (Prisma/Drizzle) – wir nutzen den Supabase-Client und SQL-
  Migrationen direkt. Das hält RLS als zentrale Sicherheitsschicht in der DB.
- Kein globaler State-Manager – Server Components + URL-State + lokale State-
  Hooks reichen für Phase 1.
- KI sendet **niemals** automatisch. Claude erzeugt nur Entwürfe, die ein
  Mensch prüfen und manuell versenden muss.

---

## 3. Projektstruktur

```
maw-portal/
├─ docs/                         # Architektur, Setup, Roadmap
├─ supabase/
│  ├─ migrations/                # Versionierte SQL-Migrationen
│  └─ seed.sql                   # Seed (Rollen, Permissions, Demo-Standort)
├─ public/
└─ src/
   ├─ app/                       # Next.js App Router
   │  ├─ (auth)/                 # Öffentliche Auth-Routen (Login)
   │  ├─ (portal)/               # Geschützter Bereich (Shell-Layout)
   │  │  ├─ dashboard/
   │  │  ├─ maildesk/
   │  │  ├─ settings/
   │  │  └─ ...                  # Platzhalter-Module
   │  └─ api/                    # Route Handlers (Webhooks, REST-Endpunkte)
   │     ├─ tickets/
   │     ├─ mail/
   │     ├─ audit/
   │     └─ webhooks/resend/
   ├─ components/                # Wiederverwendbare UI (modulübergreifend)
   │  ├─ ui/                     # Primitive (Button, Card, Badge …)
   │  └─ layout/                 # Sidebar, Topbar, Shell
   ├─ modules/                   # Fachmodule (gekapselt)
   │  └─ maildesk/
   │     ├─ components/
   │     ├─ services/
   │     └─ types.ts
   ├─ lib/                       # Technische Infrastruktur
   │  ├─ supabase/               # Client/Server/Middleware-Clients
   │  ├─ auth/                   # Rollen, Permissions, Guards
   │  ├─ resend/                 # E-Mail-Client
   │  ├─ ai/                     # Claude-Client
   │  └─ audit/                  # Audit-Logging-Service
   ├─ services/                  # Domänenübergreifende Server-Services
   ├─ hooks/                     # React-Hooks (Client)
   ├─ config/                    # Navigation, Module-Flags, Konstanten
   ├─ types/                     # Globale & DB-Typen
   ├─ utils/                     # Reine Hilfsfunktionen
   └─ middleware.ts              # Auth-/Session-Middleware
```

**Modulgrenzen:** UI-Primitive leben in `components/ui`. Fachlogik eines
Moduls lebt unter `modules/<modul>`. Module dürfen `lib`, `components/ui`,
`types` und `utils` nutzen, aber **nicht** untereinander tief importieren –
gemeinsame Logik wandert nach `services` oder `lib`.

---

## 4. Datenmodell

Alle Primärschlüssel sind `uuid` (`gen_random_uuid()`), Zeitstempel sind
`timestamptz`. `created_at` / `updated_at` werden per Trigger gepflegt.

### Identität & Berechtigung
- **profiles** – 1:1 zu `auth.users`. Stamm­daten eines Mitarbeiters.
- **roles** – Rollendefinition (owner, admin, location_manager, employee).
- **permissions** – Atomare Rechte (z. B. `tickets.read`, `tickets.reply`).
- **role_permissions** – n:m zwischen Rollen und Rechten.
- **user_roles** – n:m zwischen Profil und Rolle, **optional pro Standort**
  (`location_id` NULL = global). So kann jemand z. B. `location_manager` nur
  für einen Standort sein.
- **locations** – Standorte (Basis für CRM/Dienstplan + Scoping).

### MailDesk
- **customers** – Absender/Kontakte (über E-Mail dedupliziert).
- **tickets** – Vorgang. Status, Priorität, Zuweisung, Standort.
- **messages** – Nachrichten eines Tickets (inbound/outbound), inkl. Rohdaten.
- **notes** – Interne Notizen an einem Ticket (nicht an Kunden sichtbar).
- **tags** / **ticket_tags** – Frei definierbare Tags (n:m).
- **templates** – Antwortvorlagen.
- **attachments** – Metadaten zu Anhängen (Storage-Referenz), vorbereitet.

### Querschnitt
- **audit_logs** – Append-only-Protokoll sicherheitsrelevanter Aktionen.

> Das vollständige Schema inkl. Indizes und Constraints liegt in
> `supabase/migrations/`. Siehe `0002`–`0005`.

### ENUMs
- `ticket_status`: `open`, `pending`, `resolved`
- `ticket_priority`: `low`, `normal`, `high`, `urgent`
- `message_direction`: `inbound`, `outbound`
- `message_channel`: `email`, `internal`
- `audit_action`: siehe Migration `0005`

---

## 5. Rollen- & Rechtekonzept (RBAC)

Vier Rollen, hierarchisch im Sinne der Reichweite, aber technisch über
**Permissions** entkoppelt (nicht hartcodiert auf Rollennamen prüfen):

| Rolle              | Reichweite                    | Kernrechte (Auszug) |
|--------------------|-------------------------------|---------------------|
| `owner`            | global, alles                 | sämtliche Rechte inkl. Rollenvergabe |
| `admin`            | global, operativ              | alle Module verwalten, Audit lesen |
| `location_manager` | auf zugewiesene Standorte     | Tickets/Teams des Standorts verwalten |
| `employee`         | eigener Standort, eigene Arbeit | Tickets lesen/bearbeiten/antworten |

**Prinzipien**
1. Code prüft **Permissions**, nicht Rollennamen (`can(user, 'tickets.reply')`).
2. Rollen sind nur Bündel von Permissions (`role_permissions`).
3. Standort-Scoping: Eine Permission kann global oder pro Standort gelten.
   `location_manager`/`employee` wirken nur auf ihre `user_roles.location_id`.
4. **Keine Admin-Bypässe** im Code. Privilegierte Operationen laufen über
   geprüfte Server-Pfade; der Service-Role-Key umgeht RLS nur dort bewusst.

Die Permission-Logik existiert doppelt:
- **In der DB** (RLS-Policies + SQL-Helper `auth_has_permission(...)`) als
  harte Sicherheitsgrenze.
- **Im TypeScript-Layer** (`src/lib/auth/permissions.ts`) für UI-Gating und
  frühe Prüfungen (UX), niemals als alleinige Sicherheitsgrenze.

---

## 6. RLS-Konzept

Leitlinien:

1. **Default-Deny:** RLS auf allen Tabellen `ENABLE` + `FORCE`. Ohne Policy
   kein Zugriff.
2. **SQL-Helper als `SECURITY DEFINER`:**
   - `auth_profile_id()` – aktuelle Profil-UUID.
   - `auth_has_permission(perm text, loc uuid default null)` – prüft, ob der
     eingeloggte User das Recht global oder für den Standort hat.
   - `auth_is_owner_or_admin()` – Shortcut für globale Verwaltungsrechte.
   - `auth_manages_location(loc uuid)` – Standort-Scope-Prüfung.
   Helper liegen im `private`-Schema, sind `STABLE` und vermeiden Rekursion in
   Policies.
3. **Lesen vs. Schreiben getrennt:** separate Policies pro Aktion
   (`select`/`insert`/`update`/`delete`).
4. **Standort-Filter:** MailDesk-Tabellen filtern über `tickets.location_id`
   bzw. die Standort-Zuordnung des Users.
5. **audit_logs:** `select` nur für owner/admin (bzw. `audit.read`),
   `insert` nur über `SECURITY DEFINER`-Funktion / Service-Pfad, **kein**
   `update`/`delete` (append-only).
6. **Service-Role:** umgeht RLS – wird nur in `lib/supabase/admin` für klar
   abgegrenzte Operationen (Inbound-Webhook, System-Jobs) verwendet.

Die konkreten Policies liegen in `supabase/migrations/0005_rls.sql`.

---

## 7. API-Architektur

Drei Zugriffsarten, bewusst getrennt:

1. **Server Components** – lesender Zugriff fürs Rendering (RLS-Client mit
   User-Session).
2. **Server Actions** – mutierende UI-Operationen (z. B. Ticket-Status ändern,
   Notiz anlegen). Validierung via Zod, danach Audit-Log.
3. **Route Handlers (`src/app/api`)** – für Maschinen-zu-Maschinen:
   - `POST /api/webhooks/resend` – Inbound-Mails → Ticket erstellen/zuordnen
     (Service-Role, Signaturprüfung).
   - `POST /api/mail/send` – ausgehende Mail über Resend (Permission `tickets.reply`).
   - `/api/tickets/*` – REST-Endpunkte für Ticket-Operationen.
   - `/api/audit/*` – lesen von Audit-Einträgen (Permission `audit.read`).

**Sicherheits-Pipeline jeder mutierenden Operation:**
`Auth-Session prüfen → Input validieren (Zod) → Permission prüfen →
Operation (RLS-Client) → Audit-Log → Antwort`.

---

## 8. Layout & Navigation

- **Shell** (`(portal)/layout.tsx`): persistente **Sidebar** + **Topbar**,
  responsives Verhalten (Sidebar wird auf Mobile zum Off-Canvas-Drawer).
- **Dark Mode** vorbereitet über `class`-Strategie (Tailwind v4 `@custom-variant`).
- **Navigation** ist datengetrieben (`src/config/navigation.ts`). Module tragen
  ein `status`-Flag (`active` | `planned`). Geplante Module erscheinen als
  ausgegraute, nicht klickbare Platzhalter.

**Phase 1 aktiv:** Dashboard, MailDesk, Einstellungen.
**Phase 1 Platzhalter:** Mitarbeiter, Dienstplan, Aufgaben, Checklisten,
Wissensdatenbank, CRM.

---

## 9. Audit-Log

`audit_logs` erfasst mindestens: `actor_profile_id`, `action`, `entity_type`,
`entity_id`, `location_id`, `metadata (jsonb)`, `ip`, `created_at`.

Protokollierte Aktionen (Phase 1): Login, Ticket erstellt/geändert,
Statuswechsel, Antwort gesendet, Notiz erstellt, Rollenänderung, Löschung.

Schreiben über `src/lib/audit/log.ts` (Service-Layer) bzw. DB-Trigger für
kritische Tabellen. Append-only (kein Update/Delete via RLS).

---

## 10. Sicherheits-Checkliste

- [x] RLS auf allen Tabellen (`ENABLE` + `FORCE`)
- [x] Service-Role-Key nur serverseitig, nie im Client-Bundle
- [x] Permission-Prüfung in DB **und** App-Layer
- [x] Eingangs-Webhook mit Signaturprüfung
- [x] Zod-Validierung an allen externen Grenzen
- [x] Secrets ausschließlich via Environment Variables
- [x] Append-only Audit-Log
- [ ] Rate-Limiting für öffentliche Endpunkte (Phase 2)
- [ ] 2FA / SSO (Phase 2)

---

## 11. Roadmap

Siehe [`ROADMAP.md`](./ROADMAP.md).
