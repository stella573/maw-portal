# Supabase verbinden – Schritt für Schritt

Diese Anleitung verbindet das MAW Internal Portal mit einem echten
Supabase-Projekt. Sie ergänzt [`SETUP.md`](./SETUP.md).

> ⚠️ **Secrets niemals in den Chat, ins Git oder ins Frontend.** Der
> `service_role`-Key umgeht RLS und gehört ausschließlich in `.env.local`
> (lokal) bzw. in die Vercel-Environment-Variablen (Server-Scope).

---

## 1. Supabase-Projekt anlegen
1. Auf <https://supabase.com/dashboard> ein Projekt erstellen.
2. Region: EU (z. B. Frankfurt) – passend zum Unternehmenssitz.
3. Ein starkes DB-Passwort vergeben und sicher ablegen.

## 2. Zugangsdaten holen
Im Dashboard unter **Project Settings → API**:

| Wert | Env-Variable | Scope |
|------|--------------|-------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | öffentlich |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | öffentlich |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` | **server-only** |

Die **Project-Ref** (Teil der URL `https://<ref>.supabase.co`) brauchst du
für die CLI.

## 3. `.env.local` befüllen
```bash
cp .env.example .env.local
# Werte aus Schritt 2 eintragen (mindestens die drei Supabase-Variablen)
```

## 4. Migrationen anwenden

### Variante A – Supabase CLI (empfohlen)
```bash
npm install -g supabase        # falls noch nicht vorhanden
supabase login                 # öffnet Browser-Login
supabase link --project-ref <DEIN_PROJECT_REF>
supabase db push               # führt supabase/migrations/* in Reihenfolge aus
```
Seed (Rollen, Rechte, Demo-Standort):
```bash
supabase db seed               # nutzt supabase/config.toml → seed.sql
# oder den Inhalt von supabase/seed.sql im SQL-Editor ausführen
```

### Variante B – SQL-Editor (ohne CLI)
Im Dashboard unter **SQL Editor** die Dateien **in dieser Reihenfolge**
nacheinander ausführen:
1. `supabase/migrations/0001_extensions_and_enums.sql`
2. `supabase/migrations/0002_core_identity.sql`
3. `supabase/migrations/0003_maildesk.sql`
4. `supabase/migrations/0004_audit.sql`
5. `supabase/migrations/0005_rls.sql`
6. `supabase/seed.sql`

## 5. Verbindung prüfen
```bash
npm run dev
# http://localhost:3000  → leitet auf /login
```
- `GET http://localhost:3000/api/health` muss `{"status":"ok"}` liefern.
- Login-Seite lädt ohne Konsolenfehler → Supabase-Client ist korrekt
  konfiguriert.

## 6. Ersten Owner anlegen
1. Im Dashboard **Authentication → Users** einen Benutzer per E-Mail anlegen
   (oder sich über die Login-Seite per Magic Link registrieren).
2. Der Trigger `handle_new_user` legt automatisch eine Zeile in `profiles` an.
3. Owner-Rolle zuweisen (SQL-Editor):
   ```sql
   insert into public.user_roles (profile_id, role_id)
   select p.id, r.id
   from public.profiles p, public.roles r
   where p.email = 'DEINE_EMAIL' and r.key = 'owner';
   ```

## 7. Typen generieren (optional, empfohlen)
Sobald das Schema steht, die hand-gepflegten Typen durch generierte ersetzen:
```bash
supabase gen types typescript --linked > src/types/database.ts
```

---

## Troubleshooting
- **`auth.uid()` / `auth.users` Fehler beim Migrieren:** Diese existieren nur
  in einem echten Supabase-Projekt (nicht in einem nackten Postgres). Über
  CLI gegen das verlinkte Projekt oder den SQL-Editor ausführen.
- **RLS blockiert alle Reads:** Erwartet, solange dem User keine Rolle
  zugewiesen ist (Default-Deny). Siehe Schritt 6.
- **`SUPABASE_SERVICE_ROLE_KEY` fehlt:** Webhook (`/api/webhooks/resend`) und
  Admin-Pfade geben dann bewusst 503/Fehler zurück – im Frontend nie nötig.
