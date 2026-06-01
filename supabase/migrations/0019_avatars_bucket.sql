-- ============================================================================
-- 0019 · Profilbilder: öffentlicher Avatar-Bucket
-- ============================================================================
-- Profilbilder sind unkritisch und werden direkt per <img> angezeigt → public
-- Bucket. Hochgeladen wird über die App (Service-Role nach Auth), gelesen über
-- die öffentliche URL.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
