# Product decisions

- Original CV storage and AI processing are separate: a processing failure never hides a saved original.

- Home, Tailor, and Library separate preparation from original-file management; AI tailoring stays disabled until the real workflow is connected.

- Original CV deletion requires confirmation and is handled by Railway for every processing status; the app never deletes Storage files directly.

- Tailoring uses a three-step review with explicit skill attestation and final confirmation; only the server supplies scores and changes, and original CVs remain unchanged.
