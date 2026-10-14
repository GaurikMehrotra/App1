-- Additional workflow RPCs keep privileged mutations out of client table grants.
alter table communities add constraint community_name_per_college unique(college_id,name);
create or replace function private.provision_profile() returns trigger language plpgsql security definer set search_path='' as $$declare cid uuid;space text;begin
if new.email_confirmed_at is null then return new;end if;
select id into cid from public.colleges where lower(split_part(new.email,'@',2))=any(domains) limit 1;
if cid is null then raise exception 'College email domain is not allowed';end if;
insert into public.profiles(id,college_id) values(new.id,cid) on conflict(id) do nothing;
-- Bootstrap default spaces independently of client consent/write policies.
foreach space in array array['Academics','Placements','Clubs','Hostel','Events','Lost & Found','General'] loop
insert into public.communities(college_id,owner_id,name,category) values(cid,new.id,space,space) on conflict(college_id,name) do nothing;end loop;
return new;end$$;
-- Provisioning uses a system transaction before consent; skip only this bootstrap path.
create or replace function private.guard_write() returns trigger language plpgsql security definer set search_path='' as $$begin
if tg_table_name='communities' and auth.uid() is null and tg_op='INSERT' then return new;end if;
if not private.active() then raise exception 'Consent required or account restricted';end if;
if tg_op='UPDATE' and (new.college_id<>old.college_id or new.owner_id<>old.owner_id or new.created_at<>old.created_at) then raise exception 'Identity fields are immutable';end if;
if tg_table_name='comments' then perform private.rate_limit('comment',10);end if;
return new;end$$;
-- Remove bootstrap guard dependence on auth.uid() in actual auth service contexts.
drop trigger guard_write on communities;
create function private.community_guard() returns trigger language plpgsql set search_path='' as $$begin
if current_user not in ('postgres','supabase_admin') then
 if not private.active() then raise exception 'Consent required or account restricted';end if;
 if tg_op='UPDATE' and (new.college_id<>old.college_id or new.owner_id<>old.owner_id or new.created_at<>old.created_at) then raise exception 'Identity fields immutable';end if;
end if;return new;end$$;
create trigger guard_write before insert or update on communities for each row execute function private.community_guard();
create function public.read_notification(nid uuid) returns void language sql security definer set search_path='' as $$update public.notifications set read_at=now() where id=nid and owner_id=auth.uid()$$;
create function public.create_poll(pid uuid,question text,options jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;begin
if not private.active() or not exists(select 1 from private.post_authors where post_id=pid and user_id=auth.uid()) then raise exception 'Not allowed';end if;
insert into public.polls(college_id,owner_id,post_id,question,options) values(private.college(),auth.uid(),pid,question,options) returning id into result;
update public.posts set kind='poll' where id=pid;return result;end$$;
create function public.respond_poll(pid uuid,choice int) returns void language plpgsql security definer set search_path='' as $$begin
if not private.active() or not exists(select 1 from public.polls where id=pid and college_id=private.college() and choice>=0 and choice<jsonb_array_length(options) and (closes_at is null or closes_at>now())) then raise exception 'Invalid poll or choice';end if;
insert into public.poll_responses(college_id,owner_id,poll_id,option_index) values(private.college(),auth.uid(),pid,choice) on conflict(owner_id,poll_id) do update set option_index=excluded.option_index;end$$;
create function public.attach_post_image(pid uuid,path text) returns void language plpgsql security definer set search_path='' as $$begin
if not private.active() or not exists(select 1 from private.post_authors where post_id=pid and user_id=auth.uid()) or split_part(path,'/',1)<>private.college()::text or split_part(path,'/',2)<>auth.uid()::text then raise exception 'Not allowed';end if;
update public.posts set kind='image',image_path=path where id=pid;end$$;
create function public.publish_announcement(title text,body text) returns uuid language plpgsql security definer set search_path='' as $$declare pid uuid;community uuid;begin
if not private.admin() then raise exception 'Admin required';end if;
select id into community from public.communities where college_id=private.college() and name='General';
select public.create_post(jsonb_build_object('title',title,'body',body,'flair','Opinion','community_id',community,'anonymous',false)) into pid;
update public.posts set official=true,pinned=true where id=pid;
insert into public.notifications(college_id,owner_id,type,title,body) select college_id,id,'announcements',title,body from public.profiles where college_id=private.college() and coalesce((settings->>'announcements')::boolean,true);
return pid;end$$;
create function private.reply_notification() returns trigger language plpgsql security definer set search_path='' as $$declare author uuid;begin
select user_id into author from private.post_authors where post_id=new.post_id;
if author<>new.owner_id then insert into public.notifications(college_id,owner_id,type,title,body,link) select new.college_id,author,'replies','New reply on your post',left(new.body,180),new.post_id::text from public.profiles where id=author and coalesce((settings->>'replies')::boolean,true);end if;return new;end$$;
create trigger reply_notification after insert on comments for each row execute function private.reply_notification();
create table public.club_members(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,owner_id uuid not null,club_id uuid not null,created_at timestamptz not null default now(),unique(owner_id,club_id),foreign key(owner_id,college_id) references profiles(id,college_id) on delete cascade,foreign key(club_id,college_id) references clubs(id,college_id) on delete cascade);
alter table club_members enable row level security;
create policy members_read on club_members for select to authenticated using(college_id=private.college());
create policy members_join on club_members for insert to authenticated with check(college_id=private.college() and owner_id=auth.uid() and private.active());
create policy members_leave on club_members for delete to authenticated using(owner_id=auth.uid() and college_id=private.college());
create table public.tickets(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,owner_id uuid not null,event_id uuid not null,provider_order_id text not null unique,provider_payment_id text unique,amount_paise int not null check(amount_paise>0),status text not null default 'pending' check(status in ('pending','paid','refunded')),created_at timestamptz not null default now(),foreign key(owner_id,college_id) references profiles(id,college_id),foreign key(event_id,college_id) references events(id,college_id));
alter table tickets enable row level security;
create policy ticket_read on tickets for select to authenticated using(college_id=private.college() and (owner_id=auth.uid() or private.staff()));
create function public.event_check_in(rsvp_id uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from public.rsvps r join public.events e on e.id=r.event_id where r.id=rsvp_id and e.college_id=private.college() and (e.owner_id=auth.uid() or private.staff())) then raise exception 'Organizer required';end if;
update public.rsvps set checked_in_at=now() where id=rsvp_id and college_id=private.college();end$$;
create table public.sponsorship_metrics(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,item_id uuid not null,day date not null default current_date,impressions bigint not null default 0,clicks bigint not null default 0,unique(item_id,day),foreign key(item_id,college_id) references sponsored_items(id,college_id));
alter table sponsorship_metrics enable row level security;
create policy metrics_read on sponsorship_metrics for select to authenticated using(college_id=private.college() and private.admin());
create function public.record_sponsorship(item uuid,clicked boolean) returns void language plpgsql security definer set search_path='' as $$begin
if not exists(select 1 from public.profiles where id=auth.uid() and sponsor_consent) then raise exception 'Consent required';end if;
perform private.rate_limit('sponsorship',10);
insert into public.sponsorship_metrics(college_id,item_id,impressions,clicks) values(private.college(),item,case when clicked then 0 else 1 end,case when clicked then 1 else 0 end) on conflict(item_id,day) do update set impressions=sponsorship_metrics.impressions+excluded.impressions,clicks=sponsorship_metrics.clicks+excluded.clicks;
end$$;
create table public.abuse_signals(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,post_id uuid not null,kind text not null default 'vote_burst',created_at timestamptz not null default now(),foreign key(post_id,college_id) references posts(id,college_id));
alter table abuse_signals enable row level security;
create policy abuse_read on abuse_signals for select to authenticated using(college_id=private.college() and private.staff());
create function private.detect_brigading() returns trigger language plpgsql security definer set search_path='' as $$begin
if (select count(*) from public.votes where post_id=new.post_id and created_at>now()-interval '1 minute')>=15 and not exists(select 1 from public.abuse_signals where post_id=new.post_id and created_at>now()-interval '1 hour') then insert into public.abuse_signals(college_id,post_id) values(new.college_id,new.post_id);end if;return new;end$$;
create trigger vote_burst after insert on votes for each row execute function private.detect_brigading();
-- Defaults ensure direct client INSERTs cannot approve or verify content.
create or replace function private.protected_flags() returns trigger language plpgsql set search_path='' as $$begin
if current_user in ('postgres','supabase_admin') then return new;end if;
if tg_op='INSERT' then
 if tg_table_name='reviews' and (to_jsonb(new)->>'approved')::boolean then raise exception 'Approval requires moderator';end if;
 if tg_table_name in ('clubs','organizations','placements') and (to_jsonb(new)->>'verified')::boolean then raise exception 'Verification requires moderator';end if;
 if tg_table_name='notes' and (to_jsonb(new)->>'accepted')::boolean then raise exception 'Acceptance requires moderator';end if;
else
 if tg_table_name='reviews' and (to_jsonb(new)->>'approved')::boolean<>(to_jsonb(old)->>'approved')::boolean then raise exception 'Use moderation';end if;
 if tg_table_name in ('clubs','organizations','placements') and (to_jsonb(new)->>'verified')::boolean<>(to_jsonb(old)->>'verified')::boolean then raise exception 'Use moderation';end if;
 if tg_table_name='notes' and (to_jsonb(new)->>'accepted')::boolean<>(to_jsonb(old)->>'accepted')::boolean then raise exception 'Use moderation';end if;
end if;return new;end$$;
create function public.approve_content(target uuid,kind text,reason text) returns void language plpgsql security definer set search_path='' as $$begin
if not private.staff() or length(reason)<5 then raise exception 'Moderator and reason required';end if;
if kind='review' then update public.reviews set approved=true where id=target and college_id=private.college();
elsif kind='note' then update public.notes set accepted=true where id=target and college_id=private.college() and accepted=false; if found then update public.profiles set reputation=reputation+5 where id=(select owner_id from public.notes where id=target);end if;
elsif kind='club' then update public.clubs set verified=true where id=target and college_id=private.college();
elsif kind='organization' then update public.organizations set verified=true where id=target and college_id=private.college();else raise exception 'Unknown kind';end if;
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'approve_'||kind,target,reason);end$$;
create function public.resolve_appeal(target uuid,accepted boolean,reason text) returns void language plpgsql security definer set search_path='' as $$declare author uuid;begin
if not private.staff() or length(reason)<5 then raise exception 'Moderator and reason required';end if;
update public.appeals set status=case when accepted then 'accepted' else 'rejected' end where id=target and college_id=private.college() returning owner_id into author;
if accepted then delete from public.sanctions where user_id=author and college_id=private.college();end if;
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'resolve_appeal',target,reason);end$$;
-- Appeals must remain available to banned users.
drop policy owner_insert on appeals;
create policy appeal_insert on appeals for insert to authenticated with check(college_id=private.college() and owner_id=auth.uid());
drop trigger guard_write on appeals;
-- Timestamp/identity immutability and indexes support tenant cursors.
create index notes_search on notes using gin(to_tsvector('english',title||' '||body||' '||subject));
create function public.search_academics(query text,before_time timestamptz default now()) returns setof public.notes language sql stable security invoker set search_path='' as $$select * from public.notes where college_id=private.college() and created_at<before_time and to_tsvector('english',title||' '||body||' '||subject)@@websearch_to_tsquery('english',query) order by created_at desc,id desc limit 20$$;
revoke all on all functions in schema private from public;
revoke all on function public.read_notification(uuid),public.create_poll(uuid,text,jsonb),public.respond_poll(uuid,int),public.attach_post_image(uuid,text),public.publish_announcement(text,text),public.event_check_in(uuid),public.record_sponsorship(uuid,boolean),public.approve_content(uuid,text,text),public.resolve_appeal(uuid,boolean,text),public.search_academics(text,timestamptz) from public,anon;
grant execute on function private.college(),private.staff(),private.admin(),private.active(),private.blocked_author(uuid) to authenticated;
grant execute on function public.read_notification(uuid),public.create_poll(uuid,text,jsonb),public.respond_poll(uuid,int),public.attach_post_image(uuid,text),public.publish_announcement(text,text),public.event_check_in(uuid),public.record_sponsorship(uuid,boolean),public.approve_content(uuid,text,text),public.resolve_appeal(uuid,boolean,text),public.search_academics(text,timestamptz) to authenticated;
grant select,insert,delete on club_members to authenticated;
grant select on tickets,sponsorship_metrics,abuse_signals to authenticated;
