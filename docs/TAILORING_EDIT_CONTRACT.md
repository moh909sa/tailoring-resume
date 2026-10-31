# Saved mobile CV editing contract

The tailoring review remains read-only. After Keywords and Changes, Confirm & Save sends `expected_preview_id` to `POST /api/v1/mobile/tailor/{tailoring_id}/confirm`. Railway atomically rejects a changed preview. A successful acknowledgement opens the saved tailored CV editor; older bodyless confirmation clients remain compatible.

All editor operations require the existing Supabase bearer session and ownership of the tailoring record and its saved engine resume. They never modify the uploaded original. The unauthenticated desktop routes stay blocked in mobile deployments.

## Canonical document and autosave

- `GET /api/v1/mobile/tailored-cvs/{id}/editor` returns `tailoring_id`, integer `revision`, `updated_at`, structured `resume`, job context, `confirmed_skills`, and optional analysis. This is current engine content, not the original confirmation snapshot.
- `PATCH` on the same route accepts `expected_revision`, a secure UUID `mutation_id`, `resume`, and `confirmed_skills`. The existing schema is validated while raw fields and metadata are preserved. User edits do not run AI rewriting or overwrite their original CV.
- Content, immutable revisions, and mutation receipts are saved atomically in the existing private mobile engine database on Railway’s persistent volume. A repeated mutation returns its own acknowledgement; different content cannot reuse the same mutation ID. Stale versions return 409. Invalid documents return 422 without replacing the last valid revision.
- Frontend recovery drafts include the canonical base revision, latest edits, confirmations, and any pending mutation. They are scoped by account and document, written before transport, and retained after ambiguous failures. Session generations fence late writes. Conflicts require an explicit choice; exports wait for the latest saved acknowledgement.
- `GET /api/v1/mobile/tailored-cvs?status=ready&limit=30&offset=0` lists owned saved documents and canonical save timestamps for reopening.

## Job Match

`GET/POST /api/v1/mobile/tailored-cvs/{id}/ats-score` retrieves or recalculates analysis; POST accepts `expected_revision`. Results include current/stale/unavailable status, analyzed revision, calculation time, job hash, scoring version, score breakdown, complete matched/missing evidence, and required/preferred skills. Recalculation is deterministic from cached job extraction, without AI generation. Missing extraction remains unavailable rather than a fabricated score. Rendering and scoring normalize visible supported content consistently.

User-confirmed skills can be saved freely alongside their resume edits. Confirmation means the user personally attested possession; it does not fabricate work history, certificates, or achievements.

## Actual PDF preview and export

`GET /api/v1/mobile/tailored-cvs/{id}/pdf?revision=N&page_size=A4|LETTER` exports the identified immutable revision using the existing single-column Resume-Matcher print pipeline. Responses are authenticated, private/no-store PDFs with `X-Resume-Revision`, `X-PDF-Page-Count`, and `Content-Disposition` exposed to allowed browser origins. Missing layout metadata is completed without dropping populated supported/custom sections; explicit visibility flags remain respected.

The app validates the PDF response and displays/downloads the same artifact. iOS uses a cached file, WebView, and the native share sheet; web uses a Blob iframe/download. `POST /api/v1/mobile/tailored-cvs/{id}/parse-check` accepts `expected_revision` and `page_size` and checks a render of that same frozen document/settings. Readability checks are advisory and distinct from job match.

Arbitrary unknown raw fields survive editing/storage; the existing print templates render the supported resume schema and `customSections`. Native PDF display and Save to Files must be checked on an iPhone simulator or published build.
