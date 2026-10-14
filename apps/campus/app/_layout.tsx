import '../global.css';
import React from 'react';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider } from '../src/session';
export default function Layout() { return <SafeAreaProvider><SessionProvider><Slot /></SessionProvider></SafeAreaProvider>; }
