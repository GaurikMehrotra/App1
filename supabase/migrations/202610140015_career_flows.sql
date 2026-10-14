drop policy owner_insert on placements;
create policy placement_insert on placements for insert to authenticated with check(college_id=private.college() and owner_id=auth.uid() and private.active() and (private.admin() or kind='experience'));
create function public.verify_placement(target uuid,reason text) returns void language plpgsql security definer set search_path='' as $$begin
if not private.admin() or length(reason)<5 then raise exception 'College admin and verification reason required';end if;
update public.placements set verified=true where id=target and college_id=private.college();
insert into public.moderation_actions(college_id,actor_id,action,target_id,reason) values(private.college(),auth.uid(),'verify_placement',target,reason);end$$;
revoke all on function public.verify_placement(uuid,text) from public,anon;
grant execute on function public.verify_placement(uuid,text) to authenticated;
