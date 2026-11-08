create table public.notebooks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'Untitled' check (char_length(title) between 1 and 200),
  document jsonb not null default '{"version":1,"cells":[]}'::jsonb,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint notebook_document_shape check (jsonb_typeof(document) = 'object' and document ->> 'version' = '1' and jsonb_typeof(document -> 'cells') = 'array' and pg_column_size(document) <= 5242880)
);
create index notebooks_owner_updated_idx on public.notebooks (owner_id, updated_at desc) where deleted_at is null;
alter table public.notebooks enable row level security;
create policy "owners can read notebooks" on public.notebooks for select to authenticated using ((select auth.uid()) = owner_id);
create policy "owners can create notebooks" on public.notebooks for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "owners can update notebooks" on public.notebooks for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "owners can delete notebooks" on public.notebooks for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.save_notebook(notebook_id uuid, expected_revision bigint, new_document jsonb)
returns public.notebooks language plpgsql security invoker set search_path = '' as $$
declare saved public.notebooks;
begin
  if jsonb_typeof(new_document) <> 'object' or new_document ->> 'version' <> '1' or jsonb_typeof(new_document -> 'cells') <> 'array' or pg_column_size(new_document) > 5242880 then raise exception 'Invalid notebook document'; end if;
  update public.notebooks set document = new_document, revision = revision + 1, updated_at = now()
  where id = notebook_id and owner_id = (select auth.uid()) and revision = expected_revision and deleted_at is null returning * into saved;
  if saved.id is null then raise exception 'Revision conflict or notebook unavailable'; end if;
  return saved;
end; $$;
revoke all on function public.save_notebook(uuid, bigint, jsonb) from public;
grant execute on function public.save_notebook(uuid, bigint, jsonb) to authenticated;
