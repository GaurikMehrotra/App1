# [APP_NAME] — verified college community

An Expo Router app for web, Android and iOS, a reusable TypeScript core, and a Supabase backend. The product name is intentionally configurable because `[APP_NAME]` was supplied as a placeholder.

**Implementation and verification are different:** see [delivery status](docs/STATUS.md) for the feature inventory, known gaps and checks actually executed. Live Supabase integration, push delivery, external providers and signed mobile builds require operator configuration. The app never simulates a successful login when configuration is missing.

## Prerequisites

- Node 22 LTS, pnpm 11.25.0, Git.
- Docker and Supabase CLI 2.75.0 for the full local backend. Allow substantial disk space for Supabase images; this onboarding machine could not complete the database image extraction on its first two attempts.
- Android Studio/emulator or an Android device for Android; macOS/Xcode or EAS and an iOS device for iOS. Push/camera validation needs a development build and physical devices.

```sh
corepack enable
corepack prepare pnpm@11.25.0 --activate
pnpm install --frozen-lockfile
cp .env.example apps/campus/.env.local
```

In the cloud workspace with an unwritable home directory, use `scripts/install-cloud.sh`; startup environment variables are saved in the environment startup instructions.

## Backend and college verification

```sh
supabase start
# Alternative official registry mirror, when ECR is blocked:
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io supabase start
# Applies the checked-in migrations and seed to a disposable local database:
supabase db reset
```

Copy the local API URL and **anon/public key only** into `apps/campus/.env.local`. Never place the service-role key in an `EXPO_PUBLIC_` variable. Local Supabase credentials are development-only. Do not expose local ports publicly.

The seed provides `Demo Institute of Technology`, with `demo.example.edu`. Local Mailpit captures OTP emails. `supabase status` shows its local email-testing address. Use a new address on that domain, read the code in Mailpit, then complete the consent/profile screen. Production must use real operator-approved domains and real email delivery. Every confirmed user is provisioned in the college matching their exact email domain, with seven default communities. Duplicate domains across colleges are rejected.

Configure Supabase Auth to require email confirmation and use the OTP templates in `supabase/templates/otp.html` for signup and magic-link messages. Set the production Site URL and mobile redirect allowlist. Client preflight rejects unsupported domains; the verification trigger is the server enforcement boundary. Add CAPTCHA and configure Auth email rate limits for production abuse protection.

Bootstrap the first admin using the Supabase SQL editor as the project operator:

```sql
-- Replace the UUID after verifying the student's actual identity.
update public.profiles set role = 'admin' where id = '<verified-user-uuid>';
```

Register additional colleges through operator SQL, with lowercase unique domains. Never grant role/college update permission to clients. Admins configure downvotes, keywords, AI enablement and official announcements through the web moderator dashboard. New account data is isolated with tenant keys, composite foreign keys and RLS; private anonymous-author tables have no client grants.

## Run all platforms

```sh
pnpm web       # Expo web development server
pnpm android   # launch Android emulator/device through Expo
pnpm ios       # iOS simulator on macOS
pnpm build     # static web export: apps/campus/dist
```

The same campus app runs on every platform. Web has a desktop sidebar and compact screens have bottom navigation. Native camera/push features need an EAS development build rather than relying on Expo Go. To build:

```sh
cd apps/campus
pnpm dlx eas-cli login
pnpm dlx eas-cli build:configure
# Set your own project ID, bundle IDs, signing identities and push credentials first.
pnpm dlx eas-cli build --profile development --platform android
pnpm dlx eas-cli build --profile development --platform ios
pnpm dlx eas-cli build --profile production --platform all
```

The checked-in `eas.json` has development, preview and production profiles. Android FCM and iOS APNs credentials belong in EAS, never Git. `EXPO_PUBLIC_EAS_PROJECT_ID` is needed for push token registration. Native JS export verifies bundling, not a signed IPA/AAB or device functionality.

## Environment variables

| Name | Location | Purpose |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_NAME` | Client | Product name; currently `[APP_NAME]` |
| `EXPO_PUBLIC_SUPABASE_URL` | Client | Supabase project API URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Client | Public client key; RLS remains essential |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Client | Expo push project identity |
| `EXPO_PUBLIC_AI_ENABLED` | Client | AI UI flag, default `false`; college server flag also required |
| `WEB_ORIGIN` | Edge Function | Exact allowed browser origin |
| `SCHEDULER_SECRET` | Edge Function only | Authenticates scheduled job dispatch |
| `EXPO_ACCESS_TOKEN` | Edge Function only, optional | Expo push service authentication |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Edge Function only | Test account only; IDs must start `rzp_test_` |
| `AI_PROVIDER_URL`, `AI_PROVIDER_KEY` | Edge Function only | HTTPS document Q&A adapter |
| `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_KEY` | Edge Function only | HTTPS digest email adapter |
| `RSS_ALLOWED_HOSTS` | Edge Function only | Comma-separated exact feed host allowlist |

Supabase supplies its URL, anon key and service key to Edge Functions. Set provider secrets with `supabase secrets set` or the project dashboard, not in client configuration. New project API/provider hostnames may also need cloud environment network access settings.

## Edge Functions and scheduled work

```sh
supabase functions serve campus-api
# After linking an operator-owned project:
supabase db push
supabase functions deploy campus-api --no-verify-jwt
```

The handler independently verifies student bearer tokens with Supabase Auth. The scheduled `jobs` action instead requires its exact scheduler secret; `--no-verify-jwt` allows that route to reach the handler. All privileged actions enforce membership/role before using the service client. Do not deploy modified handlers that omit those checks.

Configure a secure scheduler to POST `{ "action": "jobs" }` to `/functions/v1/campus-api` every five minutes, with `Authorization: Bearer <SCHEDULER_SECRET>`. Scheduling is an operator action; it is not installed by migrations. Reminder/digest creation is idempotent. Push and digest email jobs are leased, bounded and retried. Expo API acceptance is not proof of device delivery; receipts/device testing remain part of release validation.

The email adapter accepts `{to, subject, text}`, a Bearer key, and an `Idempotency-Key` header. Supply an HTTPS provider adapter with that contract. Without it email jobs remain queued; in-app digests still work when the scheduler runs. The AI adapter accepts `{documentUrl, question, instructions}` and returns `{text}`. AI is disabled by default, requires a college flag and provider configuration, and always carries the warning `AI-generated, may be wrong`.

Razorpay uses test hosted payment links, which open on both native and web. Return to the app and confirm payment; the backend checks provider status and amount before marking a ticket paid. Paid events cannot be RSVP'd without a verified paid ticket. No live keys are accepted. Refund/reconciliation workflows require further operator work before accepting real payments.

RSS sync is admin-only, requires an exact allowed source hostname and HTTPS, refuses redirects, limits item count and labels each source. Add the feed with organization/operator approval, then refresh from the News screen.

## Tests and CI

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db     # real isolated Postgres, minimal auth/storage harness, Docker required
pnpm exec playwright install chromium
pnpm test:e2e   # deterministic UI contracts, API fixtures, desktop + mobile web
# On this cloud machine use its installed browser:
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium pnpm test:e2e
```

`test:db` validates the real migrations and PostgreSQL policies/RPCs, including cross-college denial, anonymous identity protection, audited reveal, protected roles, poll privacy, offline retry idempotency, paid RSVP gating and account deletion. Its auth/storage fixtures are intentionally minimal; it does not exercise Supabase Auth or Storage HTTP services. Browser fixtures are explicit and do not claim live OTP verification. CI also typechecks the Deno Edge Function and exports the web app.

## Web deployment

Set public client variables before the build: Expo embeds them into the bundle.

- **Vercel:** import this monorepo, set project root `apps/campus`, install from the workspace root, and use its `vercel.json` build/output/SPA rewrite settings. Confirm pnpm workspace support on the selected Vercel plan.
- **Netlify:** import from repository root; `netlify.toml` builds the workspace and publishes `apps/campus/dist` with the SPA fallback.
- **Cloudflare Pages:** root repository, command `pnpm build`, output `apps/campus/dist`, Node 22 and pnpm 11.25.0. Pages supplies its automatic SPA fallback when no top-level `404.html` is present.

Verify direct deep links, response security headers, OTP delivery, auth redirects, storage authorization and each enabled provider against staging before public launch. No deployment has been performed in this workspace.

## Privacy, safety and operations

Consent is required before posting. Student subscriptions are absent. Sponsors have aggregate metrics only; branch/year targeting requires consent. Export contains the requesting user's profile, authored posts and owned feature records. Deletion is requested by the student and fulfilled by a college administrator through the Edge Function, which removes private files before a transactional identity/content deletion. Minimal audit records survive deletion with actor references removed where appropriate. Account backups/provider retention and legal retention periods require a published operator policy.

Anonymous author identity is absent from public posts and poll read grants. A reveal requires college moderator access and a reason, and writes an audit entry before returning the user ID. Keep service credentials restricted to trusted server operators. College admins are privileged operators, not an anonymity boundary against the database owner.

Private uploads are limited to 10 MB and PDF/JPEG/PNG/WebP. Images are resized/compressed before upload; signed URLs expire after 60 seconds. Storage is college-isolated. Files intentionally shared with a college are readable by verified college members. Malware scanning and a formal abuse operations runbook are release hardening tasks.

Offline feed/draft caches are per account on the device; retry IDs prevent duplicate posts. Crisis keyword checks run only in client memory and display India helpline resources without persisting a classification. Quiet hours use India time. English and Hindi foundational strings are provided; several feature forms still need full translation and device screen-reader review. This repository supports DPDP data-minimization/consent/export/deletion principles; it is not a legal compliance certification.
