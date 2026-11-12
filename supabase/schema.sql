-- Kanban Organizer – Cloud-Sync-Schema für Supabase
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Datenschutz: Die App verschlüsselt jeden Datensatz (Aufgabe, Spalte, Board, Einstellungen)
-- auf dem Gerät mit AES-GCM, bevor er hochgeladen wird. Supabase speichert nur:
--   id          zufällige Kennung (UUID) des Datensatzes
--   updated_at  Zeitpunkt der letzten Änderung (für "neueste Änderung gewinnt")
--   payload     verschlüsselter Inhalt – ohne Sync-Passwort nicht lesbar

create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  updated_at timestamptz not null,
  server_updated_at timestamptz not null default now(),
  payload text not null,
  primary key (user_id, id)
);

create index if not exists records_user_server_updated_idx on public.records (user_id, server_updated_at);

-- Row Level Security: jeder Nutzer sieht und ändert ausschließlich seine eigenen Zeilen.
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records for select to authenticated using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Hochladen mit "neueste Änderung gewinnt": ein Datensatz wird nur überschrieben, wenn die
-- hochgeladene Version neuer ist. server_updated_at dient den Geräten als Abruf-Cursor.
create or replace function public.push_records(rows jsonb)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.records (user_id, id, updated_at, server_updated_at, payload)
  select auth.uid(), r.id, r.updated_at, clock_timestamp(), r.payload
  from jsonb_to_recordset(rows) as r (id text, updated_at timestamptz, payload text)
  on conflict (user_id, id) do update
    set updated_at = excluded.updated_at,
        server_updated_at = clock_timestamp(),
        payload = excluded.payload
    where public.records.updated_at < excluded.updated_at;
$$;

revoke all on function public.push_records(jsonb) from public, anon;
grant execute on function public.push_records(jsonb) to authenticated;
