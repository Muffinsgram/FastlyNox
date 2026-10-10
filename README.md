# Fastlynox

Fastlynox is a React/Vite communication app. Supabase provides authentication, Postgres, storage, and realtime updates. LiveKit provides voice rooms.

## Local setup

1. Copy `.env.example` to `.env` and fill in the Supabase and LiveKit values.
2. Apply `rls-security-policies.sql`, `migration_server_creation.sql`, `migration_edit_delete.sql`, `migration_message_reactions.sql`, `migration_message_replies.sql`, `migration_profile_customization.sql`, `migration_channel_order.sql`, `migration_global_announcements.sql`, then `migration_chat_mentions_notifications.sql` to the Supabase project. The server creation migration installs the atomic server creation and owner-only deletion RPCs; profile customization also adds banner framing controls. The chat notification migration installs mention delivery and unread server badges; only server owners and admins can broadcast `@everyone`.
3. Apply `migration_friendships_realtime.sql`, `migration_user_presence.sql`, and `migration_realtime_sync_reliability.sql` in the Supabase SQL Editor after the base schema. The last migration adds per-window presence sessions, DM unread notifications, and the realtime publication/replica-identity settings used for reconnect recovery. It preserves existing rows; if it reports duplicate legacy friendship pairs, reconcile those rows before rerunning so the uniqueness guarantee can be installed.
4. Install dependencies with `npm install`.
5. Start the app with `npm run dev`.

## Deploying the web app to Vercel

Import `Muffinsgram/FastlyNox` as a Vite project in Vercel (build command `npm run build`, output directory `dist`). Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_PUBLIC_APP_URL` for Production, Preview, and Development. `VITE_PUBLIC_APP_URL` should be the canonical HTTPS domain attached to the Vercel project; replace the example `fastlynox.vercel.app` if Vercel assigns a different hostname or you use a custom domain. Keep the Supabase service-role key out of Vercel and the browser; the invite preview uses two narrowly scoped, anonymous SQL functions instead.

Before deploying, run `migration_public_invite_preview.sql` in the Supabase SQL editor. Vercel serves public invite previews with server-rendered title/Open Graph metadata, a join button, a sitemap of servers that have a public vanity URL, and a robots file. Short, expiring or limited-use invite codes remain usable but are marked `noindex`; public vanity links can appear in Google after the domain is verified in Search Console and the sitemap is submitted. Google indexing can take time and is not guaranteed. Existing invite URLs automatically use the current web origin, so generated links work on the Vercel/custom domain.

The web deploy does not replace the Windows desktop release. The `Build and publish Windows release` workflow builds that installer after a version tag is pushed.

## Windows desktop app and automatic updates

The Windows desktop build uses Electron and checks the public GitHub Releases page for `Muffinsgram/FastlyNox` whenever the installed app starts. If a newer release exists, it downloads in the background. A small update control appears in the title bar when the download is ready; choosing it restarts the app and installs the release. If you simply close the app, the downloaded update installs on the next launch.

For local desktop development, start Vite with `npm run dev`, then start Electron in a second terminal with `npm run desktop:dev`. Build a Windows installer locally with `npm run dist:win`; the installer is written to `%LOCALAPPDATA%\Fastlynox\windows-build\` to avoid Windows rename restrictions in protected project folders.

To publish an update, add the Actions repository secrets `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_PUBLIC_APP_URL`, `VITE_LIVEKIT_URL`, and `VITE_LIVEKIT_API_KEY` in GitHub Settings → Secrets and variables → Actions. `VITE_GIPHY_API_KEY` is optional. Then push a semantic-version tag such as `v1.0.1` and let the **Build and publish Windows release** GitHub Action finish. The action builds a Windows NSIS installer and publishes the installer plus updater metadata to GitHub Releases. Keep releases public and do not edit or delete the generated `latest.yml`, `.exe`, or `.blockmap` assets. Never add `LIVEKIT_API_SECRET` to the desktop build secrets; it belongs only in the Supabase Edge Function environment.

The app currently targets Windows x64. Windows may show a SmartScreen warning because the installer is not code-signed; automatic update delivery works without signing, but a code-signing certificate improves publisher trust.

The LiveKit API secret must be stored as `LIVEKIT_API_SECRET` without a `VITE_` prefix. Vite's local development endpoint uses that server-side value. Never put it in browser code or commit `.env`.

## Deploying voice token issuance

Deploy `server-voice-control` together with the client when updating voice moves. The function now changes the existing presence row's channel, which the client uses to distinguish moderator moves from ordinary heartbeats. Self-hosted LiveKit uses this update to reconnect the member with a fresh room token; LiveKit Cloud additionally uses its native move API. Function errors are read from the response body, and expired sessions are refreshed once before retrying.

The production client calls the Supabase Edge Function at `supabase/functions/livekit-token`. Deploy it with `supabase functions deploy livekit-token`, then set `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` as Edge Function secrets. The function validates the user's Supabase session, verifies voice-channel membership, and returns a ten-minute token. The separate Vite middleware is for local development and preview only.

## GIF picker

The composer includes emoji selection and GIPHY search/trending. Set `VITE_GIPHY_API_KEY` in your local `.env`; do not commit `.env`. GIPHY requires searches from the client and attribution, so the picker links results to GIPHY and labels them “Powered by GIPHY.”

## Seven-day attachment retention

To automatically delete attachment files older than seven days, deploy `supabase/functions/cleanup-expired-attachments` and set the Edge Function secret `ATTACHMENT_CLEANUP_SECRET` to a long random value. Then add the project URL and the same cleanup secret to Supabase Vault under the names shown in `migration_attachment_expiry.sql`, and run that SQL to schedule a daily cleanup. The cleanup endpoint uses that secret for authentication (`supabase/config.toml` disables gateway JWT checks for this endpoint). The job deletes expired files and clears their message attachment references. This scheduled deletion requires the Supabase project to be configured; the local app alone cannot run a reliable background retention job.

Run the SQL scripts in Supabase before expecting cross-user edit/delete events, private media, or seven-day deletion to be active. The client updates the sender's own message immediately after the database confirms an edit or delete; other sessions receive the change through Supabase Realtime.

The reactions migration creates separate server and DM reaction tables with per-user uniqueness, participant-only RLS, and Realtime publication. Reaction buttons remain unavailable until that migration has been applied.

Profile photo, banner and bio editing requires `migration_profile_customization.sql` to be applied before using the upload controls. Uploaded images are resized to WebP in the browser (animated GIF avatars and banners are preserved) and stored in the public profile-media bucket; users can write only to their own storage folder. Banner zoom and focal point are saved with the profile.

`migration_global_announcements.sql` adds a cross-app live announcement feed, private reminders with browser notifications, one-way profile following, media posts, and 24-hour stories. To grant your account announcement publishing rights, find its UUID in Supabase Authentication → Users and run `INSERT INTO public.app_admins (user_id) VALUES ('YOUR_USER_UUID') ON CONFLICT DO NOTHING;` in SQL Editor. Authenticated users can read the announcement feed; only explicitly listed app admins can publish or remove announcements. Redeploy `cleanup-expired-attachments` after applying this migration so its daily sweep also removes expired story media.

## Checks

- `npm run lint`
- `npm test`
- `npm run build`

The database and Edge Function require a configured Supabase project for live integration testing. The current UI/API contract does not yet provide database schema migrations for every table, so the SQL scripts assume the existing Fastlynox tables and columns.
