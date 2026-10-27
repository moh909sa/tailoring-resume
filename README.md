# AI Resume Tailoring

An Expo iOS, Android, and web app with Home, Tailor, and Library bottom tabs. Home links directly to Tailor CV, My CVs, and Tailored CVs. It uploads PDF/DOCX originals to the existing Resume-Matcher backend and lists the signed-in user's saved CVs. Files are limited to 4 MiB. Processing failures stay visible alongside the saved original.

## Existing services

- Supabase Auth: https://suvcisvnbwplbemuxspu.supabase.co
- Railway: https://resume-matcher-production-0ffd.up.railway.app
- Upload: `POST /api/v1/mobile/resumes/upload`, multipart field `file`
- List: `GET /api/v1/mobile/resumes`, an array of CV metadata
- Delete: `DELETE /api/v1/mobile/resumes/{id}`, HTTP 204 on success
- Background tailoring: `POST /api/v1/mobile/tailor/jobs` (HTTP 202), JSON `resume_id`, `job_description`, and secure UUIDv4 `progress_id`; no length or intensity preferences
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

`lib/tailoring/TailoringProvider.tsx` keeps the existing owner-scoped review workflow. `lib/tailoring/jobs.ts` manages durable background jobs with the same authenticated API client. Each new job gets a secure Expo Crypto UUIDv4. Its ID, exact form inputs, and start time are written to owner-scoped AsyncStorage before the short `POST /api/v1/mobile/tailor/jobs` request. The backend’s canonical progress ID is persisted on acceptance. Device storage failure prevents submission.

The processing screen preserves its document animation, elapsed-time counter, seven stages, and styling. Foreground jobs poll `GET /api/v1/mobile/tailor/progress/{progress_id}` every 1.75 seconds with no overlapping reads. Queued jobs continue polling. Checks come only from `completed_steps`; only a running `current_step` spins, and optional/visited-only steps remain muted. The counter uses persisted/server timestamps and never advances stages.

AppState pauses reads while backgrounded and reconciles them on foreground. Startup checks the saved job and `GET /api/v1/mobile/tailor/jobs/recent`, including recovery if the acceptance response was lost. Queued/running/succeeded/failed/interrupted states come from the backend. The Railway worker continues independently of client requests or application lifetime.

On success, `GET /api/v1/mobile/tailor/jobs/{progress_id}/result` retrieves the existing preview/review, persists the review pointer, and opens the existing Keywords Review automatically. Root navigation waits for the navigator to mount and acknowledges recovery only after the destination is reached. A delivered-job marker prevents old completed jobs from reopening. The existing review cache still stores only references, inputs, step, selections, and pending review navigation; full CV contents are not cached.

All automatic recovery uses GETs. Network interruption, restart, and lost HTTP 202 acknowledgements never trigger another AI submission. An explicit “Retry same job” resends the same idempotent progress ID when submission is unconfirmed. Explicit Retry for server-reported failed/interrupted jobs creates a fresh ID. Backgrounding/account changes/unmount cancel client transport only, and never delete the durable job reference or cancel the server worker.
Success opens a three-step review wizard automatically. The Tailor screen links back to an unfinished review.

1. **Optimize Keywords:** displays the backend ATS estimate and score history, supported and attestation-required suggestions, applied keywords, placements, warnings, and an expandable current resume. All returned suggestions appear in one scrollable list without batching. Users choose multiple skills before applying; “I have this” explicitly attests skills absent from the original. Every keyword request uses the latest `preview.preview_id`. The returned preview and review replace the current draft, enabling repeated applications within the backend limit of 30 keywords. Scores can rise, fall, or remain unchanged.
2. **Review Changes:** shows the backend’s five summary counts, expandable section comparisons with word-level highlighting, and high risk warnings. Grounding checks appear here and in the final safety review as plain-language experience and bullet locations; raw server warnings remain intact. Keyword selection never accepts experience claims automatically. The engine marks high risk diffs with `confidence: "high"`. Missing counts and comparisons remain unavailable and produce warnings; they are never inferred.
3. **Confirm & Save:** displays the current score, total changes, unapplied selections, and safety warnings. An explicit tap checks the latest review before posting confirmation. If the preview changed, the user must review it again. Confirmation takes no body and saves a separate tailored CV, leaving the original unchanged. A concise saved acknowledgement ends the experience.

Review endpoints use the existing Supabase bearer token:

- `GET /api/v1/mobile/tailor/{tailoring_id}/review`
- `POST /api/v1/mobile/tailor/{tailoring_id}/keywords` with `expected_preview_id` and `{keyword, attested}` entries
- `POST /api/v1/mobile/tailor/{tailoring_id}/confirm` with no body

409 conflicts and uncertain mutation outcomes reload the latest review without resubmitting. Validation errors preserve choices; expired previews require explicit regeneration with preserved inputs. Loading the Tailored CVs library, post-confirmation editing, and export are not connected.

Run the response, diff, and authenticated-request regression tests with `node --test tests/tailoring-review.test.cjs tests/tailoring-progress.test.cjs tests/tailoring-jobs.test.cjs`. Fixtures are isolated test data and never appear in the app.

Use Draftbit Publishing for native builds and web deployments.
