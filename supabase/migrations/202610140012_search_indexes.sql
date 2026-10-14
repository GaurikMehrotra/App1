drop function public.search_academics(text,timestamptz);
create function public.search_academics(query text,before_note uuid default null) returns setof public.notes language sql stable security invoker set search_path='' as $$select n.* from public.notes n where n.college_id=private.college() and to_tsvector('english',n.title||' '||n.body||' '||n.subject)@@websearch_to_tsquery('english',query) and (before_note is null or(n.created_at,n.id)<(select a.created_at,a.id from public.notes a where a.id=before_note and a.college_id=private.college())) order by n.created_at desc,n.id desc limit 20$$;
revoke all on function public.search_academics(text,uuid) from public,anon;
grant execute on function public.search_academics(text,uuid) to authenticated;
do $$declare t record;begin
for t in select table_name from information_schema.columns where table_schema='public' and column_name='college_id' and table_name not in ('profiles') loop
if exists(select 1 from information_schema.columns where table_schema='public' and table_name=t.table_name and column_name='created_at') then execute format('create index if not exists %I on public.%I(college_id,created_at desc,id desc)',t.table_name||'_tenant_cursor',t.table_name);end if;end loop;end$$;
