create function private.not_banned() returns boolean language sql stable security definer set search_path='' as $$select not exists(select 1 from public.sanctions where user_id=auth.uid() and kind='ban' and (expires_at is null or expires_at>now()))$$;
create or replace function private.staff() returns boolean language sql stable security definer set search_path='' as $$select private.not_banned() and coalesce((select role in ('moderator','admin') from public.profiles where id=auth.uid()),false)$$;
create or replace function private.admin() returns boolean language sql stable security definer set search_path='' as $$select private.not_banned() and coalesce((select role='admin' from public.profiles where id=auth.uid()),false)$$;
do $$declare t record;begin
for t in select table_name from information_schema.columns where table_schema='public' and column_name='college_id' and table_name not in ('profiles','sanctions','appeals','privacy_requests') loop
execute format('create policy ban_restriction on public.%I as restrictive for all to authenticated using(private.not_banned()) with check(private.not_banned())',t.table_name);end loop;end$$;
create policy profile_ban_restriction on profiles as restrictive for select to authenticated using(id=auth.uid() or private.not_banned());
revoke all on function private.not_banned() from public;
grant execute on function private.not_banned() to authenticated;
alter table profiles add check(octet_length(settings::text)<=16384);
create function private.enforce_keywords() returns trigger language plpgsql security definer set search_path='' as $$declare text_value text:=coalesce(to_jsonb(new)->>'body','')||' '||coalesce(to_jsonb(new)->>'title','');begin
if exists(select 1 from public.colleges c,unnest(c.keyword_filters) k where c.id=new.college_id and k<>'' and position(lower(k) in lower(text_value))>0) then raise exception 'Content violates college keyword rules';end if;return new;end$$;
do $$declare tbl text;begin foreach tbl in array array['posts','comments','notes','reviews','events','listings','clubs','mentorships','study_groups'] loop execute format('create trigger enforce_keywords before insert or update on public.%I for each row execute function private.enforce_keywords()',tbl);end loop;end$$;
create function private.unique_domains() returns trigger language plpgsql security definer set search_path='' as $$begin
if exists(select 1 from unnest(new.domains) d where d<>lower(d) or d like '%@%' or d not like '%.%') then raise exception 'Use lowercase email domains';end if;
perform pg_advisory_xact_lock(9274163);
if exists(select 1 from public.colleges where id<>new.id and domains&&new.domains) then raise exception 'An email domain can belong to only one college';end if;return new;end$$;
create trigger unique_domains before insert or update of domains on colleges for each row execute function private.unique_domains();
-- Supabase provides this publication. Isolated Postgres tests deliberately omit it.
do $$begin
if exists(select 1 from pg_publication where pubname='supabase_realtime') then
alter publication supabase_realtime add table public.posts,public.notifications,public.fest_updates;
end if;end$$;
revoke all on function private.enforce_keywords(),private.unique_domains() from public;
