create function private.can_rsvp(eid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.events e where e.id=eid and e.college_id=private.college() and (e.price_paise=0 or exists(select 1 from public.tickets t where t.event_id=e.id and t.owner_id=auth.uid() and t.status='paid')))$$;
drop policy owner_insert on rsvps;
drop policy owner_update on rsvps;
create policy rsvp_insert on rsvps for insert to authenticated with check(college_id=private.college() and owner_id=auth.uid() and private.active() and private.can_rsvp(event_id));
create policy rsvp_update on rsvps for update to authenticated using(college_id=private.college() and owner_id=auth.uid()) with check(college_id=private.college() and owner_id=auth.uid() and private.active() and private.can_rsvp(event_id));
revoke all on function private.can_rsvp(uuid) from public;
grant execute on function private.can_rsvp(uuid) to authenticated;
