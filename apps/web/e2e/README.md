# Browser smoke tests (the release gate)

The flows below, driven through a real browser against a **production build** of the
web app and a real Django backend. They exist because the first audit found
that `tsc`, ESLint, 483 backend tests and `next build` were all green while the
admin could not create a product (HTTP 500), customers could not place an order
(404) and the dashboard showed an error banner. Nothing that only looks at
source code or at API responses in isolation can see that.

| # | Flow | Spec | What it would have caught |
|---|------|------|---------------------------|
| 1 | Public menu renders tenant data only; language switch translates it | `customer.spec.ts` | hard-coded demo copy shown to every business (F-13), upsell banner (F-15), broken locale switch |
| 1b | The public menu never scrolls sideways (phone + desktop) | `customer.spec.ts` | negative-margin chip row making the page wider than the screen |
| 2 | Add to cart → place an order → order tracking page | `customer.spec.ts` | `POST /public/orders` 404 (F-02), payments UI/flag mismatch (F-06) |
| 2b | A returning customer's saved cart is restored with no hydration error | `customer.spec.ts` | persisted cart applied during the first client render → React error #418 for every returning customer |
| 3 | Log in → dashboard loads its data, no error banner | `admin.spec.ts` | `GET /admin/summary` 404 (F-02), broken login/redirect |
| 4 | Create a product, then edit it | `admin.spec.ts` | the 8 create/edit pages answering HTTP 500 (F-01), admin writes rejected by CSRF |
| 5 | Change the price → it shows on the public menu | `admin.spec.ts` | stale/cached public menu, write path not reaching the public read path |
| 6 | Open a QR code and download its PNG | `admin.spec.ts` | broken QR endpoint / auth |
| 7 | On a phone the admin menu button opens the nav drawer and navigates | `admin.spec.ts` | admin unusable on phones: sidebar hidden below `md` and no way to open navigation |

Flows 1 and 2 also run on a phone viewport (Pixel 7): the product is used on
phones.

Every test also runs an automatic **guard** (`support.ts`): it fails on any
HTTP 5xx, on an API *routing* 404 (an HTML 404 = "no such URL", the
trailing-slash bug), on an uncaught page error and on a React **hydration
mismatch** (production builds only log `Minified React error #418/#423/#425`),
even when the UI swallowed the failure and rendered something plausible.

## Run it

```bash
cd apps/web
npm run test:e2e                    # builds the app, starts both servers, runs all flows
E2E_SKIP_BUILD=1 npm run test:e2e   # reuse the existing .next build (faster while iterating)
npx playwright show-report          # HTML report after a failure (traces + screenshots)
```

Needs: Node 20+, Python 3.12+ with `backend/requirements-dev.txt` installed, and a
Chromium. Playwright's bundled one is installed once with
`npx playwright install chromium`; or use an installed browser with
`E2E_CHANNEL=chrome` (or `msedge`).

The harness starts its **own** stack and never touches your dev data:

* backend: Django `runserver` on `:8200`, a fresh SQLite file in the OS temp
  directory (deleted and re-seeded with `seed_demo` on every run);
* web: `next build` + `next start` on `:3200`, pointed at that backend;
* an admin account with a random password generated for that run (nothing is
  written to disk or committed).

Don't run it while a `next dev`/`next start` is using `apps/web/.next`: the
build replaces it.

| Variable | Default | Meaning |
|---|---|---|
| `E2E_SKIP_BUILD` | unset | `1` = don't rebuild the web app |
| `E2E_CHANNEL` | bundled Chromium | `chrome` / `msedge` to use an installed browser |
| `E2E_PYTHON` | `python3` | interpreter with the backend dependencies |
| `E2E_BACKEND_PORT`, `E2E_WEB_PORT` | `8200`, `3200` | ports of the throwaway stack |
| `CI` | unset | set → fresh servers only (never reuse), 1 retry |

If something is already listening on those ports (and `CI` is unset) Playwright
**reuses it as is**, including its data. That is handy for debugging, but the
admin flows assume the fresh `seed_demo` data (menu 1, category 1, QR code 5).

## Before every deploy

`bash scripts/release_gate.sh` runs the backend tests, type-check, lint, the
frontend unit tests and these flows. **Do not deploy on red.** See
`docs/DEPLOYMENT.md` ("Release gate").

## Adding a flow

* Put customer-facing flows in `customer.spec.ts` (they run on desktop *and*
  phone) and admin flows in `admin.spec.ts`.
* Prefer role/label selectors (`getByRole`, `getByLabel`) over CSS.
* Import `test`/`expect` from `./support`, not from `@playwright/test`, so the
  guard is attached.
* Use `clickCentered()` for clicks on the public menu: its sticky header and
  bottom bar otherwise intercept Playwright's default scroll position.
* Keep each flow independent of the others' data where you can (the admin specs
  deliberately run in order because a product is created, repriced, then viewed).
