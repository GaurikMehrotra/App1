alter table news_items add constraint unique_news_url unique(college_id,url);
create table private.push_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid not null references public.notifications on delete cascade,token text not null,attempts int not null default 0,lease_until timestamptz,status text not null default 'pending',unique(notification_id,token));
alter table private.push_jobs enable row level security;
create function private.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$begin
insert into private.push_jobs(notification_id,token) select new.id,t.token from public.push_tokens t join public.profiles p on p.id=t.owner_id where t.owner_id=new.owner_id and coalesce((p.settings->>new.type)::boolean,true) and not coalesce((p.settings->>'quiet_hours')::boolean,false);return new;end$$;
create trigger enqueue_push after insert on notifications for each row execute function private.enqueue_push();
create function public.claim_push_jobs() returns table(id uuid,notification_id uuid,token text,title text,body text) language sql security definer set search_path='' as $$with claimed as(update private.push_jobs j set lease_until=now()+interval '5 minutes',attempts=attempts+1 where j.id in(select q.id from private.push_jobs q where q.status='pending' and q.attempts<5 and (q.lease_until is null or q.lease_until<now()) limit 50 for update skip locked) returning j.*) select c.id,c.notification_id,c.token,n.title,n.body from claimed c join public.notifications n on n.id=c.notification_id$$;
create function public.complete_push_job(job_id uuid,succeeded boolean) returns void language sql security definer set search_path='' as $$update private.push_jobs set status=case when succeeded then 'sent' else 'pending' end,lease_until=case when succeeded then null else now()+interval '10 minutes' end where id=job_id$$;
create table private.delivery_keys(owner_id uuid not null,kind text not null,key text not null,primary key(owner_id,kind,key));
alter table private.delivery_keys enable row level security;
create function public.run_scheduled_notifications() returns void language plpgsql security definer set search_path='' as $$declare r record;k text;begin
for r in select e.id,e.title,e.college_id,v.owner_id from public.events e join public.rsvps v on v.event_id=e.id join public.profiles p on p.id=v.owner_id where e.starts_at between now() and now()+interval '1 hour' and v.status='going' and coalesce((p.settings->>'events')::boolean,true) loop
insert into private.delivery_keys values(r.owner_id,'event',r.id::text) on conflict do nothing;
if found then insert into public.notifications(college_id,owner_id,type,title,body,link) values(r.college_id,r.owner_id,'events','Event reminder',r.title,r.id::text);end if;end loop;
for r in select d.*,p.settings from public.deadlines d join public.profiles p on p.id=d.owner_id where due_at between now() and now()+interval '1 day' loop
insert into private.delivery_keys values(r.owner_id,'deadline',r.id::text) on conflict do nothing;
if found and coalesce((r.settings->>'deadlines')::boolean,true) then insert into public.notifications(college_id,owner_id,type,title,body) values(r.college_id,r.owner_id,'deadlines','Deadline reminder',r.title);end if;end loop;
k:=to_char(now(),'IYYY-IW');
for r in select id,college_id from public.profiles loop
insert into private.delivery_keys values(r.id,'digest',k) on conflict do nothing;
if found then insert into public.notifications(college_id,owner_id,type,title,body) values(r.college_id,r.id,'digest','Your weekly campus digest',coalesce((select string_agg(title,E'\n') from(select title from public.posts where college_id=r.college_id and deleted_at is null and created_at>now()-interval '7 days' order by score desc limit 5) top_posts),'Your college is quiet this week.'));end if;end loop;end$$;
revoke all on function public.claim_push_jobs(),public.complete_push_job(uuid,boolean),public.run_scheduled_notifications() from public,anon,authenticated;
-- Supabase creates service_role; isolated Postgres harness creates a compatible role.
grant execute on function public.claim_push_jobs(),public.complete_push_job(uuid,boolean),public.run_scheduled_notifications() to service_role;
grant all on all tables in schema public to service_role;
revoke all on all functions in schema private from public;
