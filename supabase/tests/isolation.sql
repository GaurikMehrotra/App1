\set ON_ERROR_STOP on
begin;
insert into public.colleges(id,name,domains) values('11111111-1111-4111-8111-111111111111','College A',array['a.edu']),('22222222-2222-4222-8222-222222222222','College B',array['b.edu']);
insert into auth.users(id,email,email_confirmed_at) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','alice@a.edu',now()),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bob@b.edu',now()),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','carol@a.edu',now());
update public.profiles set consented_at=now();
-- Forged/unallowlisted identities must fail provisioning.
do $$begin
begin insert into auth.users(id,email,email_confirmed_at) values(gen_random_uuid(),'intruder@evil-a.edu',now());raise exception 'TEST FAILED: invalid college admitted';exception when others then if sqlerrm like 'TEST FAILED:%' then raise;end if;end;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
do $$begin
if (select count(*) from public.colleges)<>1 then raise exception 'TEST FAILED: cross-college read';end if;
if (select count(*) from public.profiles)<>2 then raise exception 'TEST FAILED: profile isolation';end if;
if (select count(*) from public.communities)<>7 then raise exception 'TEST FAILED: default spaces missing or leaked';end if;
if exists(select 1 from public.communities where college_id<>'11111111-1111-4111-8111-111111111111') then raise exception 'TEST FAILED: communities leak';end if;
begin insert into public.communities(college_id,owner_id,name) values('22222222-2222-4222-8222-222222222222',auth.uid(),'Forged');raise exception 'TEST FAILED: cross-college write';exception when insufficient_privilege then null;end;
end$$;
select public.create_post(jsonb_build_object('community_id',(select id from public.communities where name='General'),'title','Anonymous doubt','body','A useful question','flair','Doubt','anonymous',true)) as post_id \gset
select set_config('test.post',:'post_id',true);
do $$begin
if exists(select 1 from public.post_author(current_setting('test.post')::uuid) where display_name<>'Anonymous') then raise exception 'TEST FAILED: anonymous identity exposed';end if;
begin perform * from private.post_authors;raise exception 'TEST FAILED: private authors accessible';exception when insufficient_privilege then null;end;
begin perform public.moderate_target(current_setting('test.post')::uuid,'reveal','Testing permissions');raise exception 'TEST FAILED: student revealed author';exception when others then if sqlerrm like 'TEST FAILED:%' then raise;end if;end;
update public.profiles set role='admin' where id=auth.uid();
if exists(select 1 from public.profiles where id=auth.uid() and role='admin') then raise exception 'TEST FAILED: role escalation';end if;
begin perform public.vote(current_setting('test.post')::uuid,-1);raise exception 'TEST FAILED: downvote accepted';exception when others then if sqlerrm like 'TEST FAILED:%' then raise;end if;end;
end$$;
select public.vote(:'post_id',1);
select set_config('request.jwt.claim.sub','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true);
do $$begin
if exists(select 1 from public.posts where id=current_setting('test.post')::uuid) then raise exception 'TEST FAILED: cross-college post read';end if;
begin perform public.vote(current_setting('test.post')::uuid,1);raise exception 'TEST FAILED: cross-college vote';exception when foreign_key_violation then null;end;
end$$;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
insert into public.blocks(college_id,owner_id,target_id) values('11111111-1111-4111-8111-111111111111',auth.uid(),'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
do $$begin if exists(select 1 from public.posts where id=current_setting('test.post')::uuid) then raise exception 'TEST FAILED: blocked post visible';end if;end$$;
reset role;
update public.profiles set role='moderator' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set local role authenticated;
select set_config('request.jwt.claim.sub','cccccccc-cccc-4ccc-8ccc-cccccccccccc',true);
do $$declare author uuid;begin
select public.moderate_target(current_setting('test.post')::uuid,'reveal','Investigate a verified report') into author;
if author<>'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' then raise exception 'TEST FAILED: wrong revealed author';end if;
if (select count(*) from public.moderation_actions where action='reveal')<>1 then raise exception 'TEST FAILED: missing reveal audit';end if;
end$$;
reset role;
update public.profiles set role='admin' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
set local role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
select public.create_poll(current_setting('test.post')::uuid,'Best revision method?', '["Practice","Read"]'::jsonb) as poll_id \gset
select set_config('test.poll',:'poll_id',true);
do $$begin
begin perform owner_id from public.polls;raise exception 'TEST FAILED: anonymous poll owner readable';exception when insufficient_privilege then null;end;
begin perform public.respond_poll(current_setting('test.poll')::uuid,8);raise exception 'TEST FAILED: invalid poll option';exception when others then if sqlerrm like 'TEST FAILED:%' then raise;end if;end;
end$$;
select public.respond_poll(:'poll_id',1);
select public.create_post(jsonb_build_object('community_id',(select id from communities where name='General'),'title','Second question','body','Hello campus','flair','Doubt','request_id','retry-key')) as second_id \gset
select set_config('test.retry',:'second_id',true);
do $$declare retried uuid;begin
select public.create_post(jsonb_build_object('community_id',(select id from communities where name='General'),'title','Second question','body','Hello campus','flair','Doubt','request_id','retry-key')) into retried;
if retried<>current_setting('test.retry')::uuid then raise exception 'TEST FAILED: offline retry duplicated post';end if;
end$$;
insert into public.clubs(college_id,owner_id,title) values('11111111-1111-4111-8111-111111111111',auth.uid(),'Alice club') returning id as club_id \gset
insert into public.events(college_id,owner_id,title,body,starts_at,ends_at,location,club_id,price_paise) values('11111111-1111-4111-8111-111111111111',auth.uid(),'Paid workshop','Learn',now()+interval '1 day',now()+interval '2 days','Hall',:'club_id',100) returning id as event_id \gset
select set_config('test.event',:'event_id',true);
do $$begin
begin insert into public.rsvps(college_id,owner_id,event_id) values('11111111-1111-4111-8111-111111111111',auth.uid(),current_setting('test.event')::uuid);raise exception 'TEST FAILED: unpaid RSVP admitted';exception when insufficient_privilege then null;end;
end$$;
select public.request_account_deletion();
select id as request_id from privacy_requests where owner_id=auth.uid() and kind='delete' limit 1 \gset
reset role;
set local role service_role;
select public.fulfill_deletion(:'request_id','cccccccc-cccc-4ccc-8ccc-cccccccccccc');
reset role;
do $$begin
if exists(select 1 from auth.users where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') then raise exception 'TEST FAILED: authentication identity retained';end if;
if exists(select 1 from public.posts where id=current_setting('test.post')::uuid) then raise exception 'TEST FAILED: authored post retained';end if;
if (select count(*) from public.communities where college_id='11111111-1111-4111-8111-111111111111')<>7 then raise exception 'TEST FAILED: deletion destroyed shared spaces';end if;
end$$;
do $$begin
if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind='r' and not c.relrowsecurity) then raise exception 'TEST FAILED: table without RLS';end if;
end$$;
rollback;
\echo 'PASS: college isolation, domain admission, anonymous privacy, role protection, vote policy, blocks, audited moderation, poll privacy, retry idempotency, paid RSVP gate, account deletion and RLS coverage'
