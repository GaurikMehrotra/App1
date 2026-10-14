import { z } from 'zod';
export const emailSchema = z.string().trim().toLowerCase().email().max(254);
export const profileSchema = z.object({ display_name: z.string().trim().min(2).max(60), branch: z.string().trim().min(1).max(60), graduation_year: z.number().int().min(2000).max(2100), avatar_path: z.string().max(500).optional(), bio: z.string().max(500).default(''), interests: z.array(z.string().max(40)).max(15).default([]) });
export const contentSchema = z.string().trim().min(1).max(10000).transform(s => s.replace(/<[^>]*>/g, ''));
export const postSchema = z.object({ title: z.string().trim().min(3).max(180), body: contentSchema, flair: z.enum(['Doubt', 'Notes', 'Experience', 'Opinion']), anonymous: z.boolean().default(false), request_id: z.string().max(100).optional(), community_id: z.string().uuid() });
export function emailDomain(email: string) { return emailSchema.parse(email).split('@')[1]; }
export function isAllowedEmail(email: string, domains: string[]) {
    try {
        return domains.map(d => d.toLowerCase()).includes(emailDomain(email));
    }
    catch {
        return false;
    }
}
export function moderate(text: string, keywords: string[]) { const normalized = text.normalize('NFKC').toLowerCase(); return { harsh: keywords.some(k => k.trim() && normalized.includes(k.toLowerCase())), crisis: /suicid|kill myself|end my life/i.test(text) }; }
export const uploadSchema = z.object({ name: z.string().max(180), size: z.number().positive().max(10 * 1024 * 1024), type: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']) });
export function cursorFilter(cursor?: {
    created_at: string;
    id: string;
}) { return cursor ? `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})` : undefined; }
export function icsEvent(event: {
    id: string;
    title: string;
    starts_at: string;
    ends_at: string;
}) {
    const stamp = (d: string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');
    const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, c => '\\' + c);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Campus//Events//EN', 'BEGIN:VEVENT', `UID:${event.id}@campus`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(event.starts_at)}`, `DTEND:${stamp(event.ends_at)}`, `SUMMARY:${escape(event.title)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
export function validateResource(table: string, row: Record<string, unknown>) {
    const kinds: Record<string, string[]> = { listings: ['marketplace', 'lost', 'found', 'roommate', 'project', 'travel', 'sports'], notes: ['note', 'paper'], organizations: ['club', 'coaching', 'recruiter'], campus_info: ['mess', 'bus', 'facility'], placements: ['job', 'internship', 'experience'], mentorships: ['mentor', 'mentee', 'referral'] };
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        if (value === null) {
            result[key] = null;
            continue;
        }
        if (key === 'id' || key.endsWith('_id'))
            result[key] = z.string().uuid().parse(value);
        else if (['semester', 'teaching', 'difficulty', 'grading', 'price_paise'].includes(key)) {
            let rule = z.number().int().nonnegative();
            if (['teaching', 'difficulty', 'grading'].includes(key))
                rule = rule.min(1).max(5);
            if (key === 'semester')
                rule = rule.min(1).max(12);
            result[key] = rule.parse(value);
        }
        else if (key.endsWith('_at'))
            result[key] = z.string().datetime({ offset: true }).parse(value);
        else if (key === 'kind' && kinds[table]) {
            const text = z.string().parse(value);
            if (!kinds[table].includes(text))
                throw Error(`Choose a supported ${table} type: ${kinds[table].join(', ')}`);
            result[key] = text;
        }
        else if (key === 'url')
            result[key] = z.string().url().refine(v => v.startsWith('https://'), 'Use HTTPS').parse(value);
        else if (typeof value === 'string')
            result[key] = z.string().max(key === 'title' || key === 'name' ? 180 : 10000).transform(s => s.replace(/<[^>]*>/g, '')).parse(value);
        else
            result[key] = value;
    }
    return result;
}
