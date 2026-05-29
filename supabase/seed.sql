-- ============================================================================
-- Seed · Rollen, Rechte, Rollen-Rechte-Matrix, Demo-Standort
-- Idempotent: kann mehrfach ausgeführt werden.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Rollen
-- ----------------------------------------------------------------------------
insert into public.roles (key, name, description, rank) values
  ('owner',            'Owner',            'Voller Zugriff inkl. Rollenvergabe',        100),
  ('admin',            'Administrator',    'Operative Verwaltung aller Module',          80),
  ('location_manager', 'Standortleitung',  'Verwaltung der zugewiesenen Standorte',      50),
  ('employee',         'Mitarbeiter',      'Bearbeitung von Tickets am eigenen Standort', 20)
on conflict (key) do update
  set name = excluded.name, description = excluded.description, rank = excluded.rank;

-- ----------------------------------------------------------------------------
-- Rechte (atomar)
-- ----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('tickets.read',      'Tickets lesen'),
  ('tickets.create',    'Tickets erstellen'),
  ('tickets.update',    'Tickets bearbeiten (Status, Priorität, Tags)'),
  ('tickets.reply',     'Auf Tickets antworten / Nachrichten senden'),
  ('tickets.assign',    'Tickets zuweisen'),
  ('tickets.delete',    'Tickets löschen'),
  ('customers.read',    'Kundeninformationen lesen'),
  ('customers.manage',  'Kunden anlegen/bearbeiten'),
  ('notes.create',      'Interne Notizen erstellen'),
  ('tags.manage',       'Tags verwalten'),
  ('templates.read',    'Vorlagen lesen'),
  ('templates.manage',  'Vorlagen verwalten'),
  ('audit.read',        'Audit-Log einsehen'),
  ('users.read',        'Benutzer/Profile lesen'),
  ('users.manage',      'Benutzer/Profile verwalten'),
  ('roles.manage',      'Rollen & Rechte verwalten'),
  ('locations.manage',  'Standorte verwalten')
on conflict (key) do update set description = excluded.description;

-- ----------------------------------------------------------------------------
-- Rollen-Rechte-Matrix
-- ----------------------------------------------------------------------------

-- owner & admin: ALLE Rechte
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key in ('owner', 'admin')
on conflict do nothing;

-- location_manager: Ticketverwaltung + Kunden/Tags/Templates am Standort
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'tickets.read', 'tickets.create', 'tickets.update', 'tickets.reply',
  'tickets.assign', 'tickets.delete',
  'customers.read', 'customers.manage',
  'notes.create', 'tags.manage',
  'templates.read', 'templates.manage'
)
where r.key = 'location_manager'
on conflict do nothing;

-- employee: Tickets bearbeiten/beantworten am eigenen Standort
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'tickets.read', 'tickets.create', 'tickets.update', 'tickets.reply',
  'customers.read', 'notes.create', 'templates.read'
)
where r.key = 'employee'
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- Demo-Standort (optional – kann entfernt werden)
-- ----------------------------------------------------------------------------
insert into public.locations (name, slug, city) values
  ('MAW Hauptstandort', 'hauptstandort', 'Deutschland')
on conflict (slug) do nothing;
