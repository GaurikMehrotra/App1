import React, { useEffect, useState } from 'react';
import { View, Text, Share, Image } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { uploadAsset } from './uploads';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FeedPost, postSchema, moderate, flushQueue, QueuedPost } from '@campus/core';
import { registerPagination } from './pagination';
import { api, useSession } from './session';
import { Button, Card, Field, Heading, Label, Message } from './ui';
type Community = {
    id: string;
    name: string;
};
export function Feed() {
    const { profile, t } = useSession();
    const [posts, setPosts] = useState<FeedPost[]>([]), [communities, setCommunities] = useState<Community[]>([]), [community, setCommunity] = useState(''), [title, setTitle] = useState(''), [body, setBody] = useState(''), [anonymous, setAnonymous] = useState(false), [flair, setFlair] = useState<'Doubt' | 'Notes' | 'Experience' | 'Opinion'>('Doubt'), [sort, setSort] = useState('New'), [query, setQuery] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [more, setMore] = useState(true), [harshConfirmed, setHarshConfirmed] = useState(false), [filters, setFilters] = useState<string[]>([]), [compose, setCompose] = useState(false), [kind, setKind] = useState('text'), [options, setOptions] = useState(''), [imagePath, setImagePath] = useState('');
    const [noteMatches, setNoteMatches] = useState<Record<string, unknown>[]>([]);
    const [saved, setSaved] = useState(false), [topic, setTopic] = useState(''), [downvotes, setDownvotes] = useState(false);
    const cacheKey = `feed:${profile?.id}:${profile?.college_id}`, queueKey = `queue:${profile?.id}`;
    async function load(append = false) {
        if (!profile || !api)
            return;
        setBusy(true);
        try {
            const rows = await api.feed(profile.college_id, { sort, query, saved, community: topic || undefined, academic: profile.settings.exam_mode === true, cursor: append ? posts.at(-1)?.id : undefined });
            if (!append && query.trim())
                setNoteMatches(await api.action('search_academics', { query, before_note: null }) ?? []);
            else if (!query.trim())
                setNoteMatches([]);
            setPosts(old => append ? [...old, ...rows.filter(r => !old.some(o => o.id === r.id))] : rows);
            setMore(rows.length === 20);
            if (!append)
                await AsyncStorage.setItem(cacheKey, JSON.stringify(rows));
            setMessage('');
        }
        catch (e) {
            if (!append) {
                const cached = await AsyncStorage.getItem(cacheKey);
                if (cached)
                    setPosts(JSON.parse(cached));
            }
            setMessage(`Offline or unavailable. ${e instanceof Error ? e.message : ''}`);
        }
        finally {
            setBusy(false);
        }
    }
    useEffect(() => { void load(); }, [sort, saved, topic, profile?.settings.exam_mode]);
    useEffect(() => registerPagination(more && !busy && posts.length ? () => load(true) : null), [more, busy, posts]);
    useEffect(() => {
        if (!profile || !api)
            return;
        void api.db.from('communities').select('id,name').eq('college_id', profile.college_id).then(({ data }) => { setCommunities(data ?? []); setCommunity(data?.[0]?.id ?? ''); });
        void api.db.from('colleges').select('keyword_filters,downvotes_enabled').eq('id', profile.college_id).single().then(({ data }) => { setFilters(data?.keyword_filters ?? []); setDownvotes(data?.downvotes_enabled ?? false); });
        const channel = api.db.channel(`feed:${profile.college_id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts', filter: `college_id=eq.${profile.college_id}` }, () => setMessage('New posts are available. Refresh to see them.')).subscribe();
        return () => { void api?.db.removeChannel(channel); };
    }, [profile?.college_id]);
    async function publish() {
        if (!api)
            return;
        setMessage('');
        try {
            const input = postSchema.parse({ title, body, anonymous, flair, community_id: community });
            if (kind === 'poll' && (options.split('\n').filter(x => x.trim()).length < 2 || options.split('\n').filter(x => x.trim()).length > 8))
                throw Error('A poll needs 2–8 options');
            if (kind === 'image' && !imagePath)
                throw Error('Choose an image first');
            if (moderate(body, filters).harsh && !harshConfirmed) {
                setHarshConfirmed(true);
                setMessage('This may sound harsh. Please review your words before posting again.');
                return;
            }
            const pid = await api.createPost(input);
            if (kind === 'poll')
                await api.action('create_poll', { pid, question: title, options: options.split('\n').map(x => x.trim()).filter(Boolean) });
            if (kind === 'image' && imagePath)
                await api.action('attach_post_image', { pid, path: imagePath });
            setTitle('');
            setBody('');
            setCompose(false);
            setHarshConfirmed(false);
            await load();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Could not post');
        }
    }
    async function queuePost() {
        try {
            const input = postSchema.parse({ title, body, anonymous, flair, community_id: community, request_id: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
            const items: QueuedPost[] = JSON.parse(await AsyncStorage.getItem(queueKey) ?? '[]');
            items.push({ id: `${Date.now()}`, input, attempts: 0 });
            await AsyncStorage.setItem(queueKey, JSON.stringify(items));
            setMessage('Saved on this device. Retry when connected.');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Invalid draft');
        }
    }
    async function retry() {
        if (!api)
            return;
        const items: QueuedPost[] = JSON.parse(await AsyncStorage.getItem(queueKey) ?? '[]');
        const remaining = await flushQueue(items, input => api!.createPost(input));
        await AsyncStorage.setItem(queueKey, JSON.stringify(remaining));
        setMessage(`${items.length - remaining.length} sent; ${remaining.length} waiting.`);
        await load();
    }
    return <View><Card><View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><View><Label>Have something on your mind?</Label><Label muted>Ask a doubt. Share a discovery. Help someone out.</Label></View><Button onPress={() => setCompose(!compose)}>{compose ? 'Close composer' : '+ Create a post'}</Button></View>{compose && <><Field label="Post title" value={title} onChangeText={setTitle}/><Field label="Your message" value={body} onChangeText={v => { setBody(v); setHarshConfirmed(false); }} multiline/><Label>Community</Label><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{communities.map(c => <Button secondary={community !== c.id} key={c.id} onPress={() => setCommunity(c.id)}>{c.name}</Button>)}</View><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>{(['Doubt', 'Notes', 'Experience', 'Opinion'] as const).map(f => <Button key={f} secondary={flair !== f} onPress={() => setFlair(f)}>{f}</Button>)}</View><View style={{ flexDirection: 'row', gap: 8 }}>{['text', 'image', 'poll'].map(k => <Button key={k} secondary={kind !== k} onPress={() => setKind(k)}>{k}</Button>)}</View>{kind === 'poll' && <Field label="Poll options (one per line, 2–8)" value={options} onChangeText={setOptions} multiline/>}{kind === 'image' && <Button secondary onPress={() => void DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true }).then(async (result) => {
                    if (!result.canceled && profile) {
                        setImagePath(await uploadAsset(result.assets[0], profile.college_id, profile.id));
                    }
                }).catch(e => setMessage(e.message))}>{imagePath ? '✓ Image attached' : 'Choose image'}</Button>}<Button secondary={!anonymous} onPress={() => setAnonymous(!anonymous)}>{anonymous ? '✓ Post anonymously' : 'Post with your name'}</Button><Label muted>Anonymous identity is hidden publicly. Moderators can reveal it with an audited reason.</Label>{moderate(body, []).crisis && <Message text={t.safety}/>}<View style={{ flexDirection: 'row', gap: 8 }}><Button onPress={() => void publish()}>Publish</Button><Button secondary onPress={() => void queuePost()}>Save offline draft</Button></View></>}</Card><View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>{['New', 'Top', 'Trending'].map(s => <Button key={s} secondary={sort !== s} onPress={() => setSort(s)}>{s === 'Trending' ? 'Trending this week' : s}</Button>)}<Button secondary disabled={busy} onPress={() => void load()}>Refresh</Button><Button secondary onPress={() => void retry()}>Retry drafts</Button></View><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 12 }}><Button secondary={!saved} onPress={() => setSaved(!saved)}>{saved ? "Showing saved posts" : "Show saved posts"}</Button><Button secondary={!topic} onPress={() => setTopic("")}>All topics</Button>{communities.map(c => <Button key={c.id} secondary={topic !== c.id} onPress={() => setTopic(c.id)}>{c.name}</Button>)}</View><Field label="Search campus conversations" value={query} onChangeText={setQuery} onSubmitEditing={() => void load()}/><Button secondary onPress={() => void load()}>Search</Button><Message text={message}/>{noteMatches.map(note => <Card key={String(note.id)}><Label>Academic search result · {String(note.subject)}</Label><Heading>{String(note.title)}</Heading><Label>{String(note.body)}</Label><Button secondary onPress={() => void api?.db.storage.from("campus-private").createSignedUrl(String(note.file_path), 60).then(({ data }) => { if (data)
        void import("react-native").then(m => m.Linking.openURL(data.signedUrl)); })}>Open note</Button></Card>)}{posts.length === 0 && !busy && <Card><Label>{t.empty}</Label><Label muted>Join a community and share your first question.</Label></Card>}{posts.map(post => <PostCard key={post.id} downvotes={downvotes} post={post} refresh={() => void load()}/>)}{more && posts.length > 0 && <Button disabled={busy} onPress={() => void load(true)}>Load more conversations</Button>}</View>;
}
function PostCard({ post, refresh, downvotes }: {
    downvotes: boolean;
    post: FeedPost;
    refresh: () => void;
}) {
    const { profile } = useSession();
    const [message, setMessage] = useState(''), [comments, setComments] = useState(false), [author, setAuthor] = useState('Verified Student'), [edit, setEdit] = useState(false), [body, setBody] = useState(post.body), [reason, setReason] = useState(''), [report, setReport] = useState(false);
    useEffect(() => {
        void api?.action('post_author', { pid: post.id }).then(data => {
            const rows = data as {
                display_name: string;
                badge: string;
            }[];
            if (rows[0])
                setAuthor(`${rows[0].display_name} · ${rows[0].badge}`);
        });
    }, [post.id]);
    async function action(name: string, args: Record<string, unknown>) {
        try {
            await api?.action(name, args);
            refresh();
            setMessage('Saved');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Action failed');
        }
    }
    async function bookmark() {
        if (!profile)
            return;
        try {
            await api?.insert('bookmarks', { college_id: profile.college_id, owner_id: profile.id, post_id: post.id });
            setMessage('Bookmarked');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Already saved');
        }
    }
    return <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Label muted>{post.anonymous ? '◌ Anonymous · Verified Student' : author}</Label><Label muted>{new Date(post.created_at).toLocaleDateString()}</Label></View><View style={{ flexDirection: 'row', gap: 12 }}><Text style={{ color: '#197554', fontSize: 12, fontWeight: '700' }}>{post.flair.toUpperCase()}</Text>{post.official && <Label>✓ Official announcement</Label>}{post.unverified && <Label>Unverified</Label>}</View><Heading>{post.title}</Heading><Label>{post.body}</Label>{post.image_path && <PostImage path={post.image_path}/>}{post.kind === 'poll' && <Poll postId={post.id}/>}<View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><Button secondary onPress={() => void action('vote', { pid: post.id, direction: 1 })}>{`↑ ${post.score} Helpful`}</Button>{downvotes && <Button secondary onPress={() => void action("vote", { pid: post.id, direction: -1 })}>Downvote (private)</Button>}<Button secondary onPress={() => setComments(!comments)}>{comments ? 'Hide discussion' : 'Discussion'}</Button><Button secondary onPress={() => void bookmark()}>Save</Button><Button secondary onPress={() => void Share.share({ message: `${post.title}\n${post.body}` })}>Share</Button><Button secondary onPress={() => setReport(!report)}>Report</Button><Button secondary onPress={() => void action("flag_rumor", { pid: post.id })}>Report rumor</Button><Button secondary onPress={() => void action("community_post_action", { pid: post.id, kind: "pin" })}>Pin (moderators)</Button><Button secondary onPress={() => setEdit(!edit)}>Edit / delete</Button></View>{report && <><Field label="Report reason" value={reason} onChangeText={setReason}/><Button onPress={() => {
                if (!profile || reason.trim().length < 5) {
                    setMessage('Please explain the issue.');
                    return;
                }
                void api?.insert('reports', { college_id: profile.college_id, owner_id: profile.id, target_id: post.id, target_type: 'posts', reason }).then(() => { setReport(false); setMessage('Report received.'); }).catch(e => setMessage(String(e.message)));
            }}>Submit report</Button></>}{edit && <><Label muted>Only the author can edit or delete this post.</Label><Field label="Edit message" value={body} onChangeText={setBody} multiline/><View style={{ flexDirection: 'row', gap: 8 }}><Button onPress={() => void action('edit_post', { pid: post.id, new_body: body })}>Save edit</Button><Button secondary onPress={() => void action('delete_post', { pid: post.id })}>Delete post</Button></View></>}<Message text={message}/>{comments && <Comments post={post}/>}</Card>;
}
type Comment = {
    id: string;
    parent_id: string | null;
    body: string;
    owner_id: string;
    created_at: string;
};
function Comments({ post }: {
    post: FeedPost;
}) {
    const { profile } = useSession();
    const [rows, setRows] = useState<Comment[]>([]), [body, setBody] = useState(''), [parent, setParent] = useState<string | null>(null), [message, setMessage] = useState(''), [collapsed, setCollapsed] = useState<string[]>([]);
    const [more,setMore]=useState(false);
    async function load(append=false){let request=api?.db.from('comments').select('*').eq('post_id',post.id).order('created_at',{ascending:true}).order('id',{ascending:true}).limit(20);if(append&&rows.length){const last=rows.at(-1)!;request=request?.or(`created_at.gt.${last.created_at},and(created_at.eq.${last.created_at},id.gt.${last.id})`);}const result=await request;setMore(result?.data?.length===20);if(result?.error)setMessage(result.error.message);else setRows(old=>append?[...old,...(result?.data??[])]:result?.data??[]);}
    useEffect(() => { void load(); }, [post.id]);
    async function send() {
        if (!profile || !body.trim())
            return;
        try {
            await api?.insert('comments', { college_id: profile.college_id, owner_id: profile.id, post_id: post.id, parent_id: parent, body });
            setBody('');
            setParent(null);
            await load();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Failed');
        }
    }
    function thread(parentId: string | null, depth = 0): React.ReactNode { return rows.filter(r => r.parent_id === parentId).map(row => <View key={row.id} style={{ marginLeft: Math.min(depth, 4) * 12, borderLeftWidth: 2, borderColor: '#c8dfd0', padding: 12, gap: 8 }}><Label muted>Verified Student · {new Date(row.created_at).toLocaleDateString()}</Label>{!collapsed.includes(row.id) && <Label>{row.body}</Label>}<View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><Button secondary onPress={() => setParent(row.id)}>Reply</Button><Button secondary onPress={()=>void api?.insert("reports",{college_id:profile?.college_id,owner_id:profile?.id,target_id:row.id,target_type:"comments",reason:"Reported from discussion for moderator review"}).then(()=>setMessage("Comment reported")).catch(e=>setMessage(e.message))}>Report comment</Button><Button secondary onPress={()=>void api?.insert("blocks",{college_id:profile?.college_id,owner_id:profile?.id,target_id:row.owner_id}).then(()=>{setMessage("User blocked");void load();}).catch(e=>setMessage(e.message))}>Block author</Button><Button secondary onPress={() => setCollapsed(old => old.includes(row.id) ? old.filter(x => x !== row.id) : [...old, row.id])}>{collapsed.includes(row.id) ? 'Expand' : 'Collapse'}</Button>{post.flair === 'Doubt' && <Button secondary onPress={() => void api?.action('accept_answer', { pid: post.id, cid: row.id }).then(() => setMessage('Best answer accepted.')).catch(e => setMessage(e.message))}>Mark best answer</Button>}</View>{!collapsed.includes(row.id) && depth < 10 && thread(row.id, depth + 1)}</View>); }
    return <View style={{ gap: 12 }}>{thread(null)}{more&&<Button secondary onPress={()=>void load(true)}>Load more replies</Button>}{parent && <Button secondary onPress={() => setParent(null)}>Cancel reply</Button>}<Field label={parent ? 'Reply to comment' : 'Add a comment'} value={body} onChangeText={setBody} multiline/><Button onPress={() => void send()}>Send comment</Button><Message text={message}/></View>;
}
function PostImage({ path }: {
    path: string;
}) { const [url, setUrl] = useState(''); useEffect(() => { void api?.db.storage.from('campus-private').createSignedUrl(path, 60).then(({ data }) => setUrl(data?.signedUrl ?? '')); }, [path]); return url ? <Image accessibilityLabel="Post attachment" source={{ uri: url }} style={{ width: '100%', height: 260, borderRadius: 12 }} resizeMode="contain"/> : null; }
function Poll({ postId }: {
    postId: string;
}) {
    const [poll, setPoll] = useState<{
        id: string;
        question: string;
        options: string[];
    } | null>(null), [message, setMessage] = useState(''), [totals, setTotals] = useState<{
        option_index: number;
        responses: number;
    }[]>([]);
    useEffect(() => { if (poll)
        void api?.action('poll_totals', { pid: poll.id }).then(data => setTotals(data ?? [])); }, [poll, message]);
    useEffect(() => { void api?.db.from('polls').select('id,question,options').eq('post_id', postId).single().then(({ data }) => setPoll(data)); }, [postId]);
    return poll ? <View style={{ gap: 8 }}><Label>{poll.question}</Label>{poll.options.map((option, i) => <Button key={i} secondary onPress={() => void api?.action('respond_poll', { pid: poll.id, choice: i }).then(() => setMessage('Your vote is saved')).catch(e => setMessage(e.message))}>{`${option} · ${totals.find(t => t.option_index === i)?.responses ?? 0}`}</Button>)}<Message text={message}/></View> : null;
}
