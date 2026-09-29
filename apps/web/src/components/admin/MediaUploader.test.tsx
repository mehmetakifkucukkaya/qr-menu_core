/**
 * Unit tests for `components/admin/MediaUploader.tsx` — Sprint E2 (D-033).
 *
 * Mirrors the pattern established by `components/billing/TrialBanner.test.tsx`
 * (Sprint C3b) — Node 22 + `node:test` runner + `--import tsx` + the
 * shared `src/test-dom.ts` jsdom bootstrap. We deliberately do NOT
 * pull in Vitest/Jest — V1 keeps the toolchain minimal.
 *
 * Coverage matrix (small, focused — D-033 calls for "minimal"):
 *   1. `describeValidationError` rejects oversized files.
 *   2. `describeValidationError` rejects non-image MIME when kind='image'.
 *   3. `describeValidationError` accepts a valid 1 MB JPEG.
 *   4. `formatMediaSize` formats bytes / KB / MB correctly.
 *   5. The component renders the dropzone + hidden file input.
 *   6. Picking an oversized file surfaces an error row WITHOUT
 *      triggering the upload (no CSRF / network round-trip).
 *
 * Run via:
 *   cd apps/web && npm run test:media-uploader
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import React from "react";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "node:test";

import {
  MediaUploader,
  describeValidationError,
} from "./MediaUploader.tsx";
import { formatMediaSize } from "@/types/media";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFile(opts: {
  name?: string;
  type: string;
  sizeKB?: number;
}): File {
  // jsdom's File ctor accepts a BlobPart[]; we pad a string with a
  // deterministic length to drive the `size` property.
  const sizeKB = opts.sizeKB ?? 1;
  const body = "x".repeat(sizeKB * 1024);
  return new File([body], opts.name ?? "sample.jpg", { type: opts.type });
}

afterEach(() => cleanup());

// ---------------------------------------------------------------------------
// 1-3. Pure validation helper
// ---------------------------------------------------------------------------

test("describeValidationError: rejects files over the size cap", () => {
  const big = makeFile({ type: "image/jpeg", sizeKB: 6000 }); // 6 MB
  const err = describeValidationError(big, "image", 5);
  assert.ok(err, "validation should fail on oversized files");
  assert.match(err!, /sınırı aşıyor/);
});

test("describeValidationError: rejects non-image MIME for kind='image'", () => {
  const pdf = makeFile({ type: "application/pdf", sizeKB: 1 });
  const err = describeValidationError(pdf, "image", 5);
  assert.ok(err, "validation should fail on disallowed MIME");
  assert.match(err!, /JPG \/ PNG \/ WEBP/);
});

test("describeValidationError: accepts a valid 1 MB JPEG", () => {
  const ok = makeFile({ type: "image/jpeg", sizeKB: 1024 });
  const err = describeValidationError(ok, "image", 5);
  assert.equal(err, null);
});

// ---------------------------------------------------------------------------
// 4. Size formatter
// ---------------------------------------------------------------------------

test("formatMediaSize: bytes / KB / MB cutoffs", () => {
  assert.equal(formatMediaSize(512), "512 B");
  assert.equal(formatMediaSize(2048), "2.0 KB");
  assert.equal(formatMediaSize(2 * 1024 * 1024), "2.00 MB");
  assert.equal(formatMediaSize(null), "—");
  assert.equal(formatMediaSize(undefined), "—");
});

// ---------------------------------------------------------------------------
// 5. Component renders the dropzone + hidden file input
// ---------------------------------------------------------------------------

test("MediaUploader: renders dropzone and hidden file input", () => {
  const { getByTestId } = render(
    <MediaUploader kind="image" csrfToken="test-csrf-token" onUploadComplete={() => {}} />,
  );
  const dropzone = getByTestId("media-uploader-dropzone");
  assert.ok(dropzone, "dropzone must be present");
  const input = getByTestId("media-uploader-input") as HTMLInputElement;
  assert.ok(input, "file input must be present");
  assert.equal(input.type, "file");
  // Dropzone accepts only image MIME types for the image kind.
  assert.match(input.accept, /image\//);
});

// ---------------------------------------------------------------------------
// 6. Oversized file surfaces an error row without hitting the network
// ---------------------------------------------------------------------------

test("MediaUploader: oversized file shows error row, does NOT call onUploadComplete", () => {
  let completed = 0;
  const oversized = makeFile({
    name: "huge.jpg",
    type: "image/jpeg",
    sizeKB: 6000, // > 5 MB
  });

  const { getByTestId } = render(
    <MediaUploader
      kind="image"
      csrfToken="test-csrf-token"
      onUploadComplete={() => {
        completed += 1;
      }}
    />,
  );
  const input = getByTestId("media-uploader-input") as HTMLInputElement;

  // `fireEvent.change` accepts an event-like object; we hand it a
  // minimal FileList so the component's `enqueueFiles` reads `length`.
  fireEvent.change(input, {
    target: { files: [oversized], value: "" },
  });

  // The row should appear with status="error" and an error message.
  const queue = getByTestId("media-uploader-queue");
  assert.ok(queue, "queue should render after file selection");
  const row = getByTestId("media-uploader-row");
  assert.equal(row.getAttribute("data-status"), "error");
  const alert = row.querySelector("[role='alert']");
  assert.ok(alert, "error row should include a role=alert message");
  assert.match(alert!.textContent ?? "", /sınırını aşıyor/);

  // And critically — no upload should have been kicked off.
  assert.equal(completed, 0, "oversized file must not trigger upload");
});