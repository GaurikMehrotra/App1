import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Campus } from '../src/Campus';
export default function Section() {
    const { section } = useLocalSearchParams<{
        section: string;
    }>();
    return <Campus section={section}/>;
}
