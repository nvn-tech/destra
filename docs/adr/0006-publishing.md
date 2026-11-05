# 0006 — Publishing to Instagram

**Status:** accepted · 2026-11-05

## Decision

- **Approve and schedule in one step:** `POST .../variants/:id/approve` with `scheduledAt`.
  - Requires the attestation, an active Instagram connection and a format we can publish.
  - The time must be between 5 minutes and 75 days ahead.
  - Approving without a schedule is still possible.
  - `PATCH` and `DELETE /publications/:id` reschedule and cancel. Cancelling returns the post to "approved".
- **Rendering:** slides become 1080×1350 PNGs with satori + resvg (`packages/media`), using the same pine template as the review preview. The CRM/RQE identification is drawn on every slide and added to the end of the caption.
  - Both come from `signatureLine()` in `@destra/shared`, so the preview and the post can't differ.
  - A test fails if any text, including the signature, falls outside the canvas.
- **Storage:** a private S3 bucket (`sa-east-1`), with 2-hour presigned URLs for Meta to fetch. In development, `LocalMediaStore` writes files that the API serves at `/v1/media/*` with an HMAC-signed, expiring URL.
- **Workflow:** `publishWorkflow` (`publish-<publicationId>`).
  - It re-reads the publication on every wake-up and sleeps at most 6 hours at a time, so reschedules, cancellations and the kill switch take effect without signals.
  - It restarts with fresh history (continue-as-new) after 50 loops.
- **Publishing activity:** locks the row, then re-checks at publish time:
  - The kill switch.
  - That the variant is still selected and not blocked.
  - The professional profile and the active connection.

  Then it renders and uploads, creates the containers (carousel of 2–10, or a single image), waits until processing is `FINISHED`, checks the 24-hour publishing limit, and publishes.
- **Never posting twice:**
  - Container IDs and the final caption are saved before publishing.
  - A retry reuses the saved container.
  - If the container is already `PUBLISHED` (Meta's response was lost), the activity finds the post in recent media by its exact caption and records it, instead of publishing again.
- **Failures:**
  - A revoked token marks the connection expired and stops (`MetaAuthError`).
  - A request Meta rejects fails immediately with Meta's reason (`PublishRejected`).
  - Rate limits, slow processing and the daily limit are retried with backoff.
- **Not automated yet:** reels and videos (we have scripts, not video files). The API and the panel say so plainly.

## Verification status

Tested against `FakeGraph` and a local media store, never against Meta. With a real app, confirm:

- Container processing times.
- Image URL requirements (Meta must reach the presigned S3 URL).
- The `content_publishing_limit` fields.
- That `media_publish` doesn't need extra page tasks.

## Local development

`scripts/fake-meta.mjs` plus `scripts/run-publish.mjs`, which publishes due posts once without Temporal.
