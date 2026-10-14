create or replace function public.update_my_profile(input jsonb) returns void language plpgsql security definer set search_path='' as $$begin
if auth.uid() is null then raise exception 'Authentication required';end if;
if input ? 'avatar_path' and (split_part(input->>'avatar_path','/',1)<>private.college()::text or split_part(input->>'avatar_path','/',2)<>auth.uid()::text) then raise exception 'Invalid avatar path';end if;
update public.profiles set display_name=left(input->>'display_name',60),branch=left(input->>'branch',60),graduation_year=(input->>'graduation_year')::int,bio=left(coalesce(input->>'bio',''),500),interests=coalesce(array(select jsonb_array_elements_text(input->'interests')),'{}'),avatar_path=case when input ? 'avatar_path' then input->>'avatar_path' else avatar_path end,consented_at=coalesce(consented_at,now()) where id=auth.uid();end$$;
drop function public.feed_page(text,text,boolean,uuid);
create function public.feed_page(sort_mode text default 'New',query text default '',academic boolean default false,before_post uuid default null,saved_only boolean default false,community_filter uuid default null) returns setof public.posts language sql stable security invoker set search_path='' as $$select p.* from public.posts p where p.college_id=private.college() and p.deleted_at is null
and (not academic or p.flair in ('Doubt','Notes')) and (community_filter is null or p.community_id=community_filter)
and (not saved_only or exists(select 1 from public.bookmarks b where b.post_id=p.id and b.owner_id=auth.uid()))
and (query='' or p.search@@websearch_to_tsquery('english',query)) and (sort_mode<>'Trending' or p.created_at>now()-interval '7 days')
and (before_post is null or (p.pinned,case when sort_mode='New' then 0 else p.score end,p.created_at,p.id)<(select anchor.pinned,case when sort_mode='New' then 0 else anchor.score end,anchor.created_at,anchor.id from public.posts anchor where anchor.id=before_post and anchor.college_id=private.college()))
order by p.pinned desc,case when sort_mode='New' then 0 else p.score end desc,p.created_at desc,p.id desc limit 20$$;
create function public.poll_totals(pid uuid) returns table(option_index int,responses bigint) language sql stable security definer set search_path='' as $$select r.option_index,count(*) from public.poll_responses r join public.polls p on p.id=r.poll_id where p.id=pid and p.college_id=private.college() and private.not_banned() group by r.option_index order by 1$$;
create function public.club_directory(cid uuid) returns table(display_name text,branch text) language sql stable security invoker set search_path='' as $$select p.display_name,p.branch from public.club_members m join public.profiles p on p.id=m.owner_id where m.club_id=cid and m.college_id=private.college() order by p.display_name limit 100$$;
alter table reports drop constraint reports_target_type_check;
alter table reports add check(target_type in ('posts','comments','profiles','notes','reviews','events','listings','clubs','communities','organizations','sponsored_items','placements','mentorships','study_groups','campus_info','news_items','fest_updates'));
create table public.community_moderators(id uuid primary key default gen_random_uuid(),college_id uuid not null references colleges,community_id uuid not null,user_id uuid not null,created_at timestamptz not null default now(),unique(community_id,user_id),foreign key(community_id,college_id) references communities(id,college_id) on delete cascade,foreign key(user_id,college_id) references profiles(id,college_id) on delete cascade);
alter table community_moderators enable row level security;
create policy community_moderator_read on community_moderators for select to authenticated using(college_id=private.college() and private.not_banned());
create function private.community_staff(cid uuid) returns boolean language sql stable security definer set search_path='' as $$select private.not_banned() and (private.staff() or exists(select 1 from public.communities where id=cid and owner_id=auth.uid() and college_id=private.college()) or exists(select 1 from public.community_moderators where community_id=cid and user_id=auth.uid() and college_id=private.college()))$$;
create function public.assign_community_moderator(cid uuid,uid uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not private.staff() and not exists(select 1 from public.communities where id=cid and owner_id=auth.uid() and college_id=private.college()) then raise exception 'Community owner required';end if;
insert into public.community_moderators(college_id,community_id,user_id) values(private.college(),cid,uid) on conflict do nothing;
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'community_moderator_assignment',uid,'Community moderator assigned');end$$;
create function public.community_post_action(pid uuid,kind text) returns void language plpgsql security definer set search_path='' as $$declare cid uuid;begin
select community_id into cid from public.posts where id=pid and college_id=private.college();
if cid is null or not private.community_staff(cid) then raise exception 'Community moderator required';end if;
if kind='pin' then update public.posts set pinned=not pinned where id=pid;
elsif kind='remove' then update public.posts set deleted_at=now() where id=pid;
else raise exception 'Unknown action';end if;
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'community_'||kind,pid,'Community moderation');end$$;
revoke all on function public.feed_page(text,text,boolean,uuid,boolean,uuid),public.poll_totals(uuid),public.club_directory(uuid),public.assign_community_moderator(uuid,uuid),public.community_post_action(uuid,text) from public,anon;
grant execute on function public.feed_page(text,text,boolean,uuid,boolean,uuid),public.poll_totals(uuid),public.club_directory(uuid),public.assign_community_moderator(uuid,uuid),public.community_post_action(uuid,text) to authenticated;
grant select on community_moderators to authenticated;
grant all on community_moderators to service_role;
revoke all on function private.community_staff(uuid) from public;
