# MAW Internal Portal – Roadmap

## Phase 1 – Fundament + MailDesk (aktueller Fokus)

### 1.1 Fundament (technische Basis) ✅ in diesem Schritt angelegt
- [x] Projekt-Scaffold (Next.js App Router, TypeScript, Tailwind v4)
- [x] Ordnerstruktur (modulare Enterprise-Struktur)
- [x] Supabase-Client-Setup (browser / server / admin / middleware)
- [x] Auth-Middleware (Session-Refresh + Route-Guard)
- [x] Datenbankschema als versionierte Migrationen
- [x] Rollen- & Rechtemodell (RBAC, Permissions, Standort-Scoping)
- [x] RLS-Policies + SQL-Helper
- [x] Audit-Log-Tabelle + Service
- [x] Navigation/Layout-Skelett (Sidebar, Topbar, Shell, Dark-Mode-ready)
- [x] `.env.example`, README, Setup-Anleitung
- [x] Seed (Rollen, Permissions, Demo-Standort)

### 1.2 Auth & Rollen (nächster Schritt – Implementierung)
- [ ] Login-Seite an Supabase Auth anbinden (Magic Link / Passwort)
- [ ] Profil-Provisioning-Trigger (`auth.users` → `profiles`)
- [ ] Erste Rolle (owner) zuweisen + Onboarding
- [ ] UI-Permission-Gating (`<Can permission="…">`)
- [ ] Login-Audit-Event

### 1.3 MailDesk – Datenfluss
- [ ] Resend Inbound-Webhook: Mail → customer/ticket/message
- [ ] Ticket-Inbox (Liste, Suche, Filter, Status, Priorität, Tags)
- [ ] Ticket-Detail (Verlauf, interne Notizen, Kundeninfo)
- [ ] Antwort-Editor + Versand via Resend Send API
- [ ] Entwürfe
- [ ] Claude-Antwortvorschläge (nur Vorschlag, kein Auto-Versand)
- [ ] Anhänge (Supabase Storage)
- [ ] Templates

### 1.4 Härtung
- [ ] Webhook-Signaturprüfung end-to-end testen
- [ ] RLS-Tests (Policy-Verhalten je Rolle)
- [ ] Audit-Abdeckung verifizieren
- [ ] Vercel-Deployment + Env-Setup

## Phase 2 – Weitere Module
- Mitarbeiterverwaltung
- Dienstplan
- Aufgaben & ToDos
- Checklisten
- Wissensdatenbank
- Standortverwaltung (Ausbau)
- CRM
- Interne Kommunikation
- Rate-Limiting, 2FA/SSO

## Phase 3 – Integrationen & Skalierung
- Externe API-Integrationen
- Reporting / Analytics
- Mehrsprachigkeit (falls nötig)
