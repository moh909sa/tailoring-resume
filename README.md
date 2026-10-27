# AI Resume Tailoring

An Expo iOS, Android, and web app with Home, Tailor, and Library bottom tabs. Home links directly to Tailor CV, My CVs, and Tailored CVs. It uploads PDF/DOCX originals to the existing Resume-Matcher backend and lists the signed-in user's saved CVs. Files are limited to 4 MiB. Processing failures stay visible alongside the saved original.

## Existing services

- Supabase Auth: https://suvcisvnbwplbemuxspu.supabase.co
- Railway: https://resume-matcher-production-0ffd.up.railway.app
- Upload: `POST /api/v1/mobile/resumes/upload`, multipart field `file`
- List: `GET /api/v1/mobile/resumes`, an array of CV metadata
- Delete: `DELETE /api/v1/mobile/resumes/{id}`, HTTP 204 on success
- Preview: `POST /api/v1/mobile/tailor/preview`, JSON `resume_id` and `job_description`; no length or intensity preferences
- All requests use the current Supabase user access token as a bearer token. The app does not access Supabase Storage directly or create infrastructure; Railway owns file and record removal.

## Configuration

Draftbit environment variables (development, staging, and production):

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: client-safe `sb_publishable_...` key
- `EXPO_PUBLIC_RESUME_API_URL`

Server-only Supabase secrets belong on Railway, never in the mobile app.

## Authentication and uploads

My CVs contains the existing sign-in/account creation form in an account sheet. Supabase currently requires email confirmation for new accounts. Confirm the account by email, then return to sign in. Sessions persist between launches; native refresh follows app foreground state.

Native iOS uses the system Files picker and uploads the selected URI with its original filename and canonical MIME type. Web uses the browser picker and File object. Railway processes uploads synchronously, so the app distinguishes sending the file from waiting for processing. It reloads the list even after an error because an original may already have been saved.

Each My CVs card has a three-dot menu with Delete CV and a confirmation dialog. Deletion is available for every processing status. After HTTP 204, the app removes the card and refreshes the list. Errors keep the dialog open for retry; a failed refresh does not restore a confirmed deletion.

## Web access

Railway's `CORS_ORIGINS` must include the exact browser origins, preserving any port. Development: `https://2272b89538.sandbox.draftbit.dev:5101`; staging: `https://d4d5c0e323.draftbit.dev`; production: `https://4a53e9e740.draftbit.dev`. Use the current sandbox Metro port for local browser inspection. Native iOS requests do not need CORS.

## Structure

- `app/(tabs)/home.tsx`: dashboard; `app/(tabs)/tailor.tsx`: preparation form
- `app/(tabs)/library/`: My CVs and Tailored CVs with shared section navigation
- `app/index.tsx`: Home redirect; `app/my-cv.tsx`: legacy My CVs redirect
- `components/layout/` and `components/library/`: safe-area shells, headers, and section navigation
- `components/cv/`: original-CV screen, account form/sheet, real-CV selection sheet, document rows, empty states, and notices
- `lib/auth/` and `lib/supabase.ts`: authentication
- `lib/cv/`: typed responses, file validation, platform adapters, requests, and screen state
- `app/tailoring/`, `components/tailoring/`, and `lib/tailoring/`: processing, preview review, and owner-scoped workflow state
- `theming/`: shared light/dark colors and typography

## Tailoring status

Tailor CV generates real previews from Ready originals and pasted job descriptions of 50–12,000 characters. Job URL input remains on the form, with guidance to paste the description for tailoring. No page limits, bullet limits, or intensity preferences are sent.

`lib/tailoring/TailoringProvider.tsx` retains the input and full response in owner-scoped memory, prevents duplicate submissions, and aborts and clears data when accounts change. The synchronous request waits up to ten minutes. Errors stop the timer and preserve inputs for explicit Retry; no automatic retry follows a network failure.

The full-screen processing route shows an animated document indicator, wall-clock elapsed time, and the seven Resume-Matcher stages. Since the mobile API exposes no live stages, all individual stages stay pending. The timeline accepts explicit running/completed/skipped statuses for a future backend adapter; no stages or percentages are inferred from time or success.

Success opens a review with Resume, Analysis, and Changes tabs and any returned warnings. The entire response stays in application state, including optional ATS, keywords, writing feedback, and resume content. No confirmation endpoint is called and the original stays unchanged. Previews are not persisted on the device; reopening a review after app restart requires generating a new preview. Approval/saving and loading the Tailored CVs library are not connected.

Use Draftbit Publishing for native builds and web deployments.
