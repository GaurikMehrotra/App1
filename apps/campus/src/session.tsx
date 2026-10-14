import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { CampusAPI, createCampusClient, Profile, strings, Locale } from '@campus/core';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const secureStorage = { getItem: (k: string) => SecureStore.getItemAsync(k), setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v), removeItem: (k: string) => SecureStore.deleteItemAsync(k) };
export const api = url && key ? new CampusAPI(createCampusClient(url, key, Platform.OS === 'web' ? AsyncStorage : secureStorage)) : null;
type State = {
    profile: Profile | null;
    loading: boolean;
    error: string;
    locale: Locale;
    setLocale: (l: Locale) => void;
    refresh: () => Promise<void>;
    t: typeof strings.en;
};
const Session = createContext<State>({ profile: null, loading: true, error: '', locale: 'en', setLocale: () => { }, refresh: async () => { }, t: strings.en });
export const useSession = () => useContext(Session);
export function SessionProvider({ children }: {
    children: React.ReactNode;
}) {
    const [profile, setProfile] = useState<Profile | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [locale, setLocale] = useState<Locale>('en');
    async function refresh() {
        try {
            setProfile(await api?.profile() ?? null);
            setError('');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to load profile');
        }
        finally {
            setLoading(false);
        }
    }
    useEffect(() => {
        void refresh();
        const sub = api?.db.auth.onAuthStateChange(() => { setTimeout(() => void refresh(), 0); });
        const state = AppState.addEventListener('change', s => {
            if (s === 'active')
                api?.db.auth.startAutoRefresh();
            else
                api?.db.auth.stopAutoRefresh();
        });
        return () => { sub?.data.subscription.unsubscribe(); state.remove(); };
    }, []);
    return <Session.Provider value={{ profile, loading, error, locale, setLocale, refresh, t: strings[locale] }}>{children}</Session.Provider>;
}
