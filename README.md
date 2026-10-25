# AI Resume Tailoring

An Expo iOS, Android, and web app with Home, Tailor, and Library bottom tabs. Home links directly to Tailor CV, My CVs, and Tailored CVs. It uploads PDF/DOCX originals to the existing Resume-Matcher backend and lists the signed-in user's saved CVs. Files are limited to 4 MiB. Processing failures stay visible alongside the saved original.

## Existing services

- Supabase Auth: https://suvcisvnbwplbemuxspu.supabase.co
- Railway: https://resume-matcher-production-0ffd.up.railway.app
- Upload: `POST /api/v1/mobile/resumes/upload`, multipart field `file`
- List: `GET /api/v1/mobile/resumes`, an array of CV metadata
- Both requests use the current Supabase user access token as a bearer token. The app does not upload directly to Supabase Storage or create infrastructure.

## Configuration

Draftbit environment variables (development, staging, and production):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: client-safe `sb_publishable_...` key
- `EXPO_PUBLIC_RESUME_API_URL`

Server-only Supabase secrets belong on Railway, never in the mobile app.

## Authentication and uploads

My CVs contains the existing sign-in/account creation form in an account sheet. Supabase currently requires email confirmation for new accounts. Confirm the account by email, then return to sign in. Sessions persist between launches; native refresh follows app foreground state.

Native iOS uses the system Files picker and uploads the selected URI with its original filename and canonical MIME type. Web uses the browser picker and File object. Railway processes uploads synchronously, so the app distinguishes sending the file from waiting for processing. It reloads the list even after an error because an original may already have been saved.

## Web access

Railway's `CORS_ORIGINS` must include the exact browser origins, preserving any port. Development: `https://2272b89538.sandbox.draftbit.dev:5101`; staging: `https://d4d5c0e323.draftbit.dev`; production: `https://4a53e9e740.draftbit.dev`. Local browser inspection uses `http://localhost:42342`. Native iOS requests do not need CORS.

## Structure

- `app/(tabs)/home.tsx`: dashboard; `app/(tabs)/tailor.tsx`: preparation form
- `app/(tabs)/library/`: My CVs and Tailored CVs with shared section navigation
- `app/index.tsx`: Home redirect; `app/my-cv.tsx`: legacy My CVs redirect
- `components/layout/` and `components/library/`: safe-area shells, headers, and section navigation
- `components/cv/`: original-CV screen, account form/sheet, real-CV selection sheet, document rows, empty states, and notices
- `lib/auth/` and `lib/supabase.ts`: authentication
- `lib/cv/`: typed responses, file validation, platform adapters, requests, and screen state
- `theming/`: shared light/dark colors and typography

## Tailoring status

Tailor CV lets users select an original from the real CV service and enter a job description or URL. The Tailor My CV action is disabled and marked coming soon. The form does not call an AI service, fetch job URLs, persist job inputs, or generate records. Tailored CVs remains empty until an actual tailoring workflow is connected. CV data refreshes when its screen gains focus, including after returning from an upload.

Use Draftbit Publishing for native builds and web deployments.
