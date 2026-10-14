import React, { useState } from 'react';
import { View, Text, ScrollView, useWindowDimensions, useColorScheme, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSession } from './session';
import { useDailyReminder } from './useDailyReminder';
import { nextPage } from './pagination';
import { Auth } from './Auth';
import { Button, Heading, Label, Message } from './ui';
import { Feed } from './Feed';
const Hub = React.lazy(() => import('./Hub').then(m => ({ default: m.Hub })));
const ProfileScreen = React.lazy(() => import('./Profile').then(m => ({ default: m.ProfileScreen })));
const tabs = [['Feed', '◉'], ['Communities', '▦'], ['Academics', '▤'], ['Events', '◇'], ['Careers', '↗'], ['Campus life', '⌂'], ['News', '▧'], ['Notifications', '◌'], ['Profile', '○']];
export function Campus({ section }: {
    section: string;
}) {
    const { profile, loading, error } = useSession();
    const { width } = useWindowDimensions();
    const dark = useColorScheme() === 'dark';
    const reminder = useDailyReminder(profile?.id, Number(profile?.settings.time_limit_minutes ?? 30));
    const [compact, setCompact] = useState(false);
    if (loading)
        return <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator accessibilityLabel="Loading your college"/></SafeAreaView>;
    if (!profile || !profile.consented_at)
        return <Auth />;
    const desktop = width >= 980;
    const quiet = profile.settings.exam_mode === true;
    const shown = quiet ? tabs.filter(([x]) => ['Feed', 'Academics', 'Profile', 'Notifications'].includes(x)) : tabs;
    const navigation = <>{shown.map(([label, icon]) => <Link key={label} href={label === 'Feed' ? '/' : `/${label}`} accessibilityRole="link" style={{ padding: desktop ? 14 : 10, borderRadius: 10, backgroundColor: section === label ? '#dcece0' : 'transparent', color: section === label ? '#18583e' : dark ? '#bfd6c7' : '#62786b', fontWeight: section === label ? '700' : '400', fontSize: 14 }}>{icon}  {label}</Link>)}</>;
    return <SafeAreaView style={{ flex: 1, backgroundColor: dark ? '#101e18' : '#f5f7f2' }}><View style={{ flex: 1, flexDirection: 'row' }}>{desktop && <View style={{ width: 238, borderRightWidth: 1, borderColor: dark ? '#304b3b' : '#dfe7dc', padding: 22, gap: 20 }}><Text style={{ color: dark ? '#e4f6e6' : '#174d35', fontSize: 22, fontWeight: '800' }}>◈ {process.env.EXPO_PUBLIC_APP_NAME || '[APP_NAME]'}</Text><Label muted>YOUR COLLEGE COMMONS</Label><View style={{ gap: 4 }}>{navigation}</View><View style={{ flex: 1 }}/><Label>✓ Verified Student</Label><Label muted>{profile.display_name} · {profile.branch}</Label></View>}<View style={{ flex: 1 }}><View style={{ paddingHorizontal: 24, paddingVertical: 18, borderBottomWidth: 1, borderColor: dark ? '#304b3b' : '#dfe7dc', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Label>{desktop ? 'Your college / ' : ''}{section}</Label><View className="rounded-full bg-emerald-100 px-3 py-1"><Text style={{ color: '#196146', fontSize: 12, fontWeight: '600' }}>● VERIFIED CAMPUS</Text></View></View><ScrollView scrollEventThrottle={200} onScroll={({ nativeEvent: e }) => {
            if (e.contentOffset.y + e.layoutMeasurement.height >= e.contentSize.height - 200)
                void nextPage();
        }} contentContainerStyle={{ padding: desktop ? 32 : 18, maxWidth: 1260, width: '100%', alignSelf: 'center', paddingBottom: 50 }}><Message text={error}/><Message text={reminder}/><View style={{ marginBottom: 28, gap: 8 }}><Label muted>LEARN TOGETHER. GROW TOGETHER.</Label><Heading>{section === 'Feed' ? 'A little closer to your campus.' : section}</Heading><Label muted>{section === 'Feed' ? 'Questions, discoveries, and everything in between. Your community starts here.' : 'A trusted space for your college community.'}</Label></View>{quiet && <Label>Exam mode is on. Your feed prioritizes academics.</Label>}<React.Suspense fallback={<ActivityIndicator accessibilityLabel="Loading section"/>}>{section === 'Feed' ? <Feed /> : section === 'Profile' ? <ProfileScreen /> : <Hub section={section}/>}</React.Suspense></ScrollView>{!desktop && <View style={{ borderTopWidth: 1, borderColor: '#dfe7dc' }}><ScrollView horizontal contentContainerStyle={{ padding: 6, gap: 4 }}>{compact ? navigation : shown.slice(0, 4).map(([label, icon]) => <Link key={label} href={label === 'Feed' ? '/' : `/${label}`} style={{ padding: 12, color: dark ? '#d4eadd' : '#18583e' }}>{icon} {label}</Link>)}<Button secondary onPress={() => setCompact(!compact)}>{compact ? 'Less' : 'More'}</Button></ScrollView></View>}</View></View></SafeAreaView>;
}
