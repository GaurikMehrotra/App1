import React, { useEffect, useState } from 'react';
import { View, Platform } from 'react-native';
import {registerPagination} from './pagination';
import { api, useSession } from './session';
import { Button, Card, Field, Heading, Label, Message } from './ui';
export function Moderator() {
    const { profile } = useSession();
    const [rows, setRows] = useState<Record<string, unknown>[]>([]), [reason, setReason] = useState(''), [target, setTarget] = useState(''), [message, setMessage] = useState(''), [table, setTable] = useState('reports');
    const staff = profile && ['moderator', 'admin'].includes(profile.role);
    async function load(append=false) {
        if (!profile || !staff)
            return;
        try {
            const result=await api?.list(table,profile.college_id,append&&rows.length?{id:String(rows.at(-1)?.id),created_at:String(rows.at(-1)?.created_at)}:undefined)??[];setRows(old=>append?[...old,...result]:result);
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Failed');
        }
    }
    useEffect(() => { void load(); }, [table]);
useEffect(()=>registerPagination(rows.length&&rows.length%20===0?()=>load(true):null),[rows,table]);
    async function action(kind: string) {
        try {
            const result = await api?.action('moderate_target', { target, kind, reason });
            setMessage(kind === 'reveal' ? `Audited author ID: ${result}` : 'Moderation action recorded');
            await load();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Failed');
        }
    }
    if (!staff || Platform.OS !== 'web')
        return <Card><Label>Moderator dashboard requires a college moderator on web.</Label></Card>;
    return <View>{profile?.role === 'admin' && <AdminTools />}<Heading>Moderation desk</Heading><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 16 }}>{['reports', 'appeals', 'reviews', 'notes', 'clubs', 'organizations','placements', 'abuse_signals', 'moderation_actions', 'privacy_requests'].map(t => <Button key={t} secondary={table !== t} onPress={() => setTable(t)}>{t.replace(/_/g, ' ')}</Button>)}</View><Card><Field label="Target ID" value={target} onChangeText={setTarget}/><Field label="Reason (audit log)" value={reason} onChangeText={setReason} multiline/><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{['reveal', 'warn', 'mute', 'ban', 'remove', 'restore', 'resolve_report'].map(k => <Button key={k} secondary onPress={() => void action(k)}>{k.replace(/_/g, ' ')}</Button>)}</View><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{['review', 'note', 'club', 'organization'].map(kind => <Button key={kind} secondary onPress={() => void api?.action('approve_content', { target, kind, reason }).then(() => { setMessage('Approval recorded'); void load(); }).catch(e => setMessage(e.message))}>{`Approve ${kind}`}</Button>)}<Button secondary onPress={() => void api?.action('resolve_appeal', { target, accepted: true, reason }).then(() => { setMessage('Appeal accepted; sanctions lifted'); void load(); }).catch(e => setMessage(e.message))}>Accept appeal</Button><Button secondary onPress={() => void api?.action('label_unverified', { pid: target, reason }).then(() => setMessage('Unverified label applied')).catch(e => setMessage(e.message))}>Label unverified</Button></View><Button secondary onPress={()=>void api?.action("verify_placement",{target,reason}).then(()=>setMessage("Placement verified")).catch(e=>setMessage(e.message))}>Verify placement listing (admin)</Button><Message text={message}/></Card>{rows.map(row => <Card key={String(row.id)}><Label>{String(row.reason ?? row.body ?? row.action ?? row.kind)}</Label><Label muted>{String(row.status ?? '')} · {String(row.created_at)}</Label><Label muted>{String(row.target_id ?? row.owner_id ?? row.id)}</Label><Button secondary onPress={() => setTarget(String(table === 'reports' ? row.target_id : row.id))}>Select target</Button>{table === 'privacy_requests' && row.kind === 'delete' && profile?.role === 'admin' && <Button secondary onPress={() => void api?.db.functions.invoke('campus-api', { body: { action: 'delete_account', requestId: row.id } }).then(({ error }) => {
                    if (error)
                        throw error;
                    setMessage('Account and private files deleted');
                    void load();
                }).catch(e => setMessage(e.message))}>Fulfill requested account deletion</Button>}</Card>)}</View>;
}
function AdminTools() { const [title, setTitle] = useState(''), [body, setBody] = useState(''), [keywords, setKeywords] = useState(''), [downvotes, setDownvotes] = useState(false), [ai, setAI] = useState(false), [message, setMessage] = useState(''); return <Card><Heading>College administration</Heading><Field label="Official announcement title" value={title} onChangeText={setTitle}/><Field label="Announcement" value={body} onChangeText={setBody} multiline/><Button onPress={() => void api?.action('publish_announcement', { title, body }).then(() => setMessage('Official announcement published')).catch(e => setMessage(e.message))}>Publish pinned official announcement</Button><Field label="Blocked keywords (one per line)" value={keywords} onChangeText={setKeywords} multiline/><Button secondary onPress={() => setDownvotes(!downvotes)}>{downvotes ? 'Downvotes enabled (counts hidden)' : 'Downvotes disabled'}</Button><Button secondary onPress={() => setAI(!ai)}>{ai ? 'AI helper enabled' : 'AI helper disabled'}</Button><Button onPress={() => void api?.action('configure_college', { downvotes, keywords: keywords.split('\n').filter(Boolean), enable_ai: ai }).then(() => setMessage('College settings saved')).catch(e => setMessage(e.message))}>Save college settings</Button><Message text={message}/></Card>; }
