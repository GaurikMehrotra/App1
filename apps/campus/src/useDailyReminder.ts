import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
export function useDailyReminder(userId: string | undefined, minutes: number) {
    const [message, setMessage] = useState('');
    useEffect(() => {
        if (!userId || minutes <= 0)
            return;
        let last = Date.now(), active = AppState.currentState === 'active', day = '', total = 0, ready = false, disposed = false, notified = false;
        async function tick() { const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); if (day !== today) {
            day = today;
            ready = false;
            const saved = JSON.parse(await AsyncStorage.getItem(`time:${userId}:${day}`) ?? '{"total":0,"notified":false}');
            if (disposed)
                return;
            total = saved.total;
            notified = saved.notified;
            ready = true;
            last = Date.now();
        } const now = Date.now(); if (active && ready) {
            total += Math.min(now - last, 60000);
            if (total >= minutes * 60000 && !notified) {
                setMessage('Time for a gentle pause. You have reached your daily reminder.');
                notified = true;
            }
            await AsyncStorage.setItem(`time:${userId}:${day}`, JSON.stringify({ total, notified }));
        } last = now; }
        void tick();
        const timer = setInterval(() => void tick(), 30000);
        const subscription = AppState.addEventListener('change', state => { active = state === 'active'; last = Date.now(); });
        return () => { disposed = true; clearInterval(timer); subscription.remove(); };
    }, [userId, minutes]);
    return message;
}
