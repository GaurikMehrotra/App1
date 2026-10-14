import { test, expect, Page } from '@playwright/test';
const college = '11111111-1111-4111-8111-111111111111', userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', community = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'student@demo.example.edu', email_confirmed_at: '2026-10-14T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-10-14T00:00:00Z' };
// Explicit API contract fixtures: these test UI behavior; SQL isolation tests cover real authorization.
async function backend(page: Page) {
    let verified = false;
    let posts: Record<string, unknown>[] = [];let comments:Record<string,unknown>[]=[];
    await page.route('http://127.0.0.1:54321/**', async (route) => {
        const url = new URL(route.request().url()), path = url.pathname;
        let response: unknown = {};
        if (route.request().method() === 'OPTIONS') {
            await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS' } });
            return;
        }
        if (path.endsWith('/rpc/allowed_college')) {
            const body = route.request().postDataJSON();
            response = body.email.endsWith('@demo.example.edu') ? [{ id: college, name: 'Demo College' }] : [];
        }
        else if (path.endsWith('/auth/v1/otp'))
            response = {};
        else if (path.endsWith('/auth/v1/verify')) {
            verified = true;
            response = { access_token: 'fixture-session', refresh_token: 'fixture-refresh', expires_in: 3600, token_type: 'bearer', user };
        }
        else if (path.endsWith('/auth/v1/user')) {
            if (!verified) {
                await route.fulfill({ status: 401, json: { message: 'No session' }, headers: { 'Access-Control-Allow-Origin': '*' } });
                return;
            }
            response = user;
        }
        else if (path.endsWith('/profiles'))
            response = { id: userId, college_id: college, display_name: 'Aditi', branch: 'CSE', graduation_year: 2027, bio: '', interests: [], role: 'student', reputation: 0, consented_at: '2026-10-14T00:00:00Z', settings: {} };
        else if (path.endsWith('/communities'))
            response = [{ id: community, name: 'General' }];
        else if (path.endsWith('/colleges'))
            response = { keyword_filters: [] };
        else if (path.endsWith('/rpc/feed_page'))
            response = posts;
        else if (path.endsWith('/rpc/create_post')) {
            const input = route.request().postDataJSON().input;
            posts = [{ ...input, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', college_id: college, created_at: '2026-10-14T12:00:00Z', score: 0, kind: 'text' }, ...posts];
            response = posts[0].id;
        }
        else if (path.endsWith('/rpc/post_author'))
            response = [{ display_name: 'Anonymous', badge: 'Verified Student' }];
        else if (path.endsWith('/rpc/vote')) {
            posts[0].score = 1;
            response = null;
        }
        else if (path.endsWith('/rpc/export_my_data'))
            response = { profile: { display_name: 'Aditi' } };
        else if(path.endsWith('/comments')){if(route.request().method()==='POST'){comments.push({...route.request().postDataJSON(),id:'ffffffff-ffff-4fff-8fff-ffffffffffff',created_at:'2026-10-14T13:00:00Z'});response=[];}else response=comments;}
        else if (path.endsWith('/notes'))
            response = [];
        else
            response = [];
        await route.fulfill({ status: 200, json: response, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': '*', 'Content-Type': 'application/json' } });
    });
}
async function login(page: Page) { await page.getByLabel('College email').fill('student@demo.example.edu'); await page.getByRole('button', { name: 'Send verification code' }).click(); await page.getByLabel('Email verification code').fill('123456'); await page.getByRole('button', { name: 'Verify code', exact: true }).click(); await expect(page.getByText('A little closer to your campus.')).toBeVisible(); }
test.beforeEach(async ({ page }) => { await backend(page); await page.goto('/'); });
test('rejects unregistered college before requesting OTP', async ({ page }) => { await page.getByLabel('College email').fill('outsider@example.com'); await page.getByRole('button', { name: 'Send verification code' }).click(); await expect(page.getByText('This email domain is not registered with a college.')).toBeVisible(); await expect(page.getByLabel('Email verification code')).toHaveCount(0); });
test('verified student creates anonymous post and upvotes', async ({ page }) => { await login(page); await page.getByRole('button', { name: '+ Create a post', exact: true }).click(); await page.getByLabel('Post title').fill('How do I prepare for finals?'); await page.getByLabel('Your message').fill('Looking for revision tips from seniors.'); await page.getByRole('button', { name: 'Post with your name', exact: true }).click(); await page.getByRole('button', { name: 'Publish', exact: true }).click(); await expect(page.getByText('How do I prepare for finals?')).toBeVisible(); await expect(page.getByText('◌ Anonymous · Verified Student')).toBeVisible(); await page.getByRole('button', { name: '↑ 0 Helpful', exact: true }).click(); await expect(page.getByRole('button', { name: '↑ 1 Helpful', exact: true })).toBeVisible();await page.getByRole('button',{name:'Discussion',exact:true}).click();await page.getByLabel('Add a comment').fill('Thanks for sharing this question.');await page.getByRole('button',{name:'Send comment',exact:true}).click();await expect(page.getByText('Thanks for sharing this question.',{exact:true})).toBeVisible(); });
test('academic navigation is usable on desktop and mobile web', async ({ page }) => { await login(page); await page.getByRole('link', { name: /Academics/ }).click(); await expect(page.getByRole('heading', { name: 'Notes & papers', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: '+ Add', exact: true })).toBeVisible(); });
