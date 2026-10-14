import React, { useState } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { emailSchema, profileSchema } from '@campus/core';
import { api, useSession } from './session';
import { Button, Card, Field, Heading, Label, Message } from './ui';
export function Auth() {
    const { t, locale, setLocale, profile, refresh } = useSession();
    const [email, setEmail] = useState(''), [token, setToken] = useState(''), [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [consent, setConsent] = useState(false), [name, setName] = useState(''), [branch, setBranch] = useState(''), [year, setYear] = useState('2027');
    async function submit() {
        setBusy(true);
        setMessage('');
        try {
            if (!api)
                throw Error('Connect Supabase using the public settings in apps/campus/.env.local.');
            if (profile) {
                if (!consent)
                    throw Error('Consent is required to join.');
                await api.saveProfile(profileSchema.parse({ display_name: name, branch, graduation_year: Number(year) }));
                await refresh();
            }
            else if (sent) {
                await api.verifyOTP(email, token);
                await refresh();
            }
            else {
                const value = emailSchema.parse(email);
                const { data, error } = await api.db.rpc('allowed_college', { email: value });
                if (error)
                    throw error;
                if (!data?.length)
                    throw Error('This email domain is not registered with a college.');
                await api.requestOTP(value);
                setSent(true);
                setMessage('Check your college inbox for the verification code.');
            }
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Unable to continue');
        }
        finally {
            setBusy(false);
        }
    }
    return <ScrollView contentContainerStyle={{ flexGrow: 1, backgroundColor: '#edf3ed', padding: 24, justifyContent: 'center' }}><View style={{ width: '100%', maxWidth: 500, alignSelf: 'center', gap: 24 }}><View><Text style={{ color: '#196c51', fontWeight: '800', letterSpacing: 3, fontSize: 12 }}>CAMPUS COMMUNITY</Text><Heading>{t.home}</Heading><Label muted>A college-only space to learn, belong, and move forward.</Label></View><Card><Heading>{profile ? 'Make yourself at home' : t.signIn}</Heading>{!api && <Message text="Backend not configured. Authentication is unavailable until Supabase is connected; no demo session is created."/>}{profile ? <><Field label="Name or alias" value={name} onChangeText={setName}/><Field label="Branch" value={branch} onChangeText={setBranch}/><Field label="Graduation year" keyboardType="number-pad" value={year} onChangeText={setYear}/><Button secondary onPress={() => setConsent(!consent)}>{consent ? '✓ Consent given' : 'Review and accept consent'}</Button><Label>{t.privacy}</Label></> : <><Field label={t.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} editable={!sent}/>{sent && <Field label="Email verification code" value={token} onChangeText={setToken} keyboardType="number-pad" autoComplete="one-time-code"/>}</>}<Button disabled={busy} onPress={() => void submit()}>{busy ? 'Please wait…' : profile ? 'Create profile' : sent ? t.verify : 'Send verification code'}</Button><Message text={message}/>{sent && <Button secondary onPress={() => { setSent(false); setToken(''); }}>Use another email</Button>}</Card><Button secondary onPress={() => setLocale(locale === 'en' ? 'hi' : 'en')}>{locale === 'en' ? 'हिन्दी में पढ़ें' : 'Read in English'}</Button><Label muted>Private by design. No student subscriptions. Verified college membership.</Label></View></ScrollView>;
}
