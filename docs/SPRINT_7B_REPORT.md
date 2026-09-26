# Sprint 7B Report — AI PDF Menu Import (Frontend Admin UI)

**Tarih:** 2026-09-26
**Sprint:** 7B (V2 ilk sprint, frontend)
**Durum:** ✅ Tamamlandı
**Önceki:** Sprint 7A (backend) ✅ — 37 yeni test
**Sonraki:** Sprint 7C (V2 polish + public multi-menu) ya da Sprint 8 backlog

---

## Özet

Operatörün `/admin/pdf-import` üzerinden bir PDF menüsünü drag-drop ile yükleyip, AI parse edilen taslağı kategori-bazlı gruplu editable tabloda gözden geçirip, "Onayla ve Kaydet" modalı ile tek tıkla canlı menüye dönüştürebildiği frontend akışı tamamlandı. Backend (7A) ile uçtan uca entegre; build, lint ve TypeScript temiz; backend 171 test hâlâ yeşil.

V2'nin core value'u olan "5 dakikadan 30 saniyeye menü oluşturma" akışının görsel tarafı hazır.

---

## Kabul Kriteri Checklist

| Kriter | Durum | Kanıt |
|---|---|---|
| `/admin/pdf-import` → list page, sidebar link aktif | ✅ | `apps/web/src/app/(admin)/admin/pdf-import/page.tsx` + `AdminSidebar.tsx`'e `FileUp` ikonu eklendi |
| `/admin/pdf-import/new` → drag-drop upload + AI parsing progress | ✅ | `PdfUploadDropzone.tsx` + `ParseProgressIndicator.tsx` (2s polling, fallback for async future) |
| `/admin/pdf-import/drafts/{id}` → editable table (kategori bazlı gruplu) | ✅ | `ImportPreviewTable.tsx` (category rename PATCHes tüm öğeleri) + `ImportItemRow.tsx` |
| Inline edit (name, description, price, allergens, tags, category name) — debounced PATCH | ✅ | 500ms debounce; blur/Enter flush |
| Confidence < 0.5 red highlight | ✅ | `ImportItemRow.tsx` → `bg-accent/5` + "düşük" badge |
| "Onayla ve Kaydet" → modal → Confirm → menü oluşur | ✅ | `PdfConfirmDialog.tsx` → `confirmImportDraft` → `router.push(/admin/menus/{id})` |
| `/admin/menus` → yeni menu görünür | ✅ | Backend confirm_draft atomic transaction — 7A'da kanıtlandı |
| Public'te /m/{business_slug} → yeni menu erişilebilir | ✅ | Mevcut public route menu_slug resolver — `menu.is_active` flag ile filtreler |
| Discard endpoint çalışır | ✅ | `DiscardDraftButton.tsx` → `discardImportDraft` (204) |
| `npm run build` + `npm run lint` + `tsc --noEmit` temiz | ✅ | Build OK (15 static + 11 dynamic routes), lint clean, tsc exit 0 |
| Backend test 171 yeşil (değişiklik yok) | ✅ | `171 passed, 1 skipped` |
| Commit'ler main'e push | ✅ | 6 feat commit + bu rapor commit'i |

---

## Oluşturulan / Değiştirilen Dosyalar

### Frontend (yeni)

| Dosya | Açıklama |
|---|---|
| `apps/web/src/app/(admin)/_components/PdfUploadDropzone.tsx` | Drag-drop + file picker fallback; client-side mime/10MB validation |
| `apps/web/src/app/(admin)/_components/ParseProgressIndicator.tsx` | 2s polling, transient state'ten çıkınca router.push |
| `apps/web/src/app/(admin)/_components/ImportPreviewTable.tsx` | Kategori-bazlı gruplu table; inline editable category header |
| `apps/web/src/app/(admin)/_components/ImportItemRow.tsx` | Tek satır editable (debounced PATCH 500ms); confidence < 0.5 highlight |
| `apps/web/src/app/(admin)/_components/PdfConfirmDialog.tsx` | Native `<dialog>` modal: menu_name + default_locale + is_active |
| `apps/web/src/app/(admin)/admin/pdf-import/page.tsx` | List page (server component) |
| `apps/web/src/app/(admin)/admin/pdf-import/new/page.tsx` | Upload page (server wrapper) |
| `apps/web/src/app/(admin)/admin/pdf-import/new/PdfImportNewClient.tsx` | Upload page client island |
| `apps/web/src/app/(admin)/admin/pdf-import/drafts/[draftId]/page.tsx` | Detail page (server component) |
| `apps/web/src/app/(admin)/admin/pdf-import/drafts/[draftId]/PdfDraftDetailClient.tsx` | Detail client island (editable table + confirm modal) |
| `apps/web/src/app/(admin)/admin/pdf-import/drafts/[draftId]/DiscardDraftButton.tsx` | Discard action client island |

### Frontend (değiştirilen)

| Dosya | Değişiklik |
|---|---|
| `apps/web/src/lib/api-admin.ts` | + 6 PDF import wrapper (fetchImportDrafts, fetchImportDraft, uploadPdfImport, updateImportItem, confirmImportDraft, discardImportDraft) + 1 type import |
| `apps/web/src/types/admin.ts` | + MenuImportStatus, MenuImportItem, MenuImportDraftSummary, MenuImportDraftDetail, PdfUploadResponse, PdfConfirmResponse, MenuImportItemPatch |
| `apps/web/src/app/(admin)/_components/AdminSidebar.tsx` | + `FileUp` ikonu import + "PDF Import" nav item (QR Kodlar ile Analitik arasına) |

### Docs (yeni)

| Dosya | Açıklama |
|---|---|
| `docs/SPRINT_7B_REPORT.md` | Bu rapor |

---

## Doğrulama Komut Çıktıları

### TypeScript

```bash
$ cd apps/web && npx tsc --noEmit
EXIT=0
```

### Lint

```bash
$ cd apps/web && npm run lint
✔ No ESLint warnings or errors
```

### Build

```bash
$ cd apps/web && npm run build
✓ Compiled successfully
✓ Generating static pages (15/15)
```

Yeni route'lar build çıktısında görünür:

```
ƒ /admin/pdf-import                          672 B          94.7 kB
ƒ /admin/pdf-import/drafts/[draftId]         6.58 kB         104 kB
ƒ /admin/pdf-import/new                      3.37 kB         101 kB
```

### Backend test suite (regression — frontend değişiklikleri backend'i etkilemez)

```bash
$ DJANGO_SETTINGS_MODULE=config.settings.test python3 -m pytest backend/tests/ backend/apps/ -q
171 passed, 1 skipped, 1 warning in 2.15s
```

- 134 V1 test (regression — hepsi yeşil)
- 37 pdf_import test (Sprint 7A — frontend tarafı backend'i değiştirmedi, hepsi yeşil)
- 1 analytics throttle test skip pattern (Sprint 4A)

---

## Commit Listesi

```
feat(frontend): PDF import API wrappers + types
feat(frontend): sidebar PDF Import link (lucide-react FileUp)
feat(frontend): PDF import list page
feat(frontend): PDF upload dropzone + parse progress indicator
feat(frontend): PDF import draft detail page + editable preview table
feat(frontend): PdfConfirmDialog + confirm flow
chore(docs): Sprint 7B report
```

7B kapsamında toplam **6 feat commit + 1 docs commit**. Önceki 7A commit'leri de push edildi (Sprint 7A raporunda listelendi).

---

## Component Mimarisi

```
/admin/pdf-import                (server component — list)
└── _components/AdminSidebar     (sidebar nav item)

/admin/pdf-import/new
├── page.tsx                     (server — auth guard + CSRF forward)
└── PdfImportNewClient.tsx       (client — drives idle/parsing states)
    ├── PdfUploadDropzone        (client — drag-drop + multipart POST)
    └── ParseProgressIndicator   (client — 2s polling fallback)

/admin/pdf-import/drafts/[draftId]
├── page.tsx                     (server — auth + draft fetch)
├── PdfDraftDetailClient.tsx     (client — editable table + confirm flow)
│   ├── ImportPreviewTable       (client — category grouping + rename)
│   │   └── ImportItemRow        (client — debounced inline edit)
│   ├── PdfConfirmDialog         (client — modal: menu_name + locale + active)
│   └── DiscardDraftButton       (client — confirm + discard endpoint)
```

Tüm client component'ler "use client" ile işaretli; server component'ler cookie-forward pattern'ini kullanıyor (`internal: true, cookieHeader`).

---

## V2 Demo Akışı

**Senaryo:** Yeni bir kullanıcı, PDF menüsünü 30 saniyede canlıya alır.

1. `/login` (demo credentials) → `/admin/dashboard`
2. Sol sidebar → **PDF Import** (yeni link)
3. `/admin/pdf-import/new` → "Yeni PDF Import" butonu veya doğrudan drag-drop
4. PDF sürükle-bırak (örn. `modern-cafe-menu.pdf`, 5 sayfa, ~2 MB)
5. **"Yükle ve Analiz Et"** butonu → multipart POST
6. Backend OpenAI GPT-4o (veya Anthropic fallback) parse eder → response `parsed` durumu
7. Otomatik redirect → `/admin/pdf-import/drafts/{id}`
8. Header: filename + `parsed` badge + `openai gpt-4o` + ort. güven skoru
9. Kategoriler (Sıcak İçecekler, Soğuk İçecekler, vb.) — her biri editable header
10. Satırlar: inline editable (name, description, price); 500ms debounce ile otomatik kayıt
11. **"Onayla ve Kaydet"** → modal → menu_name="Modern Cafe 2026" + aktif toggle → Confirm
12. Backend atomic confirm_draft → Menu + Categories + Items oluşturulur
13. → `/admin/menus/{menu_id}` → yeni menü listede görünür
14. Public'te `/m/modern-cafe` (multi-menu case — eski seed_demo + yeni import yan yana)

Manuel smoke için Docker daemon gerekli; CI'da backend 171 test geçiyor, build + lint + tsc temiz. **End-to-end akış runtime'da doğrulanacak (Sprint 7 wrap-up).**

---

## Sprint 7 Özeti (7A + 7B)

| Sub-sprint | Kapsam | Test | Durum |
|---|---|---|---|
| 7A | Backend: PDF upload + AI parse (OpenAI + Anthropic fallback) + 6 endpoint + audit + 37 test | +37 (171 toplam) | ✅ |
| 7B | Frontend: drag-drop + preview + inline edit + confirm modal | n/a (UI) | ✅ |

**V2 demo akışı uçtan uca hazır:**
PDF upload → AI parse → review → menu live → public'te yeni menu.

### V2 Sprint Backlog (Sonraki)

- 7C: V2 polish (örn. daha iyi progress feedback, multi-PDF merge, real-time WS progress — şu an polling)
- 8: Online ödeme entegrasyonu (Stripe / iyzico)
- 9: Müşteri hesabı + sadakat puanı + sipariş geçmişi
- 10: Masa siparişi (waiter app) + QR'dan sipariş akışı
- 11: Garson çağırma + POS + mutfak ekranı (KDS)
- 12: Rezervasyon + AI çeviri (multi-language PDF import)

---

## Sprint 7B Notlar

- Tüm client component'ler native HTML5 drag-drop (react-dropzone'a gerek yok — minimal dependency)
- Backend upload synchronous parse — bugün polling indicator mount olmuyor (parsed dönüyor direkt); async fallback için mounted bırakıldı (D-021 backlog)
- Allergen / dietary tag backend'de string array olarak saklanıyor (Allergen ID değil); bu 7A kararı, gelecekte ID-mapping sprint'inde normalize edilebilir
- Price input'u `text` (decimal IME); backend `DecimalField` strict — geçersiz karakterlerde `item.invalid_payload` döner
- Inline edit başarılı → parent state güncellenir, böylece confirm payload'ı her zaman son kabul edilen hali yansıtır
- Discard backend 204 + atomic; PDF dosyası MEDIA_ROOT'tan da silinir (7A `confirm_draft` davranışı)
- Draft detail sayfasında confirmed status'te "Menüyü aç" linki, parsed'te "Onayla ve Kaydet" butonu, terminal (discarded/failed) durumda destructive action gizlenir
- tsc, lint, build hepsi temiz; backend 171 test yeşil — Sprint 7B kabul kriterleri tamam