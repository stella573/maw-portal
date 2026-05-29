# Setup-Anleitung – MAW Internal Portal

## Voraussetzungen
- Node.js ≥ 20 (empfohlen 22)
- npm ≥ 10
- Ein Supabase-Projekt
- Resend-Account (für E-Mail)
- Anthropic API Key (für KI-Vorschläge)

## 1. Repository & Abhängigkeiten
```bash
git clone <repo-url>
cd maw-portal
npm install
```

## 2. Environment-Variablen
Kopiere `.env.example` zu `.env.local` und fülle die Werte:
```bash
cp .env.example .env.local
```
| Variable | Beschreibung | Sichtbar im Client? |
|----------|--------------|---------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Projekt-URL | ja |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key | ja |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-Role-Key (umgeht RLS!) | **nein** |
| `RESEND_API_KEY` | Resend Send API Key | nein |
| `RESEND_WEBHOOK_SECRET` | Secret zur Webhook-Signaturprüfung | nein |
| `RESEND_FROM_EMAIL` | Absenderadresse | nein |
| `ANTHROPIC_API_KEY` | Claude API Key | nein |
| `NEXT_PUBLIC_APP_URL` | Basis-URL der App | ja |

> ⚠️ Der `SUPABASE_SERVICE_ROLE_KEY` darf **niemals** in Client-Code
> importiert werden. Nur in serverseitigen Pfaden (`lib/supabase/admin.ts`).

## 3. Datenbank migrieren
Mit der Supabase CLI (empfohlen):
```bash
# einmalig
npm i -g supabase
supabase link --project-ref <dein-project-ref>

# Migrationen ausführen
supabase db push
```
Alternativ: Inhalt von `supabase/migrations/*.sql` in der Reihenfolge der
Dateinamen im Supabase SQL-Editor ausführen, danach `supabase/seed.sql`.

## 4. Ersten Owner anlegen
1. In Supabase Auth einen Benutzer per E-Mail anlegen (oder via Login-Seite
   registrieren, sobald Auth-UI aktiv ist).
2. Der Profil-Trigger legt automatisch eine Zeile in `profiles` an.
3. Owner-Rolle zuweisen (SQL-Editor):
   ```sql
   insert into public.user_roles (profile_id, role_id)
   select p.id, r.id
   from public.profiles p, public.roles r
   where p.email = 'owner@example.com' and r.key = 'owner';
   ```

## 5. Lokale Entwicklung
```bash
npm run dev
# http://localhost:3000
```
Weitere Skripte:
```bash
npm run build      # Produktions-Build
npm run start      # Produktions-Server lokal
npm run lint       # ESLint
npm run typecheck  # TypeScript ohne Emit
```

## 6. Deployment auf Vercel
1. Repo mit Vercel verbinden.
2. Alle Environment-Variablen aus `.env.example` im Vercel-Projekt setzen
   (Production + Preview).
3. Resend Inbound-Webhook auf `https://<deine-domain>/api/webhooks/resend`
   zeigen lassen und `RESEND_WEBHOOK_SECRET` hinterlegen.
4. Deploy auslösen.

## 7. Resend einrichten
- Domain in Resend verifizieren.
- Inbound-Route auf den Webhook-Endpunkt konfigurieren.
- `RESEND_FROM_EMAIL` auf eine verifizierte Adresse setzen.
