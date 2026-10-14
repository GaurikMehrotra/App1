import React from 'react';
import { Text, TextInput, Pressable, View, useColorScheme, TextInputProps } from 'react-native';
export function Label({ children, muted = false }: {
    children: React.ReactNode;
    muted?: boolean;
}) { const dark = useColorScheme() === 'dark'; return <Text style={{ color: muted ? (dark ? '#a3b8b1' : '#62756d') : (dark ? '#edf6f1' : '#173d31'), fontSize: 15, lineHeight: 23 }}>{children}</Text>; }
export function Button({ children, onPress, disabled = false, secondary = false }: {
    children: string;
    onPress: () => void;
    disabled?: boolean;
    secondary?: boolean;
}) { return <Pressable accessibilityRole="button" accessibilityLabel={children} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ backgroundColor: secondary ? '#e4eee8' : '#196c51', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12, opacity: disabled ? 0.45 : pressed ? 0.7 : 1, alignSelf: 'flex-start' })}><Text style={{ fontWeight: '600', color: secondary ? '#174b37' : 'white', fontSize: 14 }}>{children}</Text></Pressable>; }
export function Field({ label, ...props }: TextInputProps & {
    label: string;
}) { const dark = useColorScheme() === 'dark'; return <View style={{ gap: 5, marginBottom: 12 }}><Label>{label}</Label><TextInput accessibilityLabel={label} placeholderTextColor="#789086" {...props} style={[{ borderWidth: 1, borderColor: dark ? '#3a5148' : '#d3dfd7', borderRadius: 10, padding: 12, fontSize: 16, color: dark ? 'white' : '#183e30', backgroundColor: dark ? '#1b3027' : 'white', minHeight: 46 }, props.multiline ? { minHeight: 100, textAlignVertical: 'top' } : {}, props.style]}/></View>; }
export function Card({ children }: {
    children: React.ReactNode;
}) { const dark = useColorScheme() === 'dark'; return <View style={{ padding: 22, borderRadius: 16, borderWidth: 1, borderColor: dark ? '#314b3e' : '#dce5de', backgroundColor: dark ? '#182b22' : 'white', gap: 12, marginBottom: 16 }}>{children}</View>; }
export function Heading({ children }: {
    children: React.ReactNode;
}) { const dark = useColorScheme() === 'dark'; return <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '700', color: dark ? '#f3faf5' : '#153e2d', letterSpacing: -0.8 }}>{children}</Text>; }
export function Message({ text }: {
    text: string;
}) { return text ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: '#87380e', backgroundColor: '#fff3e8', padding: 12, borderRadius: 8, lineHeight: 22 }}>{text}</Text> : null; }
