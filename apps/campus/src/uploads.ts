import * as ImageManipulator from 'expo-image-manipulator';
import { uploadSchema } from '@campus/core';
import { api } from './session';
export async function uploadAsset(asset: {
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
}, college: string, user: string) {
    uploadSchema.parse({ name: asset.name, size: asset.size, type: asset.mimeType });
    if (!api)
        throw Error('Supabase is not configured');
    let uri = asset.uri, type = asset.mimeType;
    if (type?.startsWith('image/')) {
        const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 1600 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
        uri = result.uri;
        type = 'image/jpeg';
    }
    const bytes = await (await fetch(uri)).arrayBuffer();
    uploadSchema.parse({ name: asset.name, size: bytes.byteLength, type });
    const path = `${college}/${user}/${Date.now()}-${asset.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const { error } = await api.db.storage.from('campus-private').upload(path, bytes, { contentType: type });
    if (error)
        throw error;
    return path;
}
