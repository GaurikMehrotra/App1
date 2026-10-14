# [APP_NAME] implementation plan

## Architecture
One pnpm/Turborepo workspace. `apps/campus` uses Expo Router, React Native Web, strict TypeScript and NativeWind for Android, iOS and web. `packages/core` owns reusable validation, Supabase access, auth, types, design primitives and moderation interfaces. Supabase owns identity, Postgres, private storage, realtime and privileged Edge Functions. Client bundles contain only public Supabase configuration; service credentials never ship to clients.

All tenant data carries college_id. Database policies enforce verified membership independently of client filters. Anonymous authors will be held in a separate protected relation, with audited moderator access introduced in M3. Reputation derives from accepted contributions. Sponsors never receive student identities.

## Folder structure
- apps/campus/app: routes and responsive navigation
- apps/campus/src: campus-specific screens, providers and localization
- packages/core/src: reusable API, schemas, auth and UI
- supabase/migrations: versioned schema, grants, triggers and RLS
- supabase/tests: database authorization checks
- supabase/seed.sql: one demo college and default spaces
- .github/workflows: lint, typecheck and tests

## Milestones (review gates)
1. M1: workspace, college email OTP, verified profiles, tenant isolation, responsive base navigation, privacy consent and profile editing. Validate lint, TypeScript, unit tests, web export and database authorization where a local Supabase runtime is available. Review gate overridden by the later user instruction.
2. M2: communities, posts, threaded comments, votes, cursor feeds, search and offline queue.
3. M3: private anonymous authorship, reports, blocks, audited moderation, rate limits and abuse controls.
4. M4: notes/papers, moderated reviews, study tools and disabled-by-default provider-neutral AI interface.
5. M5: clubs, events, official announcements, push/in-app notification settings, ticket provider test adapter and QR check-in.
6. M6: placement tracker, mentorship, referrals, marketplace, lost-and-found and people matching.
7. M7: wellbeing controls, RSS news, organization tools and consent-based sponsorship.
8. M8: end-to-end flows, accessibility/performance passes and deployment hardening.

User updated the review gate: implement all milestones without intermediate stops, then report verified behavior and remaining gaps. Each milestone retains lint, typecheck and meaningful validation. Incremental normalized migrations introduce feature tables with RLS in their milestone; no unimplemented backend is presented as working.

## Open decisions and external prerequisites
- Product name remains [APP_NAME] until supplied; configure EXPO_PUBLIC_APP_NAME.
- Production college domains must be provided by the operator; seed uses demo.example.edu and must not admit real users.
- Live OTP requires an operator-owned Supabase project, configured email delivery and redirect URLs. Native store builds require EAS, signing identities and physical-device validation.
- DPDP consent, export/deletion fulfillment and retention policy require legal/operator review before production launch. M1 records consent, not a claim of legal certification.
