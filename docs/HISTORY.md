# Product decisions

- Original CV storage and AI processing are separate: a processing failure never hides a saved original.

- Home, Tailor, and Library separate preparation from original-file management; AI tailoring stays disabled until the real workflow is connected.

- Original CV deletion requires confirmation and is handled by Railway for every processing status; the app never deletes Storage files directly.

- Tailoring uses a three-step review with explicit skill attestation and final confirmation; only the server supplies scores and changes, and original CVs remain unchanged.

- Processing displays only real Resume-Matcher stage progress; authenticated polling is independent of the authoritative preview request and never adds AI work.

- Tailoring runs as a durable Railway background job; saved IDs and GET-only recovery survive backgrounding and relaunch without automatically repeating AI work.

- Grounding checks appear alongside Changes and the final safety review with readable experience/bullet locations; keyword suggestions are never paginated by the backend application limit.
