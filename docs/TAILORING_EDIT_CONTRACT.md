# Required mobile tailoring edit contract

The deployed OpenAPI schema exposes no authenticated mobile operation for editing a tailoring draft. `POST /api/v1/mobile/tailor/{tailoring_id}/confirm` has no request body and approves the saved server-generated preview. `PATCH /api/v1/mobile/resumes/{resume_id}` only renames a resume. The separate `PATCH /api/v1/resumes/{resume_id}` updates a resume, but does not provide a mobile tailoring-draft revision or a documented link to mobile confirmation; the app must not substitute it for draft editing or risk changing the master CV.

Until the following contract exists, Save displays a read-only draft. No local edit fields or edited-save claims are exposed. Existing confirmation continues to save the server preview after the existing latest-draft and expiry checks.

## Structured draft update

A proposed operation is `PATCH /api/v1/mobile/tailor/{tailoring_id}/draft` (this endpoint is a requirement, not an implemented route).

- Authenticate with the current Supabase bearer token and enforce ownership of the tailoring job and draft.
- Accept `expected_preview_id` and `resume`, where `resume` contains the structured CV schema, including original section metadata and existing custom sections.
- Accept a client-generated `mutation_id` for idempotency so an ambiguous network response can be reconciled without duplicating a revision.
- Validate structured fields and factual/grounding constraints on the server. Preserve edit provenance as user-authored, without treating edits as automatic attestation of accuracy.
- Preserve the original master CV; store edits only as a new tailoring-draft revision.
- Return the canonical updated `preview` and `review` objects with a new `preview.preview_id`, expiry, and current verification flags/warnings. `GET /review` must return the same revision.
- Explicitly report whether ATS analysis is current for that revision. Keep the earlier score identified as an earlier analysis if no recalculation occurs; never imply an updated score.
- Return clear authentication, ownership, validation, expired-preview, and stale-version failures (401, 403/404, 422, 410, and 409). Validation failures must preserve the last valid revision.

## Confirmation bound to the edited revision

The authenticated mobile confirmation operation must accept `expected_preview_id` and atomically reject a different or expired current revision. A preflight GET alone does not guarantee that confirmation targets the edited revision if another request changes the draft between GET and POST.

Confirmation must retain existing factual checks, be replay-safe, and return a saved acknowledgement identifying the confirmed revision. The UI may show success only after that acknowledgement. A failed edit update must never fall through to confirmation of the older preview.

No backend or service configuration changes are part of the UI implementation.
