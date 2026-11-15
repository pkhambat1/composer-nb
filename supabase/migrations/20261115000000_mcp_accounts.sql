-- OAuth credentials are stored only as SHA-256 hashes. Only the MCP backend can
-- access these records; browser sessions and anonymous clients have no policies.
create table public.mcp_oauth_records (
  kind text not null check (kind in ('client', 'request', 'code', 'grant', 'access', 'refresh')),
  key_hash text not null,
  payload jsonb not null,
  owner_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (kind, key_hash),
  check (pg_column_size(payload) <= 32768)
);
alter table public.mcp_oauth_records enable row level security;
revoke all on public.mcp_oauth_records from anon, authenticated;
grant all on public.mcp_oauth_records to service_role;
create index mcp_oauth_owner_idx on public.mcp_oauth_records(owner_id, kind);
create index mcp_oauth_expiry_idx on public.mcp_oauth_records(expires_at);

-- An atomic compare-and-set: codes, consent requests and refresh credentials
-- cannot be consumed twice, including across different serverless instances.
create function public.consume_mcp_oauth_record(record_kind text, record_hash text)
returns setof public.mcp_oauth_records language sql security invoker set search_path = '' as $$
  update public.mcp_oauth_records set consumed_at = now()
  where kind = record_kind and key_hash = record_hash and consumed_at is null
    and (expires_at is null or expires_at > now())
  returning *;
$$;
revoke all on function public.consume_mcp_oauth_record(text, text) from public, anon, authenticated;
grant execute on function public.consume_mcp_oauth_record(text, text) to service_role;

-- The MCP token identifies the owner server-side. Both owner and revision are
-- checked in the same database update; service_role does not rely on RLS alone.
create function public.save_mcp_notebook(notebook_id uuid, notebook_owner uuid, expected_revision bigint, new_document jsonb)
returns public.notebooks language plpgsql security invoker set search_path = '' as $$
declare saved public.notebooks;
begin
  if jsonb_typeof(new_document) is distinct from 'object'
    or new_document ->> 'version' is distinct from '1'
    or jsonb_typeof(new_document -> 'cells') is distinct from 'array'
    or pg_column_size(new_document) > 5242880 then
    raise exception 'Invalid notebook document';
  end if;
  update public.notebooks set document = new_document, revision = revision + 1, updated_at = now()
  where id = notebook_id and owner_id = notebook_owner and revision = expected_revision and deleted_at is null
  returning * into saved;
  if saved.id is null then raise exception 'Revision conflict or notebook unavailable'; end if;
  return saved;
end; $$;
revoke all on function public.save_mcp_notebook(uuid, uuid, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.save_mcp_notebook(uuid, uuid, bigint, jsonb) to service_role;
