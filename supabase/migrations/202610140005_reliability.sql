create table private.post_requests(user_id uuid not null references public.profiles on delete cascade,request_id text not null,post_id uuid not null references public.posts on delete cascade,primary key(user_id,request_id));
alter table private.post_requests enable row level security;
create or replace function public.create_post(input jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare pid uuid;cid uuid:=private.college();request text:=input->>'request_id';begin
if not private.active() then raise exception 'Consent required or account restricted';end if;
if request is not null then
if length(request)>100 then raise exception 'Invalid request id';end if;
perform pg_advisory_xact_lock(hashtext(auth.uid()::text||request));select post_id into pid from private.post_requests where user_id=auth.uid() and request_id=request;if pid is not null then return pid;end if;end if;
perform private.rate_limit('post',3);
if exists(select 1 from public.colleges c,unnest(c.keyword_filters) k where c.id=cid and k<>'' and lower(input->>'body') like '%'||lower(k)||'%') then raise exception 'Content violates college keyword rules';end if;
insert into public.posts(college_id,community_id,title,body,flair,anonymous) values(cid,(input->>'community_id')::uuid,input->>'title',regexp_replace(input->>'body','<[^>]*>','','g'),input->>'flair',coalesce((input->>'anonymous')::boolean,false)) returning id into pid;
insert into private.post_authors values(pid,auth.uid());if request is not null then insert into private.post_requests values(auth.uid(),request,pid);end if;return pid;end$$;
-- Official branding/configuration changes require a college administrator and an audit event.
create function public.configure_college(downvotes boolean,keywords text[],enable_ai boolean) returns void language plpgsql security definer set search_path='' as $$begin
if not private.admin() then raise exception 'Admin required';end if;
update public.colleges set downvotes_enabled=downvotes,keyword_filters=keywords,ai_enabled=enable_ai where id=private.college();
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'college_settings',private.college(),'College settings updated');end$$;
revoke all on function public.configure_college(boolean,text[],boolean) from public,anon;
grant execute on function public.configure_college(boolean,text[],boolean) to authenticated;
-- Promotion cannot be self-assigned; deployment owner bootstraps the first admin in SQL.
create function public.assign_badge(uid uuid,badge text) returns void language plpgsql security definer set search_path='' as $$begin
if not private.admin() or badge not in ('student','moderator','admin','alumni','club_head') then raise exception 'Admin and valid badge required';end if;
update public.profiles set role=badge where id=uid and college_id=private.college();
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'assign_'||badge,uid,'College role assignment');end$$;
revoke all on function public.assign_badge(uuid,text) from public,anon;
grant execute on function public.assign_badge(uuid,text) to authenticated;
-- No reputation for accepting one's own answer.
create or replace function public.accept_answer(pid uuid,cid uuid) returns void language plpgsql security definer set search_path='' as $$begin
if not private.active() or not exists(select 1 from private.post_authors where post_id=pid and user_id=auth.uid()) then raise exception 'Only author can accept';end if;
if not exists(select 1 from public.posts where id=pid and flair='Doubt' and college_id=private.college()) or not exists(select 1 from public.comments where id=cid and post_id=pid and owner_id<>auth.uid()) then raise exception 'Choose another student answer on this doubt';end if;
insert into public.best_answers(college_id,post_id,comment_id) values(private.college(),pid,cid);
update public.profiles set reputation=reputation+10 where id=(select owner_id from public.comments where id=cid);end$$;
