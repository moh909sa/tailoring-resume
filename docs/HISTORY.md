# Product decisions

- Original CV storage and AI processing are separate: a processing failure never hides a saved original.

- Home, Tailor, and Library separate preparation from original-file management; AI tailoring stays disabled until the real workflow is connected.

- Original CV deletion requires confirmation and is handled by Railway for every processing status; the app never deletes Storage files directly.

- Tailoring uses a three-step review with explicit skill attestation and final confirmation; only the server supplies scores and changes, and original CVs remain unchanged.

- Processing displays only real Resume-Matcher stage progress; authenticated polling is independent of the authoritative preview request and never adds AI work.

- Tailoring runs as a durable Railway background job; saved IDs and GET-only recovery survive backgrounding and relaunch without automatically repeating AI work.

- Grounding checks appear alongside Changes and the final safety review with readable experience/bullet locations; keyword suggestions are never paginated by the backend application limit.

- Review Changes emphasizes primary metrics and a calm expandable verification section, with complete struck-through original summaries beside word-level highlights.

- Review Changes keeps verification warnings with their individual comparisons and shows unmatched safety issues without a separate verification accordion.

- Review Changes uses connected accordions, compact added skills, and full description comparisons; Save holds the updated CV preview and outstanding added-skill checks.

- Save uses three live metrics and a neutral expandable verification review, retaining all safety details and explicit authenticated confirmation.

- Save displays an ordered complete CV directly; inline editing remains unavailable until authenticated versioned draft updates and revision-bound confirmation are supported.

- The read-only Save CV uses a continuous professional document layout with shared section headings, subtle dividers, and grouped entries.

- Confirm & Save hands off to a durable saved-CV editor with account-scoped recovery, revision-safe autosaves, explicit skill confirmation, current job-match analysis, and actual revision-bound PDF preview/export.
