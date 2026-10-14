import React, { useEffect, useState } from 'react';
import { View, Linking, Share } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { icsEvent } from '@campus/core';
import { registerPagination } from './pagination';
import { api, useSession } from './session';
import { Button, Card, Field, Heading, Label, Message } from './ui';
import { EventCheckIn } from './EventCheckIn';
import { Moderator } from './Moderator';
import { uploadAsset } from './uploads';
type Definition = {
    table: string;
    label: string;
    fields: string[];
    defaults?: Record<string, unknown>;
    admin?: boolean;
};
const definitions: Record<string, Definition[]> = {
    Communities: [{ table: 'communities', label: 'Communities', fields: ['name', 'description', 'rules', 'category'] }],
    Academics: [{ table: 'notes', label: 'Notes & papers', fields: ['title', 'body', 'branch', 'semester', 'subject', 'kind'], defaults: { semester: 1, kind: 'note' } }, { table: 'reviews', label: 'Course & professor reviews', fields: ['title', 'body', 'subject', 'teaching', 'difficulty', 'grading'], defaults: { teaching: 3, difficulty: 3, grading: 3 } }, { table: 'study_groups', label: 'Study groups', fields: ['title', 'body', 'subject'] }, { table: 'deadlines', label: 'Deadlines', fields: ['title', 'body', 'due_at'] }],
    Events: [{ table: 'events', label: 'Events', fields: ['title', 'body', 'starts_at', 'ends_at', 'location', 'price_paise', 'fest'], defaults: { price_paise: 0, fest: false } }, { table: 'fest_updates', label: 'Fest live schedule', fields: ['title', 'body', 'event_id', 'starts_at'] }, { table: 'clubs', label: 'Clubs', fields: ['title', 'body'] }],
    Careers: [{ table: 'placements', label: 'Placements & internships', fields: ['title', 'body', 'company', 'eligibility', 'deadline', 'kind'], defaults: { kind: 'experience' } }, { table: 'mentorships', label: 'Mentorship & referrals', fields: ['title', 'body', 'kind'], defaults: { kind: 'mentee' } }, { table: 'contact_requests', label: 'Connection requests', fields: [] }],
    'Campus life': [{ table: 'listings', label: 'Marketplace & lost and found', fields: ['title', 'body', 'kind', 'price_paise'], defaults: { kind: 'marketplace', price_paise: 0 } }, { table: 'campus_info', label: 'Mess, bus & facilities', fields: ['title', 'body', 'kind'], defaults: { kind: 'mess' }, admin: true }],
    News: [{ table: 'news_items', label: 'Campus news', fields: [], admin: true }, { table: 'news_feeds', label: 'RSS sources', fields: ['title', 'url'], admin: true }],
    Notifications: [{ table: 'notifications', label: 'Notifications', fields: [] }],
    Organizations: [{ table: 'organizations', label: 'Organizations', fields: ['title', 'body', 'kind'], defaults: { kind: 'club' } }, { table: 'sponsored_items', label: 'Sponsored', fields: [], admin: true }],
};
const labels: Record<string, string> = { starts_at: 'Starts (ISO date and time)', ends_at: 'Ends (ISO date and time)', due_at: 'Due (ISO date and time)', deadline: 'Deadline (ISO date and time)', price_paise: 'Price in paise', kind: 'Type', teaching: 'Teaching quality (1–5)', difficulty: 'Difficulty (1–5)', grading: 'Grading (1–5)' };
export function Hub({ section }: {
    section: string;
}) {
    const defs = definitions[section] ?? [];
    const [tab, setTab] = useState(0);
    useEffect(() => setTab(0), [section]);
    if (section === 'Moderation')
        return <Moderator />;
    return <View>{section === 'Events' && <EventCheckIn />}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>{defs.map((d, i) => <Button key={d.table} secondary={tab !== i} onPress={() => setTab(i)}>{d.label}</Button>)}</View>{defs[tab] ? <Resource key={defs[tab].table} definition={defs[tab]}/> : <Card><Label>Choose a section from navigation.</Label></Card>}</View>;
}
function Resource({ definition: d }: {
    definition: Definition;
}) {
    const { profile } = useSession();
    const [rows, setRows] = useState<Record<string, unknown>[]>([]), [values, setValues] = useState<Record<string, string>>({}), [message, setMessage] = useState(''), [query, setQuery] = useState(''), [create, setCreate] = useState(false), [busy, setBusy] = useState(false), [filePath, setFilePath] = useState(''), [more, setMore] = useState(true);
    const [question, setQuestion] = useState(''), [moderatorId, setModeratorId] = useState(''), [reportTarget, setReportTarget] = useState<Record<string, unknown> | null>(null), [reportReason, setReportReason] = useState('');
    const canCreate = d.fields.length > 0 && (!d.admin || profile?.role === 'admin');
    async function load(append = false) {
        if (!profile || !api)
            return;
        try {
            const result = d.table === 'notes' && query.trim() ? await api.action('search_academics', { query, before_note: append ? rows.at(-1)?.id : null }) : await api.list(d.table, profile.college_id, append ? { id: String(rows.at(-1)?.id), created_at: String(rows.at(-1)?.created_at) } : undefined, query);
            setRows(old => append ? [...old, ...result] : result);
            setMore(result.length === 20);
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Unable to load');
        }
    }
    useEffect(() => { void load(); }, [d.table]);
    useEffect(() => registerPagination(more && rows.length ? () => load(true) : null), [more, rows]);
    async function upload() {
        if (!profile || !api)
            return;
        try {
            const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
            if (picked.canceled)
                return;
            const asset = picked.assets[0];
            const path = await uploadAsset(asset, profile.college_id, profile.id);
            setFilePath(path);
            setMessage('File uploaded to private college storage.');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Upload failed');
        }
    }
    async function submit() {
        if (!profile || !api)
            return;
        setBusy(true);
        try {
            const row: Record<string, unknown> = { college_id: profile.college_id, owner_id: profile.id, ...d.defaults };
            for (const f of d.fields) {
                const v = values[f] ?? String(d.defaults?.[f] ?? '');
                if (!v.trim() && f !== 'body' && f !== 'description')
                    throw Error(`${f} is required`);
                row[f] = f === 'fest' ? v === 'true' : ['semester', 'teaching', 'difficulty', 'grading', 'price_paise'].includes(f) ? Number(v) : v;
            }
            if (d.table === 'notes') {
                if (!filePath)
                    throw Error('Upload a PDF or image first');
                row.file_path = filePath;
            }
            if (d.table === 'listings' && filePath)
                row.image_path = filePath;
            await api.insert(d.table, row);
            setCreate(false);
            setValues({});
            setFilePath('');
            setMessage('Saved');
            await load();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Unable to save');
        }
        finally {
            setBusy(false);
        }
    }
    async function rowAction(row: Record<string, unknown>, kind: string) {
        if (!profile || !api)
            return;
        try {
            if (kind === 'members') {
                const data = await api.action('club_directory', { cid: row.id });
                setMessage((data ?? []).map((r: {
                    display_name: string;
                    branch: string;
                }) => `${r.display_name} · ${r.branch}`).join('\n') || 'No members yet');
                return;
            }
            if (kind === 'assign_moderator')
                await api.action('assign_community_moderator', { cid: row.id, uid: moderatorId });
            if (kind === 'mute')
                await api.insert('mutes', { owner_id: profile.id, college_id: profile.college_id, community_id: row.id });
            if (kind === 'study_join')
                await api.insert('study_members', { owner_id: profile.id, college_id: profile.college_id, group_id: row.id });
            if (kind === 'accept' || kind === 'decline')
                await api.action('respond_contact', { request_id: row.id, accept: kind === 'accept' });
            if (kind === 'sync') {
                const { error } = await api.db.functions.invoke('campus-api', { body: { action: 'sync_news', feedId: row.id } });
                if (error)
                    throw error;
            }
            if (kind === 'club')
                await api.insert('club_members', { owner_id: profile.id, college_id: profile.college_id, club_id: row.id });
            if (kind === 'join')
                await api.insert('memberships', { owner_id: profile.id, college_id: profile.college_id, community_id: row.id });
            if (kind === 'leave') {
                const { error } = await api.db.from('memberships').delete().eq('owner_id', profile.id).eq('community_id', row.id);
                if (error)
                    throw error;
            }
            if (kind === 'rsvp') {
                const { data, error } = await api.db.from('rsvps').upsert({ owner_id: profile.id, college_id: profile.college_id, event_id: row.id }, { onConflict: 'owner_id,event_id' }).select('id').single();
                if (error)
                    throw error;
                setMessage(`RSVP confirmed. Your check-in ID: ${data.id}`);
                return;
            }
            if (kind === 'calendar') {
                const content = icsEvent({ id: String(row.id), title: String(row.title), starts_at: String(row.starts_at), ends_at: String(row.ends_at) });
                if (typeof document !== 'undefined') {
                    const anchor = document.createElement('a');
                    anchor.href = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }));
                    anchor.download = 'campus-event.ics';
                    anchor.click();
                    URL.revokeObjectURL(anchor.href);
                }
                else
                    await Share.share({ message: content });
            }
            if (kind === 'study') {
                const { data, error } = await api.db.functions.invoke('campus-api', { body: { action: 'study', noteId: row.id, question: question || undefined } });
                if (error)
                    throw error;
                setMessage(`${data.label}: ${data.text}`);
                return;
            }
            if (kind === 'order') {
                const { data, error } = await api.db.functions.invoke('campus-api', { body: { action: 'checkout', eventId: row.id } });
                if (error)
                    throw error;
                if (!String(data.checkoutUrl).startsWith('https://'))
                    throw Error('Invalid checkout URL');
                await Linking.openURL(data.checkoutUrl);
                setMessage('Test checkout opened. Return here and confirm payment.');
                return;
            }
            if (kind === 'confirm_ticket') {
                const { data: ticket, error: ticketError } = await api.db.from('tickets').select('*').eq('owner_id', profile.id).eq('event_id', row.id).order('created_at', { ascending: false }).limit(1).single();
                if (ticketError)
                    throw ticketError;
                const { error } = await api.db.functions.invoke('campus-api', { body: { action: 'confirm_ticket', linkId: ticket.provider_order_id } });
                if (error)
                    throw error;
                setMessage('Test ticket paid. You can now RSVP for your check-in code.');
                return;
            }
            if (kind === 'open') {
                const { data, error } = await api.db.storage.from('campus-private').createSignedUrl(String(row.file_path ?? row.image_path), 60);
                if (error)
                    throw error;
                await Linking.openURL(data.signedUrl);
            }
            if (kind === 'sold') {
                const { error } = await api.db.from('listings').update({ status: 'sold' }).eq('id', row.id).eq('owner_id', profile.id);
                if (error)
                    throw error;
            }
            if (kind === 'contact')
                await api.insert('contact_requests', { owner_id: profile.id, college_id: profile.college_id, target_id: row.owner_id, listing_id: d.table === 'listings' ? row.id : null, body: 'I would like to connect about this listing.' });
            if (kind === 'read') {
                const { error } = await api.db.rpc('read_notification', { nid: row.id });
                if (error)
                    throw error;
            }
            setMessage(kind === 'calendar' ? 'Calendar exported.' : 'Saved');
            await load();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Action failed');
        }
    }
    const displayed = rows.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()));
    return <View><View style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}><Heading>{d.label}</Heading>{d.table==='placements'&&<Label muted>Students can share interview experiences by company. College admins publish and verify job and internship listings.</Label>}{canCreate && <Button onPress={() => setCreate(!create)}>{create ? 'Close' : '+ Add'}</Button>}</View>{d.table === 'listings' && <Label muted>Types: marketplace, lost, found, roommate, project, travel, sports.</Label>}{d.table === 'mentorships' && <Label muted>Types: mentor, mentee, referral. Never share private student information.</Label>}{d.table === 'reviews' && <Label muted>Reviews are visible publicly only after moderator approval.</Label>}{create && <Card>{d.fields.map(field => <Field key={field} label={labels[field] ?? field.replace(/_/g, ' ')} value={values[field] ?? String(d.defaults?.[field] ?? '')} onChangeText={v => setValues(old => ({ ...old, [field]: v }))} multiline={['body', 'description', 'rules'].includes(field)}/>)}{['notes', 'listings'].includes(d.table) && <Button secondary onPress={() => void upload()}>{filePath ? '✓ File attached' : 'Upload PDF / image (max 10 MB)'}</Button>}<Button disabled={busy} onPress={() => void submit()}>Save</Button></Card>}<Field label={`Search ${d.label.toLowerCase()}`} value={query} onChangeText={setQuery}/><Button secondary onPress={() => void load()}>Refresh / search all records</Button>{d.table === "notes" && process.env.EXPO_PUBLIC_AI_ENABLED === "true" && <Field label="AI study question (optional; may be wrong)" value={question} onChangeText={setQuestion}/>}{d.table === "communities" && <Field label="Assign community moderator (student UUID)" value={moderatorId} onChangeText={setModeratorId}/>}<Message text={message}/>{d.table === 'mentorships' && <MentorMatches />}{displayed.length === 0 && <Card><Label>No entries yet.</Label><Label muted>Contribute something useful to your campus.</Label></Card>}{displayed.map(row => <Card key={String(row.id)}>{d.table === 'sponsored_items' && <Label>SPONSORED · College-level targeting only</Label>}<Heading>{String(row.title ?? row.name ?? 'Campus update')}</Heading><Label>{String(row.body ?? row.description ?? '')}</Label>{['branch', 'semester', 'subject', 'company', 'eligibility', 'location', 'starts_at', 'deadline', 'due_at', 'kind', 'status', 'source', 'rules'].filter(k => row[k]).map(k => <Label muted key={k}>{k.replace(/_/g, ' ')}: {String(row[k])}</Label>)}{row.due_at !== undefined && <Label>{Math.max(0, Math.ceil((new Date(String(row.due_at)).getTime() - Date.now()) / 86400000))} days remaining</Label>}{row.verified === true && <Label>✓ Verified</Label>}<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{["notes", "reviews", "events", "listings", "clubs", "communities", "organizations", "placements", "mentorships", "study_groups", "news_items", "fest_updates"].includes(d.table) && <Button secondary onPress={() => setReportTarget(row)}>Report</Button>}{d.table === 'communities' && <><Button onPress={() => void rowAction(row, 'join')}>Join community</Button><Button secondary onPress={() => void rowAction(row, 'leave')}>Leave</Button><Button secondary onPress={() => void rowAction(row, "mute")}>Mute community</Button><Button secondary onPress={() => void rowAction(row, "assign_moderator")}>Assign moderator</Button></>}{d.table === 'events' && <><Button onPress={() => void rowAction(row, 'rsvp')}>RSVP</Button><Button secondary onPress={() => void rowAction(row, 'calendar')}>Export calendar</Button>{Number(row.price_paise) > 0 && <><Button secondary onPress={() => void rowAction(row, 'order')}>Open test ticket checkout</Button><Button secondary onPress={() => void rowAction(row, 'confirm_ticket')}>Confirm test payment</Button></>}</>}{d.table === 'study_groups' && <Button onPress={() => void rowAction(row, 'study_join')}>Join study group</Button>}{d.table === 'news_feeds' && profile?.role === 'admin' && <Button onPress={() => void rowAction(row, 'sync')}>Refresh RSS feed</Button>}{d.table === 'contact_requests' && row.target_id === profile?.id && <><Button onPress={() => void rowAction(row, 'accept')}>Accept request</Button><Button secondary onPress={() => void rowAction(row, 'decline')}>Decline</Button></>}{d.table === 'clubs' && <View style={{ flexDirection: "row", gap: 8 }}><Button onPress={() => void rowAction(row, 'club')}>Join club</Button><Button secondary onPress={() => void rowAction(row, "members")}>View members</Button></View>}{d.table === 'listings' && !!row.image_path && <Button secondary onPress={() => void rowAction(row, 'open')}>Open photo</Button>}{d.table === 'notes' && <Button onPress={() => void rowAction(row, 'open')}>Open private file</Button>}{d.table === 'notes' && process.env.EXPO_PUBLIC_AI_ENABLED === 'true' && <Button secondary onPress={() => void rowAction(row, 'study')}>AI summary (may be wrong)</Button>}{['listings', 'mentorships'].includes(d.table) && <Button onPress={() => void rowAction(row, 'contact')}>{row.kind === 'lost' || row.kind === 'found' ? 'Request claim' : 'Request to connect'}</Button>}{d.table === 'listings' && row.owner_id === profile?.id && <Button secondary onPress={() => void rowAction(row, 'sold')}>Mark as sold</Button>}{d.table === 'notifications' && <Button secondary onPress={() => void rowAction(row, 'read')}>Mark read</Button>}{d.table === 'news_items' && <Button secondary onPress={() => {
                    const url = String(row.url);
                    if (url.startsWith('https://'))
                        void Linking.openURL(url);
                }}>Read at source</Button>}</View></Card>)}{reportTarget && <Card><Field label="Report reason" value={reportReason} onChangeText={setReportReason}/><Button onPress={() => void api?.insert("reports", { college_id: profile?.college_id, owner_id: profile?.id, target_id: reportTarget.id, target_type: d.table, reason: reportReason }).then(() => { setReportTarget(null); setReportReason(""); setMessage("Report submitted"); }).catch(e => setMessage(e.message))}>Submit report</Button></Card>}{more && rows.length > 0 && <Button secondary onPress={() => void load(true)}>Load more</Button>}</View>;
}
function MentorMatches() { const [rows, setRows] = useState<Record<string, unknown>[]>([]); useEffect(() => { void api?.action('mentor_matches', {}).then(data => setRows(data ?? [])); }, []); return rows.length ? <Card><Label>Mentors matched by branch and shared interests</Label>{rows.map(row => <Label key={String(row.id)}>{String(row.display_name)} · {String(row.branch)} · {String(row.graduation_year)}</Label>)}</Card> : null; }
