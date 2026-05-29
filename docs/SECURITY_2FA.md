# Sicherheit: Zwei-Faktor-Authentifizierung (2FA)

## Modell

- **Keine Selbstregistrierung.** Mitarbeiter werden ausschließlich von einem
  Owner im Supabase-Backend angelegt (Authentication → Users → Add user).
- **2FA ist für ALLE verpflichtend** (TOTP / Authenticator-App).
- Erzwungen über den **Authenticator Assurance Level (AAL)** in der Middleware:
  Ohne `aal2` ist **kein** geschützter Bereich erreichbar.

## Ablauf

1. **Login** (E-Mail + Passwort) → Session ist zunächst `aal1`.
2. Middleware leitet auf `/security/2fa`:
   - **Kein Faktor vorhanden** → Einrichtung: QR-Code scannen, 6-stelligen
     Code bestätigen (`enroll` → `challenge` → `verify`).
   - **Faktor vorhanden** → nur Code-Abfrage (`challenge` → `verify`).
3. Nach erfolgreicher Verifikation ist die Session `aal2` → Zugriff aufs Portal.

Alle Schritte werden in `audit_logs` protokolliert
(`mfa.enrolled`, `mfa.verified`, `mfa.challenge_failed`).

## Notwendige Supabase-Einstellung

Im Dashboard unter **Authentication → Multi-Factor** muss **TOTP aktiviert**
sein (Standard bei neuen Projekten). Sonst schlägt `enroll()` fehl.

## Gerät verloren / 2FA zurücksetzen

Ein Owner/Admin entfernt den Faktor des betroffenen Users. Per SQL
(Service-Role / SQL-Editor):

```sql
-- Faktoren eines Users anzeigen
select id, friendly_name, factor_type, status
from auth.mfa_factors
where user_id = '<USER_UUID>';

-- Faktor entfernen (User muss beim nächsten Login neu einrichten)
delete from auth.mfa_factors where id = '<FACTOR_ID>';
```

Beim nächsten Login wird der User automatisch erneut durch die Einrichtung
geführt (Middleware erkennt fehlenden Faktor).

## Neuen Mitarbeiter anlegen (Owner)

1. Supabase → Authentication → Users → **Add user** (E-Mail + Initialpasswort,
   „Auto Confirm" aktivieren).
2. Rolle zuweisen (SQL-Editor):
   ```sql
   insert into public.user_roles (profile_id, role_id)
   select p.id, r.id
   from public.profiles p, public.roles r
   where p.email = 'neuer.mitarbeiter@miningadventureworld.de'
     and r.key = 'employee';
   ```
3. Initialpasswort sicher übermitteln. Beim ersten Login richtet der
   Mitarbeiter selbst seine 2FA ein.

## Hinweise

- `getUser()` + AAL-Prüfung laufen serverseitig (Middleware) — der Client kann
  den Schutz nicht umgehen.
- Die eigentliche TOTP-Krypto liegt vollständig bei Supabase/GoTrue
  (kein Eigenbau).
