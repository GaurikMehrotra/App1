create table public.study_members(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,owner_id uuid not null,group_id uuid not null,created_at timestamptz not null default now(),unique(owner_id,group_id),foreign key(owner_id,college_id) references profiles(id,college_id) on delete cascade,foreign key(group_id,college_id) references study_groups(id,college_id) on delete cascade);
create table public.fest_updates(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,owner_id uuid not null,event_id uuid not null,title text not null,body text not null,starts_at timestamptz not null,created_at timestamptz not null default now(),foreign key(owner_id,college_id) references profiles(id,college_id),foreign key(event_id,college_id) references events(id,college_id));
alter table study_members enable row level security;
alter table fest_updates enable row level security;
create policy study_read on study_members for select to authenticated using(college_id=private.college());
create policy study_join on study_members for insert to authenticated with check(college_id=private.college() and owner_id=auth.uid() and private.active());
create policy study_leave on study_members for delete to authenticated using(college_id=private.college() and owner_id=auth.uid());
create policy fest_read on fest_updates for select to authenticated using(college_id=private.college());
create policy fest_write on fest_updates for insert to authenticated with check(college_id=private.college() and owner_id=auth.uid() and private.active() and exists(select 1 from public.events e where e.id=event_id and e.owner_id=auth.uid()));
create function public.respond_contact(request_id uuid,accept boolean) returns void language plpgsql security definer set search_path='' as $$declare listing uuid;begin
update public.contact_requests set status=case when accept then 'accepted' else 'declined' end where id=request_id and target_id=auth.uid() and college_id=private.college() returning listing_id into listing;
if not found then raise exception 'Recipient required';end if;
if accept and listing is not null then update public.listings set status='claimed' where id=listing and kind in ('lost','found');end if;end$$;
create function public.mentor_matches() returns table(id uuid,display_name text,branch text,graduation_year int,bio text,match_score int) language sql stable security invoker set search_path='' as $$select p.id,p.display_name,p.branch,p.graduation_year,p.bio,((case when p.branch=me.branch then 5 else 0 end)+(select count(*)::int from unnest(p.interests) i where i=any(me.interests))) from public.profiles p join public.profiles me on me.id=auth.uid() where p.id<>me.id and p.college_id=private.college() and exists(select 1 from public.mentorships m where m.owner_id=p.id and m.kind='mentor' and m.status='open') order by 6 desc,p.id limit 20$$;
create function public.flag_rumor(pid uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not private.active() then raise exception 'Account restricted';end if;
insert into public.reports(college_id,owner_id,target_id,target_type,reason) values(private.college(),auth.uid(),pid,'posts','Potential rumor: please verify');
-- Only moderators can apply the visible label to prevent malicious labeling.
end$$;
create function public.label_unverified(pid uuid,reason text) returns void language plpgsql security definer set search_path='' as $$begin
if not private.staff() or length(reason)<5 then raise exception 'Moderator required';end if;
update public.posts set unverified=true where id=pid and college_id=private.college();
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'label_unverified',pid,reason);end$$;
create function private.in_quiet_hours(settings jsonb) returns boolean language sql stable set search_path='' as $$select coalesce((settings->>'quiet_hours')::boolean,false) and case when coalesce((settings->>'quiet_start')::int,22)>coalesce((settings->>'quiet_end')::int,7) then extract(hour from now() at time zone 'Asia/Kolkata')>=coalesce((settings->>'quiet_start')::int,22) or extract(hour from now() at time zone 'Asia/Kolkata')<coalesce((settings->>'quiet_end')::int,7) else extract(hour from now() at time zone 'Asia/Kolkata')>=coalesce((settings->>'quiet_start')::int,22) and extract(hour from now() at time zone 'Asia/Kolkata')<coalesce((settings->>'quiet_end')::int,7) end$$;
create or replace function private.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$begin
insert into private.push_jobs(notification_id,token) select new.id,t.token from public.push_tokens t join public.profiles p on p.id=t.owner_id where t.owner_id=new.owner_id and coalesce((p.settings->>new.type)::boolean,true);return new;end$$;
create or replace function public.claim_push_jobs() returns table(id uuid,notification_id uuid,token text,title text,body text) language sql security definer set search_path='' as $$with claimed as(update private.push_jobs j set lease_until=now()+interval '5 minutes',attempts=attempts+1 where j.id in(select q.id from private.push_jobs q join public.notifications n on n.id=q.notification_id join public.profiles p on p.id=n.owner_id where q.status='pending' and q.attempts<5 and (q.lease_until is null or q.lease_until<now()) and not private.in_quiet_hours(p.settings) limit 50 for update of q skip locked) returning j.*) select c.id,c.notification_id,c.token,n.title,n.body from claimed c join public.notifications n on n.id=c.notification_id$$;
create or replace function public.set_preferences(input jsonb) returns void language plpgsql security definer set search_path='' as $$begin
if coalesce((input->>'quiet_start')::int,22) not between 0 and 23 or coalesce((input->>'quiet_end')::int,7) not between 0 and 23 or coalesce((input->>'time_limit_minutes')::int,30) not between 0 and 600 then raise exception 'Invalid preference bounds';end if;
update public.profiles set settings=input,sponsor_consent=coalesce((input->>'sponsor_consent')::boolean,false) where id=auth.uid();end$$;
create function private.notify_mentions() returns trigger language plpgsql security definer set search_path='' as $$declare mention text[];recipient uuid;begin
for mention in select regexp_matches(new.body,'@\{([0-9a-fA-F-]{36})\}','g') loop
begin recipient:=mention[1]::uuid;exception when invalid_text_representation then continue;end;
insert into public.notifications(college_id,owner_id,type,title,body,link) select new.college_id,p.id,'mentions','You were mentioned',left(new.body,180),new.id::text from public.profiles p where p.id=recipient and p.college_id=new.college_id and coalesce((settings->>'mentions')::boolean,true);end loop;return new;end$$;
create trigger post_mentions after insert on posts for each row execute function private.notify_mentions();
create trigger comment_mentions after insert on comments for each row execute function private.notify_mentions();
revoke all on function public.respond_contact(uuid,boolean),public.mentor_matches(),public.flag_rumor(uuid),public.label_unverified(uuid,text) from public,anon;
grant execute on function public.respond_contact(uuid,boolean),public.mentor_matches(),public.flag_rumor(uuid),public.label_unverified(uuid,text) to authenticated;
grant select,insert,delete on study_members,fest_updates to authenticated;
grant all on study_members,fest_updates to service_role;
revoke all on all functions in schema private from public;
