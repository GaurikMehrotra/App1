create table private.email_jobs(id uuid primary key default gen_random_uuid(),notification_id uuid not null unique references public.notifications on delete cascade,attempts int not null default 0,lease_until timestamptz,status text not null default 'pending');
alter table private.email_jobs enable row level security;
create function private.enqueue_digest_email() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.type='digest' and exists(select 1 from public.profiles where id=new.owner_id and coalesce((settings->>'digest')::boolean,true)) then insert into private.email_jobs(notification_id) values(new.id);end if;return new;end$$;
create trigger enqueue_digest_email after insert on notifications for each row execute function private.enqueue_digest_email();
create function public.claim_email_jobs() returns table(id uuid,owner_id uuid,title text,body text) language sql security definer set search_path='' as $$with claimed as(update private.email_jobs j set lease_until=now()+interval '5 minutes',attempts=attempts+1 where j.id in(select q.id from private.email_jobs q where q.status='pending' and q.attempts<5 and (q.lease_until is null or q.lease_until<now()) limit 50 for update skip locked) returning j.*) select c.id,n.owner_id,n.title,n.body from claimed c join public.notifications n on n.id=c.notification_id$$;
create function public.complete_email_job(job_id uuid,succeeded boolean) returns void language sql security definer set search_path='' as $$update private.email_jobs set status=case when succeeded then 'sent' else 'pending' end,lease_until=case when succeeded then null else now()+interval '10 minutes' end where id=job_id$$;
revoke all on function public.claim_email_jobs(),public.complete_email_job(uuid,boolean) from public,anon,authenticated;
grant execute on function public.claim_email_jobs(),public.complete_email_job(uuid,boolean) to service_role;
revoke all on function private.enqueue_digest_email() from public;
