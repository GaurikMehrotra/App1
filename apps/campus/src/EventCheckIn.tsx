import React, { useState } from 'react';
import { View, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { api, useSession } from './session';
import { Button, Card, Field, Label, Message } from './ui';
export function EventCheckIn() {
    const { profile } = useSession();
    const [permission, requestPermission] = useCameraPermissions();
    const [scanning, setScanning] = useState(false), [code, setCode] = useState(''), [message, setMessage] = useState('');
    async function check(value: string) {
        setScanning(false);
        try {
            const id = value.replace('campus:rsvp:', '');
            await api?.action('event_check_in', { rsvp_id: id });
            setMessage('Check-in confirmed');
        }
        catch (e) {
            setMessage(e instanceof Error ? e.message : 'Check-in failed');
        }
    }
    return <Card><Label>Event check-in</Label><Field label="Your RSVP ID / organizer scan code" value={code} onChangeText={setCode}/>{code && <View style={{ backgroundColor: 'white', padding: 16, alignSelf: 'flex-start' }}><QRCode value={`campus:rsvp:${code}`} size={160}/></View>}<Button secondary onPress={() => void check(code)}>Check in attendee (organizers only)</Button>{Platform.OS !== 'web' && <Button secondary onPress={() => {
                if (permission?.granted)
                    setScanning(!scanning);
                else
                    void requestPermission();
            }}>Scan attendee QR</Button>}{scanning && permission?.granted && <CameraView style={{ height: 260 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result => void check(result.data)}/>}<Label muted>RSVP IDs appear in your event confirmations. Only the event owner or college moderators can check in attendees.</Label><Message text={message}/><Label muted>College: {profile?.college_id}</Label></Card>;
}
