# Product decisions

- Original CV storage and AI processing are separate: a processing failure never hides a saved original.

- Home, Tailor, and Library separate preparation from original-file management; AI tailoring stays disabled until the real workflow is connected.

- Original CV deletion requires confirmation and is handled by Railway for every processing status; the app never deletes Storage files directly.

- Tailoring generates a review-only Railway preview with no client limits; stage completion requires real backend information and never advances on a timer.
