import { isAllowedEmail, profileSchema, postSchema, moderate, uploadSchema, icsEvent } from './validation';
import { flushQueue } from './api';
test('college domains match exactly, not suffixes', () => { expect(isAllowedEmail(' A@COLLEGE.EDU ', ['college.edu'])).toBe(true); expect(isAllowedEmail('a@evilcollege.edu', ['college.edu'])).toBe(false); expect(isAllowedEmail('invalid', ['college.edu'])).toBe(false); });
test('profile bounds protect inputs', () => { expect(profileSchema.safeParse({ display_name: 'A', branch: 'CSE', graduation_year: 2027 }).success).toBe(false); });
test('content validation strips markup and preserves plain text', () => { expect(postSchema.parse({ title: 'Doubt', body: '<script>bad</script>Hello', flair: 'Doubt', community_id: '11111111-1111-4111-8111-111111111111' }).body).toBe('badHello'); });
test('moderation identifies harsh and crisis text independently', () => { expect(moderate('I want to kill myself', [])).toEqual({ harsh: false, crisis: true }); expect(moderate('HATE', ['hate']).harsh).toBe(true); });
test('reject executable or oversized uploads', () => { expect(uploadSchema.safeParse({ name: 'x', type: 'text/html', size: 1 }).success).toBe(false); expect(uploadSchema.safeParse({ name: 'x.pdf', type: 'application/pdf', size: 11000000 }).success).toBe(false); });
test('calendar escapes content injection', () => { const value = icsEvent({ id: '1', title: 'A;B\nEND:VEVENT', starts_at: '2026-10-14T12:00:00Z', ends_at: '2026-10-14T13:00:00Z' }); expect(value).toContain('SUMMARY:A\\;B\\nEND:VEVENT'); expect(value.match(/\r\nEND:VEVENT/g)).toHaveLength(1); });
test('retry queue retains failed submissions only', async () => {
    const result = await flushQueue([{ id: '1', input: 'ok', attempts: 0 }, { id: '2', input: 'fail', attempts: 0 }], async (v) => {
        if (v === 'fail')
            throw Error('offline');
    });
    expect(result).toEqual([{ id: '2', input: 'fail', attempts: 1 }]);
});
