# Dayflow

Dayflow is a personal productivity workspace built with Next.js 15, React 19, and TypeScript. It includes tasks, notes, weekly habits, a focus timer, an agenda, an AI planning assistant, light/dark/system themes, sound and accessibility preferences, optional Google sign-in, guest accounts, and optional Google Calendar event access. Creator credit: **Jryan Haymon**.

## Run locally in Visual Studio Code

Requirements: Node.js 20.9 or newer (npm is included with Node.js).

1. Download and unzip the Dayflow project.
2. In Visual Studio Code, choose **File → Open Folder** and select the unzipped `dayflow` folder. Open **Terminal → New Terminal**.
3. Run `npm install` once to install the app's dependencies.
4. Run `npm run dev` to start Dayflow.
5. Open <http://localhost:3000> in your browser. Keep the terminal open while you use the app; press **Ctrl+C** there when you want to stop it.

No `.env.local` file is needed for local guest use. Tasks, notes, habits, chat history, and preferences save in this browser. Local data is not synced or backed up. To connect Supabase, Google Calendar, or live AI, follow the optional setup sections below, put the corresponding keys in a private `.env.local` file, and restart the app.

## Supabase accounts and cloud sync

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL Editor. This creates the private workspace table and row-level security policies.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
4. In Supabase Auth, enable Google and anonymous sign-ins, and enable manual identity linking. Anonymous users receive isolated cloud workspaces; linking Google from a guest session keeps that workspace under the same account. Guest accounts cannot be recovered after signing out or clearing browser data until linked to Google.
5. Add `http://localhost:3000/auth/callback` to the Supabase Auth redirect URL allow list.
6. Restart Dayflow. Continue as guest or use Google from Settings.

Cloud mode saves each account's workspace snapshot to `user_workspaces`. The table uses row-level security so each user can only read and write their own row. Do not use a Supabase service-role key in the browser.

## Optional Google Calendar

1. Configure Google as a Supabase Auth provider using a Google OAuth client.
2. In Google Cloud Console, add the Supabase callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) as an authorized redirect URI and enable the Google Calendar API.
3. Add the Google client ID and secret to the Supabase provider settings.
4. Put the same values in `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.
5. Sign in with Google from Dayflow Settings and approve the Calendar events permission.

Dayflow stores Google access and refresh tokens only in HttpOnly cookies. The Calendar page lists events in the next 14 days and can create events in the primary calendar. Sign out clears these cookies. Calendar access requires HTTPS outside localhost and a correctly configured Google OAuth consent screen.

## Optional live AI

Add `OPENAI_API_KEY` to `.env.local` and restart the server for live assistant responses. `OPENAI_MODEL` optionally selects a model; the default is `gpt-4o-mini`. The key stays server-side. Without it, the assistant displays a setup message instead of returning a canned reply.

## Install Dayflow on iPhone

Dayflow is an installable web app (PWA), not a separate App Store download. To install it on iPhone:

1. Deploy Dayflow to a public **HTTPS** address. A development server running at `localhost` on your computer is only reachable from that computer, so it cannot be installed directly on the iPhone.
2. Open the deployed address in **Safari** on the iPhone while connected to the internet.
3. Tap **Share → Add to Home Screen → Add**. Launch Dayflow from its new Home Screen icon.
4. Leave it open online once so the app shell and files can be cached for offline reopening.

The iPhone layout has a bottom navigation bar, safe-area spacing, touch-sized controls, and an Apple Home Screen icon. The service worker caches the app shell and static files; network-dependent services such as Google Calendar and the AI assistant still need an internet connection. Guest data is stored separately on each device. To sync tasks and notes between computer and iPhone, deploy with Supabase credentials from the setup section above and sign into the same account on both devices.

For a production-style local check, run `npm run build` and then `npm start`. The service worker is intentionally disabled in the development server to avoid stale cached files while editing.

## Commands

- `npm run dev` — development server.
- `npm run build` — production build.
- `npm start` — run the production build.
- `npm run lint` — ESLint.

The Supabase browser/server helpers and the AI assistant endpoint are included. Calendar sync, authentication, and cloud sync require their respective external credentials and provider setup. Keep `.env.local` private.
