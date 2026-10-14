-- Hide anonymous poll author identifiers at the SQL privilege boundary.
revoke select on polls from authenticated;
grant select(id,college_id,post_id,question,options,closes_at,created_at) on polls to authenticated;
create function public.feed_page(sort_mode text default 'New',query text default '',academic boolean default false,before_post uuid default null) returns setof public.posts language sql stable security invoker set search_path='' as $$
select p.* from public.posts p where p.college_id=private.college() and p.deleted_at is null
and (not academic or p.flair in ('Doubt','Notes'))
and (query='' or p.search@@websearch_to_tsquery('english',query))
and (sort_mode<>'Trending' or p.created_at>now()-interval '7 days')
and (before_post is null or (case when sort_mode='New' then 0 else p.score end,p.created_at,p.id)<(select case when sort_mode='New' then 0 else anchor.score end,anchor.created_at,anchor.id from public.posts anchor where anchor.id=before_post and anchor.college_id=private.college()))
order by case when sort_mode='New' then 0 else p.score end desc,p.created_at desc,p.id desc limit 20$$;
revoke all on function public.feed_page(text,text,boolean,uuid) from public,anon;
grant execute on function public.feed_page(text,text,boolean,uuid) to authenticated;
create function private.email_tenant_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
if new.email is distinct from old.email and exists(select 1 from public.profiles p join public.colleges c on c.id=p.college_id where p.id=new.id and not lower(split_part(new.email,'@',2))=any(c.domains)) then raise exception 'Email must remain in the verified college';end if;return new;end$$;
create trigger email_tenant_guard before update of email on auth.users for each row execute function private.email_tenant_guard();
-- Account data export includes all owned feature records without exposing another user's data.
create or replace function public.export_my_data() returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;tbl record;records jsonb;begin
select jsonb_build_object('profile',to_jsonb(p),'posts',(select coalesce(jsonb_agg(to_jsonb(po)),'[]') from public.posts po join private.post_authors a on a.post_id=po.id where a.user_id=auth.uid())) into result from public.profiles p where p.id=auth.uid();
for tbl in select table_name from information_schema.columns where table_schema='public' and column_name='owner_id' loop
execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from public.%I t where owner_id=$1',tbl.table_name) into records using auth.uid();result:=result||jsonb_build_object(tbl.table_name,records);end loop;return result;end$$;
-- Blocked users' comments are excluded consistently from discussion reads.
drop policy tenant_read on comments;
create policy tenant_read on comments for select to authenticated using(college_id=private.college() and deleted_at is null and not exists(select 1 from public.blocks b where b.owner_id=auth.uid() and b.target_id=comments.owner_id));
-- Community membership is a user subscription; pinning remains a privileged mutation.
create function public.pin_post(pid uuid,pinned_value boolean) returns void language plpgsql security definer set search_path='' as $$begin
if not private.staff() and not exists(select 1 from public.posts p join public.communities c on c.id=p.community_id where p.id=pid and c.owner_id=auth.uid() and c.college_id=private.college()) then raise exception 'Community moderator required';end if;
update public.posts set pinned=pinned_value where id=pid and college_id=private.college();
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'pin',pid,'Community pin updated');end$$;
revoke all on function public.pin_post(uuid,boolean) from public,anon;
grant execute on function public.pin_post(uuid,boolean) to authenticated;
revoke all on all functions in schema private from public;
