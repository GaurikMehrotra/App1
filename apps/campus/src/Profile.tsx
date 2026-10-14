import React, { useEffect, useState } from 'react';
import { View, Platform, Share, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { uploadAsset } from './uploads';
import { Link } from 'expo-router';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { api, useSession } from './session';
import { Button, Card, Field, Heading, Label, Message } from './ui';
export function ProfileScreen() {
    const { profile, refresh, locale, setLocale } = useSession();
    const [name, setName] = useState(profile?.display_name ?? ''), [branch, setBranch] = useState(profile?.branch ?? ''), [year, setYear] = useState(String(profile?.graduation_year ?? 2027)), [bio, setBio] = useState(profile?.bio ?? ''), [interests, setInterests] = useState(profile?.interests.join(', ') ?? ''), [message, setMessage] = useState(''), [deleting, setDeleting] = useState(false), [block, setBlock] = useState(''), [appeal, setAppeal] = useState('');
    const [avatar, setAvatar] = useState(profile?.avatar_path ?? ''), [avatarUrl, setAvatarUrl] = useState('');
    useEffect(() => { if (avatar)
        void api?.db.storage.from('campus-private').createSignedUrl(avatar, 60).then(({ data }) => setAvatarUrl(data?.signedUrl ?? '')); }, [avatar]);
    const settings = profile?.settings ?? {};
    async function save() {
        try {
            await api?.saveProfile({ ...(avatar ? { avatar_path: avatar } : {}), display_name: name, branch, graduation_year: Number(year), bio, interests: interests.split(',').map(s => s.trim()).filter(Boolean) });
            await refresh();
            setMessage('Profile saved');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Failed');
        }
    }
    async function preference(key: string, value: unknown) {
        try {
            await api?.action('set_preferences', { input: { ...settings, [key]: value } });
            await refresh();
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Failed');
        }
    }
    async function push() {
        try {
            if (!Device.isDevice || Platform.OS === 'web')
                throw Error('Push registration requires an Android or iOS device and a configured EAS project.');
            if (Platform.OS === 'android')
                await Notifications.setNotificationChannelAsync('campus', { name: 'Campus', importance: Notifications.AndroidImportance.DEFAULT });
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted')
                throw Error('Notification permission was not granted');
            const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
            if (!projectId)
                throw Error('Set EXPO_PUBLIC_EAS_PROJECT_ID first');
            const token = await Notifications.getExpoPushTokenAsync({ projectId });
            await api?.insert('push_tokens', { owner_id: profile?.id, college_id: profile?.college_id, token: token.data });
            setMessage('Push device registered');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Push registration failed');
        }
    }
    async function exportData() {
        try {
            const data = JSON.stringify(await api?.exportData(), null, 2);
            if (Platform.OS === 'web') {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
                a.download = 'campus-data.json';
                a.click();
                URL.revokeObjectURL(a.href);
            }
            else
                await Share.share({ message: data });
            setMessage('Export prepared');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Export failed');
        }
    }
    return <View><Card><Heading>{profile?.display_name}</Heading>{avatarUrl && <Image accessibilityLabel="Your avatar" source={{ uri: avatarUrl }} style={{ width: 80, height: 80, borderRadius: 40 }}/>}<Button secondary onPress={() => void DocumentPicker.getDocumentAsync({ type: "image/*", copyToCacheDirectory: true }).then(async (result) => { if (!result.canceled && profile)
        setAvatar(await uploadAsset(result.assets[0], profile.college_id, profile.id)); }).catch(e => setMessage(e.message))}>Upload avatar</Button><Label>✓ Verified Student · Reputation {profile?.reputation}</Label><Field label="Name or alias" value={name} onChangeText={setName}/><Field label="Branch" value={branch} onChangeText={setBranch}/><Field label="Graduation year" value={year} onChangeText={setYear}/><Field label="Bio" value={bio} onChangeText={setBio} multiline/><Field label="Interests (comma separated)" value={interests} onChangeText={setInterests}/><Button onPress={() => void save()}>Save profile</Button></Card><Card><Heading>Your feed, your pace</Heading>{[['exam_mode', 'Exam mode'], ['quiet_hours', 'Quiet hours'], ['sponsor_consent', 'Allow sponsorship targeting by branch and year only']].map(([key, label]) => <Button key={key} secondary={settings[key] !== true} onPress={() => void preference(key, settings[key] !== true)}>{`${settings[key] === true ? '✓ ' : ''}${label}`}</Button>)}<Label muted>Quiet hours: 22:00–07:00 India time. Push messages wait until quiet hours end.</Label><Field label="Daily reminder after minutes (0 disables)" keyboardType="number-pad" value={String(settings.time_limit_minutes ?? 30)} onChangeText={v => {
            if (/^\d{1,3}$/.test(v))
                void preference('time_limit_minutes', Number(v));
        }}/><Button secondary onPress={() => setLocale(locale === 'en' ? 'hi' : 'en')}>{locale === 'en' ? 'Switch to हिन्दी' : 'Switch to English'}</Button></Card><Card><Heading>Notifications</Heading>{['replies', 'mentions', 'events', 'announcements', 'deadlines', 'digest'].map(type => <Button key={type} secondary={settings[type] === false} onPress={() => void preference(type, settings[type] === false)}>{`${settings[type] === false ? 'Off' : 'On'} · ${type}`}</Button>)}<Button onPress={() => void push()}>Register this device for push</Button></Card><Card><Heading>Safety & privacy</Heading><Field label="Block user ID" value={block} onChangeText={setBlock}/><Button secondary onPress={() => void api?.insert('blocks', { college_id: profile?.college_id, owner_id: profile?.id, target_id: block }).then(() => setMessage('User blocked')).catch(e => setMessage(e.message))}>Block user</Button><Button secondary onPress={()=>void api?.insert("user_mutes",{college_id:profile?.college_id,owner_id:profile?.id,target_id:block}).then(()=>setMessage("User muted")).catch(e=>setMessage(e.message))}>Mute user</Button><Field label="Report reason" value={message.startsWith("Report:") ? message.slice(7) : ""} onChangeText={v => setMessage("Report:" + v)}/><Button secondary onPress={() => void api?.insert("reports", { owner_id: profile?.id, college_id: profile?.college_id, target_id: block, target_type: "profiles", reason: message.replace("Report:", "") }).then(() => setMessage("Report submitted")).catch(e => setMessage(e.message))}>Report user ID above</Button><Field label="Appeal a moderation decision" value={appeal} onChangeText={setAppeal} multiline/><Button secondary onPress={() => void api?.insert('appeals', { college_id: profile?.college_id, owner_id: profile?.id, title: 'Moderation appeal', body: appeal }).then(() => setMessage('Appeal submitted')).catch(e => setMessage(e.message))}>Submit appeal</Button><Button secondary onPress={() => void exportData()}>Export my data</Button><Button secondary onPress={() => {
            if (!deleting) {
                setDeleting(true);
                return;
            }
            void api?.requestDeletion().then(() => setMessage('Deletion request submitted for operator fulfillment. Your account has not yet been deleted.')).catch(e => setMessage(e.message));
        }}>{deleting ? 'Confirm deletion request' : 'Request account deletion'}</Button><Label muted>Deletion requests require operator fulfillment, including storage and authentication records.</Label></Card><Link href="/Organizations" style={{ padding: 14, color: '#267453' }}>Organization tools</Link>{['admin', 'moderator'].includes(profile?.role ?? '') && <Link href="/Moderation" style={{ padding: 14, color: '#267453' }}>Open moderation dashboard</Link>}<Message text={message}/><Button secondary onPress={() => void AsyncStorage.multiRemove([`feed:${profile?.id}:${profile?.college_id}`, `queue:${profile?.id}`]).then(() => api?.db.auth.signOut()).then(() => refresh())}>Sign out</Button></View>;
}
