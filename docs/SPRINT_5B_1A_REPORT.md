# Sprint 5B-1a Report — Frontend event tracking + ImageUpload multipart

> Branch: `main`
> Working dir: `agency-qr-menu`
> Period: 2026-09-26 (single session)
> Scope: Frontend (with the small backend glue required to make
> `multipart-upload → PATCH URL` work end-to-end)

## TL;DR

- Public menu page now silently fires `menu_view`, `language_change`,
  `whatsapp_click`, `phone_click`, `qr_open` analytics events.
- Image upload is real: pick a file → instant local preview →
  `POST /api/v1/admin/media/upload` (multipart) → server URL → parent
  form state → next save PATCHes the URL onto the item / category /
  organization.
- Item form (new + edit), Category form (new + edit) and Business
  settings (logo + cover) all wired.
- 116 → 120 backend tests (4 new for the image-URL serializer override
  + the absolute-URL passthrough on the public menu payload).

## Acceptance criteria checklist

| # | Criterion | Status |
|---|---|---|
| 1 | `apps/web/src/lib/events.ts` exists, exports `trackEvent` + `EventType` | ✅ |
| 2 | `/m/modern-cafe` mount → `POST /api/v1/public/events` in Network | ✅ (verified via curl + DB row inspection) |
| 3 | `/m/modern-cafe?locale=en` → `language_change` logged | ✅ (fired before `router.push`, `keepalive:true`) |
| 4 | WhatsApp button click → `whatsapp_click` logged | ✅ (FloatingCtas client-side onClick) |
| 5 | Phone button click → `phone_click` logged | ✅ (FloatingCtas client-side onClick) |
| 6 | `/m/modern-cafe?qr=1` → `qr_open` logged | ✅ (MenuViewClient ref-guarded useEffect) |
| 7 | `ImageUpload` POSTs multipart to `/api/v1/admin/media/upload` | ✅ (smoke: `244d17…-test_real.jpg` uploaded, 633 B, content-type image/jpeg) |
| 8 | Item edit form: upload → response URL → form state → submit | ✅ (ItemForm + CategoryForm wired) |
| 9 | Business settings logo + cover upload | ✅ (BusinessForm wired) |
| 10 | `npm run build` + `lint` + `tsc --noEmit` clean | ✅ |
| 11 | Backend 116 → 120 green | ✅ (4 new, all pass) |
| 12 | Commits pushed to `origin/main` | ✅ (commit list below) |

## Files added / changed

### Frontend (new)

| File | Purpose |
|---|---|
| `apps/web/src/lib/events.ts` | Public analytics tracker. `trackEvent(type, payload)`; SSR-safe; silent fail; `keepalive:true`. |

### Frontend (modified)

| File | Change |
|---|---|
| `apps/web/src/lib/api-admin.ts` | New `formData: true` flag on `AdminFetchOptions` (skips `Content-Type` so browser can set the multipart boundary). New `uploadMedia(file, options)` helper + `MediaUploadResponse` type. Added `image?: string` to `CreateItemPayload` / `UpdateItemPayload` / `CreateCategoryPayload` / `UpdateCategoryPayload`. |
| `apps/web/src/app/(admin)/_components/ImageUpload.tsx` | Rewritten. Was preview-only with `{file, preview}`; now `onUpload(serverUrl\|null)` + `csrfToken` + `onError`. Optimistic ObjectURL preview, then multipart POST, then error rollback. Remove button clears both local + server state. |
| `apps/web/src/app/(admin)/admin/menus/[menuId]/categories/CategoryForm.tsx` | Replaced `setImageFile/setImagePreview` with `setImageUrl`; ImageUpload wired; `image` sent on create + update payloads. |
| `apps/web/src/app/(admin)/admin/menus/[menuId]/categories/[categoryId]/items/ItemForm.tsx` | Same swap on items. |
| `apps/web/src/app/(admin)/admin/business/BusinessForm.tsx` | Two `ImageUpload` instances (logo square, cover 16:9); `logo` / `cover_image` URLs PATCHed on save. |
| `apps/web/src/components/public/MenuViewClient.tsx` | Client-side `useEffect` fires `menu_view` once and `qr_open` once (StrictMode-safe via refs). |
| `apps/web/src/components/public/LocaleSelector.tsx` | Fires `language_change` before `router.push`; uses `keepalive`. |
| `apps/web/src/components/public/FloatingCtas.tsx` | Converted from server → client component so onClick handlers can fire `whatsapp_click` / `phone_click`. Visual output identical (same classes, same icons). |

### Backend (small glue — required for end-to-end)

> The frontend upload flow assumes the backend accepts a URL string on
> the next JSON PATCH (the upload endpoint returns an absolute URL).
> DRF's default `ImageField` rejects URL strings because the
> underlying `FileField` calls `data.name` (a string has no `.name`).
> The Sprint 5A author left this gap. Fix in scope of 5B-1a because
> nothing else wires the upload.

| File | Change |
|---|---|
| `backend/apps/menu/serializers.py` | Override `image` to `serializers.CharField(max_length=500, allow_blank=True, allow_null=True)` on both `MenuCategorySerializer` and `MenuItemSerializer`. |
| `backend/apps/organizations/serializers.py` | Same override on `OrganizationSerializer` for `logo` + `cover_image`; same on `OrganizationSummarySerializer` (public-read). |
| `backend/apps/menu/services/visibility.py` | New `image_url(field)` helper: returns the value verbatim if it starts with `http(s)://`, else falls back to `field.url`. Used in the public menu payload so absolute URLs aren't mangled into `/media/http%3A/...`. |
| `backend/apps/menu/tests/test_image_url_patch.py` | 4 new tests (item, category, organization, public menu passthrough). |

## Validation

### Frontend

```
$ cd apps/web && npx tsc --noEmit
(no output — clean)

$ cd apps/web && npm run lint
✔ No ESLint warnings or errors

$ cd apps/web && npm run build
…
ƒ /admin/menus/[menuId]/categories/[categoryId]/items/[itemId]/edit  143 B           104 kB
ƒ /admin/menus/[menuId]/categories/[categoryId]/items/new            145 B           104 kB
ƒ /m/[businessSlug]                                                   14.3 kB         102 kB
+ First Load JS shared by all                                          87.2 kB
```

### Backend

```
$ docker compose exec backend pytest -q --no-header
…
120 passed, 1 skipped, 1 warning in ~90s

$ docker compose exec backend pytest apps/menu/tests/test_image_url_patch.py -v
apps/menu/tests/test_image_url_patch.py::test_item_image_patch_accepts_absolute_url PASSED
apps/menu/tests/test_image_url_patch.py::test_category_image_patch_accepts_absolute_url PASSED
apps/menu/tests/test_image_url_patch.py::test_organization_logo_patch_accepts_absolute_url PASSED
apps/menu/tests/test_image_url_patch.py::test_public_menu_returns_absolute_image_url PASSED
4 passed
```

### End-to-end smoke (manual)

```bash
# 1) Public event — anonymous, throttled 30/min
$ curl -X POST http://localhost:8000/api/v1/public/events \
    -H "Content-Type: application/json" \
    -d '{"event_type":"menu_view","locale":"tr","organization_slug":"modern-cafe","path":"/m/modern-cafe"}'
HTTP 204

# 2) Multipart upload — requires CSRF + session
$ CSRF=$(curl -s http://localhost:8000/api/v1/auth/csrf | jq -r .csrfToken)
$ curl -X POST http://localhost:8000/api/v1/admin/media/upload \
    -H "X-CSRFToken: $CSRF" \
    -b /tmp/cookies.txt \
    -F "file=@backend/test_real.jpg;type=image/jpeg"
{
  "data": {
    "url": "http://localhost:3000/media/uploads/1/244d1759-test_real.jpg",
    "filename": "244d1759-test_real.jpg",
    "size": 633,
    "content_type": "image/jpeg",
    "organization_id": 1
  }
}

# 3) PATCH item with the URL — was previously failing with
#    "Gönderilen veri dosya değil"; now succeeds.
$ curl -X PATCH http://localhost:8000/api/v1/admin/menu-items/27/ \
    -H "Content-Type: application/json" -H "X-CSRFToken: $CSRF" \
    -b /tmp/cookies.txt \
    -d '{"image":"http://localhost:3000/media/uploads/1/244d1759-test_real.jpg"}'
{ "data": { "id": 27, "image": "http://localhost:3000/media/...", ... } }

# 4) Public menu serves the URL verbatim (was "/media/http%3A/..." before fix)
$ curl http://localhost:8000/api/v1/public/menus/modern-cafe | jq '.data.categories[0].items[0].image'
"http://localhost:3000/media/uploads/1/244d1759-test_real.jpg"
```

## Event tracking demo flow (browser Network tab)

1. Visit `http://localhost:3000/m/modern-cafe` → Network tab shows
   one `POST /api/v1/public/events` with body
   `{"event_type":"menu_view","locale":"tr","organization_slug":"modern-cafe","path":"/m/modern-cafe"}`.
2. Open the LocaleSelector, switch to "English" → a second POST with
   `event_type:"language_change"` (locale field reflects the new
   value, fired before `router.push`).
3. Tap the WhatsApp button (mobile breakpoint) → POST
   `event_type:"whatsapp_click"`.
4. Tap the phone button → POST `event_type:"phone_click"`.
5. Re-load with `?qr=1` (or scan a Sprint 5B-1b QR) → POST
   `event_type:"qr_open", qr_id:1` *additionally* (mount-time, once
   per page).

## Image upload demo

- Admin → Items → "Türk Kahvesi" → Edit → "Değiştir" → pick any
  JPG/PNG/WEBP ≤ 5 MB → spinner overlay for ~200 ms → server URL
  appears under the image and "Yeni görsel yüklendi" caption shows →
  "Kaydet" PATCHes the URL onto the item.
- Admin → Business Settings → "Logo" / "Kapak görseli" → same flow;
  on save both URLs PATCH onto the organization. Refresh
  `/m/modern-cafe` to see the new logo in the public hero.

## Commits (chronological)

```
feat(backend): menu/organization image fields accept URL strings
feat(backend): image_url helper — preserve absolute URLs in public menu payload
test(backend): image URL PATCH + public URL passthrough (4 new)
feat(frontend): public event tracker (src/lib/events.ts)
feat(frontend): public menu event tracking — mount + qr_open + locale + WhatsApp + phone
feat(frontend): adminFetch FormData support + uploadMedia wrapper
feat(frontend): ImageUpload multipart upload (item + category + business)
chore(docs): Sprint 5B-1a report
```

> Branch `main` was pushed at the end of the session. Each commit is
> independent and `git log --oneline main` shows them in order.

## Notes for Sprint 5B-1b (next worker — QR management UI)

- Backend QR endpoints (Sprint 5A) are already live: list/create/
  PATCH/delete at `/api/v1/admin/qr-codes/`, PNG download at
  `/api/v1/admin/qr-codes/{id}/download`.
- A real `QRCode` is referenced via `MenuViewEvent.qr_code_id` — the
  public event tracker already accepts `qr_id` and emits
  `qr_open` whenever `?qr=<n>` is present.
- The QR management UI just needs:
  - `apps/web/src/lib/api-admin.ts` → `listQRCodes`, `createQRCode`,
    `deleteQRCode`, `downloadQRCode(id)`.
  - `/admin/qr` page (table + "Yeni QR" modal that picks menu +
    branch + custom short code + target URL preview).
  - Detail page showing the PNG inline + download button.
- Consider adding `MenuViewClient` to fire `qr_open` even when the
  URL param is `?qr=abc-123` (slug form). The current backend stores
  `qr_code_id` (FK to QRCode), so the URL would still need to carry
  an integer until Sprint 6+ adds slug-based QR lookup.

## Known leftovers (out of scope, NOT changed in this worker)

- `backend/test_real.jpg` (633 B) — leftover from manual smoke test
  in `apps/media/tests`. Pre-existing, untracked.
- `backend/config/staticfiles/` — Django `collectstatic` artifact
  in DEBUG. Pre-existing, untracked, `.gitignore` candidate.

## Risks / blockers

- **CSRF dance**: every admin form already needs `csrfToken` —
  ImageUpload now requires it as a prop. Existing callers (`ItemForm`,
  `CategoryForm`, `BusinessForm`) all already pass it; no callers
  needed updates outside their `ImageUpload` JSX.
- **Image URL persistence**: stored as plain text in the DB. If the
  backend ever switches to `FileField.to_internal_value` strict
  validation again, the override could regress. The 4 new tests
  catch that.
- **Public menu `image_url()`**: if a future cloud-storage integration
  rewrites `ImageField.url` semantics, the absolute-URL passthrough
  needs revisiting. Currently it's a one-liner helper.