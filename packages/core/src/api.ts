import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { emailSchema, profileSchema, postSchema, cursorFilter, validateResource } from './validation';
export type Profile = {
    id: string;
    college_id: string;
    display_name: string;
    branch: string;
    graduation_year: number;
    bio: string;
    interests: string[];
    role: string;
    reputation: number;
    avatar_path?: string | null;
    consented_at: string | null;
    settings: Record<string, unknown>;
};
export type FeedPost = {
    id: string;
    college_id: string;
    community_id: string;
    title: string;
    body: string;
    flair: string;
    anonymous: boolean;
    created_at: string;
    score: number;
    pinned: boolean;
    official: boolean;
    unverified: boolean;
    kind: string;
    image_path: string | null;
};
export function createCampusClient(url: string, key: string, storage?: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
    removeItem: (key: string) => Promise<void>;
}) { return createClient(url, key, { auth: { storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } }); }
export class CampusAPI {
    constructor(readonly db: SupabaseClient) { }
    async requestOTP(email: string) {
        const result = await this.db.auth.signInWithOtp({ email: emailSchema.parse(email) });
        if (result.error)
            throw result.error;
    }
    async verifyOTP(email: string, token: string) {
        const { error } = await this.db.auth.verifyOtp({ email: emailSchema.parse(email), token, type: 'email' });
        if (error)
            throw error;
    }
    async profile(): Promise<Profile | null> {
        const { data: { user } } = await this.db.auth.getUser();
        if (!user)
            return null;
        const { data, error } = await this.db.from('profiles').select('*').eq('id', user.id).single();
        if (error)
            throw error;
        return data;
    }
    async saveProfile(input: unknown) {
        const values = profileSchema.parse(input);
        const { error } = await this.db.rpc('update_my_profile', { input: values });
        if (error)
            throw error;
    }
    async feed(college: string, options: {
        cursor?: string;
        sort?: string;
        query?: string;
        saved?: boolean;
        community?: string;
        academic?: boolean;
    } = {}) {
        void college;
        const { data, error } = await this.db.rpc('feed_page', { sort_mode: options.sort ?? 'New', query: options.query ?? '', academic: options.academic ?? false, before_post: options.cursor ?? null, saved_only: options.saved ?? false, community_filter: options.community ?? null });
        if (error)
            throw error;
        return data as FeedPost[];
    }
    async createPost(input: unknown) {
        const post = postSchema.parse(input);
        const { data, error } = await this.db.rpc('create_post', { input: post });
        if (error)
            throw error;
        return data as string;
    }
    async list(table: string, college: string, cursor?: {
        id: string;
        created_at: string;
    }, query?: string) {
        let q = this.db.from(table).select('*').eq('college_id', college).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20);
        if (cursor)
            q = q.or(cursorFilter(cursor)!);
        if (query?.trim()) {
            const column = table === 'communities' ? 'name' : table === 'contact_requests' ? 'body' : 'title';
            q = q.ilike(column, `%${query.trim().replace(/[%_]/g, '')}%`);
        }
        const { data, error } = await q;
        if (error)
            throw error;
        return data as Record<string, unknown>[];
    }
    async action(name: string, args: Record<string, unknown>) {
        const { data, error } = await this.db.rpc(name, args);
        if (error)
            throw error;
        return data;
    }
    async insert(table: string, row: Record<string, unknown>) {
        const { error } = await this.db.from(table).insert(validateResource(table, row));
        if (error)
            throw error;
    }
    async exportData() { return this.action('export_my_data', {}); }
    async requestDeletion() { return this.action('request_account_deletion', {}); }
}
export type QueuedPost = {
    id: string;
    input: unknown;
    attempts: number;
};
export async function flushQueue(queue: QueuedPost[], send: (input: unknown) => Promise<unknown>) {
    const remaining: QueuedPost[] = [];
    for (const item of queue) {
        try {
            await send(item.input);
        }
        catch {
            remaining.push({ ...item, attempts: item.attempts + 1 });
        }
    }
    return remaining;
}
