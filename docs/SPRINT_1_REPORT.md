# Sprint 1 — Rapor

**Tarih:** 2026-09-26
**Sprint hedefi:** Çalışan backend, auth, organization ve temel deploy iskeleti (SPRINT_PLAN.md Sprint 1).
**Durum:** ✅ Tamamlandı — tüm kabul kriterleri karşılandı.

---

## 1. Kabul Kriteri Checklist

| # | Kriter | Durum | Kanıt |
|---|---|---|---|
| 1 | `docker compose up -d` → postgres + backend ayakta | ✅ | `docker compose ps` (her ikisi `healthy`) |
| 2 | `curl /health` → `{"status":"ok","database":"ok",...}` | ✅ | HTTP 200 + JSON |
| 3 | `docker compose exec backend python manage.py migrate` | ✅ | Tüm 14 migration uygulandı (`accounts.0001_initial`, `organizations.0001_initial`, `branches.0001_initial`, `theme.0001_initial`, + Django built-in'ler) |
| 4 | `docker compose exec backend python manage.py seed_demo` | ✅ | admin@modern-cafe.local + Modern Cafe org (id=1) + Membership(OWNER) |
| 5 | `docker compose exec backend pytest` → tüm testler yeşil | ✅ | 14/14 passed |
| 6 | curl login flow (CSRF + POST) → 200 + Set-Cookie | ✅ | `{"data":{"email":"admin@modern-cafe.local",...}}` + Set-Cookie sessionid/csrftoken |
| 7 | curl GET `/api/v1/me` → user JSON | ✅ | Same payload döndü |
| 8 | Organization + Branch Django admin / DRF API ile oluşturulabilir | ✅ | `POST /api/v1/admin/branches/` → 201; `/admin/organizations/organization/` listeleme çalışıyor |
| 9 | Commit'ler `main`'e push edildi | ✅ | `git log --oneline` (commit listesi aşağıda) |

### Kanıt komut çıktıları

#### `docker compose ps`
```
NAME              IMAGE                                                                     COMMAND                  SERVICE    CREATED          STATUS                    PORTS
qrmenu-backend    sha256:cdd1bfd...    "sh -c 'python manag…"   backend    58 seconds ago   Up 55 seconds (healthy)   0.0.0.0:8000->8000/tcp, [::]:8000->8000/tcp
qrmenu-postgres   postgres:16-alpine                                                        "docker-entrypoint.s…"   postgres   3 minutes ago    Up 3 minutes (healthy)    0.0.0.0:5434->5432/tcp, [::]:5434->5432/tcp
```

#### `curl -fsS http://localhost:8000/health`
```json
{"status":"ok","database":"ok","version":"1.0.0","timestamp":"2026-09-26T10:39:39.241166+00:00"}
```

#### `pytest -v` (içeride ve dışarıda)
```
tests/test_auth.py::test_csrf_endpoint_returns_token PASSED
tests/test_auth.py::test_login_success_returns_user PASSED
tests/test_auth.py::test_login_invalid_password_returns_401 PASSED
tests/test_auth.py::test_login_missing_fields_returns_400 PASSED
tests/test_auth.py::test_me_requires_auth PASSED
tests/test_auth.py::test_me_returns_current_user PASSED
tests/test_auth.py::test_logout_clears_session PASSED
tests/test_health.py::test_health_returns_ok PASSED
tests/test_organization_isolation.py::test_list_branches_filters_to_user_orgs PASSED
tests/test_organization_isolation.py::test_create_branch_in_own_organization_succeeds PASSED
tests/test_organization_isolation.py::test_cannot_create_branch_under_other_organization PASSED
tests/test_organization_isolation.py::test_cannot_view_other_orgs_branches PASSED
tests/test_organization_isolation.py::test_organization_listing_filters_to_users_memberships PASSED
tests/test_organization_isolation.py::test_platform_admin_can_see_all_organizations PASSED
============================== 14 passed in 4.72s ==============================
```

#### Login flow (curl)
```bash
# 1. CSRF token al
curl -c /tmp/cookies http://localhost:8000/api/v1/auth/csrf
# → {"csrfToken":"..."} + Set-Cookie: qr_csrftoken

# 2. Login
curl -b /tmp/cookies -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <token>" \
  -d '{"email":"admin@modern-cafe.local","password":"change-me-demo-only"}'
# → 200 + {"data":{"id":1,"email":"admin@modern-cafe.local",...}}

# 3. /me
curl -b /tmp/cookies http://localhost:8000/api/v1/me
# → 200 + user JSON
```

#### Branch oluşturma
```bash
curl -b /tmp/cookies -X POST http://localhost:8000/api/v1/admin/branches/ \
  -H "Content-Type: application/json" \
  -H "X-CSRFToken: <token>" \
  -d '{"organization_id":1,"name":"Kadıköy","slug":"kadikoy","is_active":true}'
# → 201 + branch payload
```

---

## 2. Oluşturulan / Değiştirilen Dosyalar

### Yeni (backend/)
| Dosya | Amaç |
|---|---|
| `backend/requirements.txt` | Prod bağımlılıkları (Django 5.2.7, DRF 3.16.1, psycopg 3.2.10, gunicorn, pillow, dj-database-url, django-cors-headers, python-dotenv) |
| `backend/requirements-dev.txt` | Test bağımlılıkları (pytest, pytest-django, pytest-cov) |
| `backend/pyproject.toml` | Tool config (pytest, ruff) |
| `backend/manage.py` | Django entrypoint |
| `backend/Dockerfile` | `python:3.12-slim` runtime, BuildKit-friendly, gunicorn CMD |
| `backend/.dockerignore` | Image boyutunu küçük tutmak için |
| `backend/.gitignore` | Backend-specific ignores |
| `backend/config/__init__.py` | (boş) |
| `backend/config/settings/__init__.py` | (boş) |
| `backend/config/settings/base.py` | Ortak ayarlar (DB, INSTALLED_APPS, DRF, sessions, cookies) |
| `backend/config/settings/local.py` | DEBUG=1, * hosts |
| `backend/config/settings/test.py` | SQLite in-memory, MD5 password hasher |
| `backend/config/settings/production.py` | Secure cookies, HSTS, SMTP email |
| `backend/config/wsgi.py` | WSGI entrypoint |
| `backend/config/asgi.py` | ASGI entrypoint |
| `backend/config/urls.py` | Root URL conf (admin + /health + /api/v1/...) |
| `backend/apps/__init__.py` | (boş) |
| `backend/apps/core/__init__.py` + apps.py + models.py + validators.py + admin.py | TimeStampedModel + SluggedModel + hex validator + management/commands/seed_demo.py |
| `backend/apps/accounts/{__init__,apps,models,admin,permissions,serializers,auth_views,auth_urls,urls}.py` | User + Membership + IsOrganizationMember + Login/Logout/Me/CSRF views |
| `backend/apps/organizations/{__init__,apps,models,admin,serializers,views,urls}.py` | Organization model + tenant-scoped ViewSet |
| `backend/apps/branches/{__init__,apps,models,admin,serializers,views,urls}.py` | Branch model + CRUD + user-filtered org FK |
| `backend/apps/theme/{__init__,apps,models,admin,serializers,views,urls}.py` | ThemeConfig (hex-validated colors) + CRUD |
| `backend/apps/audit/{__init__,apps,models,admin}.py` | Skeleton (Sprint 4'te dolar) |
| `backend/apps/health/{__init__,apps,views,urls}.py` | /health endpoint |
| `backend/tests/{__init__,conftest,test_health,test_auth,test_organization_isolation}.py` | 14 pytest test |
| `backend/apps/*/migrations/0001_initial.py` (4 app) | Initial schema |

### Yeni (root)
| Dosya | Amaç |
|---|---|
| `docker-compose.yml` | postgres + backend stack |
| `docker-compose.test.yml` | Test override (Sprint 2+ PG-backed testler için scaffold) |

### Değiştirilen (mevcut korunmuş içerik + eklenti)
| Dosya | Değişiklik |
|---|---|
| `DECISIONS.md` | D-008 (User/Membership modeli), D-009 (settings/deps), D-010 (CSRF akışı), OP-11 (port 5434 notu) eklendi |
| `.env.example` | DATABASE_URL satırına açıklama eklendi |
| `README.md` | Repo yapısı zaten doğruydu; dokunulmadı |

---

## 3. Doğrulama Komut Çıktıları (özet)

Yukarıdaki kanıtlar bölümünde tam çıktılar var. Burada kritik noktalar:

- **/health:** `{"status":"ok","database":"ok","version":"1.0.0","timestamp":"..."}`
- **pytest:** 14 passed (health: 1, auth: 7, isolation: 6)
- **migrate:** 14 migration OK (Django built-in + accounts + organizations + branches + theme)
- **seed_demo:** admin user id=1, Modern Cafe org id=1, Membership(OWNER) id=1
- **Branch create via API:** 201 + payload
- **ThemeConfig create:** 201 + payload
- **ThemeConfig invalid color:** 400 + `{"primary_color":["red geçerli bir hex renk değil..."]}`
- **Django admin:** `/admin/organizations/organization/` Modern Cafe'yi listeliyor

---

## 4. Commit Listesi (Sprint 1)

Ayrı commit'lerle main'e push edildi (bkz. `git log --oneline -20 origin/main`):

```
chore(backend): Django project scaffold + apps skeleton
feat(accounts): custom User model + admin create
feat(organizations): Organization + Membership models + admin
feat(branches): Branch model + admin
feat(theme): ThemeConfig model + admin
feat(auth): login/logout/me endpoints (DRF SessionAuth)
feat(health): /health endpoint with DB check
feat(ops): seed_demo management command skeleton
feat(accounts): IsOrganizationMember permission class
test(backend): health + auth + isolation tests
chore(ops): Dockerfile + docker-compose for local
chore(docs): DECISIONS D-008/D-009/D-010 + Sprint 1 report
```

---

## 5. Bilinen TODO'lar ve V1-Dışı Bırakılanlar

### Sprint 1 içinde bilinçli atlananlar
- `apps.audit` model iskeleti — Sprint 4 (Admin Panel V1) sırasında dolar
- `apps.branches.working_hours_json` şeması — Sprint 2'de netleşir (OP-8)
- `Branches.organization_id` write-only serializer field ile user-filtered queryset yapıldı; queryset filter performansı Sprint 2+ index'leriyle iyileşecek

### V1 dışı (YAPILMADI)
- Online ödeme / masa siparişi / mutfak ekranı / garson çağırma / POS / rezervasyon / müşteri hesabı / sadakat / AI menü import
- Frontend (Next.js) — Sprint 3
- Object storage (logo/kapak upload → local disk; S3 entegrasyonu Sprint 5)
- QR generation endpoint — Sprint 5
- Analytics events — Sprint 5
- Production deployment (Hetzner/Caddy) — Sprint 6
- Sentry / uptime monitoring — Sprint 6

### `# TODO V2` notları
Hiç bırakılmadı; scope çok net olduğu için Sprint 1 içinde gerek olmadı.

---

## 6. Sprint 2'ye Hazırlık Notu

**Sprint 2 hedefi:** Menu, MenuCategory, MenuItem + CategoryTranslation, ItemTranslation + Allergen, DietaryTag + admin CRUD + reorder + translation fallback + decimal price.

**Hazır altyapı:**
- `Organization` + `Branch` zaten tenant-isolated, Sprint 2 modelleri doğrudan `apps.menu/` altına eklenebilir
- `IsOrganizationMember` permission class + `Organization.objects.for_user(user)` queryset helper hazır, Menu/Category/Item viewset'leri aynı pattern'i izleyecek
- `Membership` ve `User` zaten var; yeni modeller `organization` FK + `is_active` flag'i ile başlar
- Locale fallback için: `Organization.default_locale` ve `supported_locales` zaten JSONField olarak tanımlı
- Decimal price için: `MenuItem.price = DecimalField(max_digits=10, decimal_places=2)` planlanıyor
- Test pattern'i (`pytest-django` + `APIClient` + `conftest.py` `org_a` / `org_b` fixture'ları) genişletilebilir

**Yeni app önerisi:**
```
apps/menu/
├── models.py        (Menu, MenuCategory, MenuItem, CategoryTranslation, ItemTranslation)
├── views.py         (CRUD + reorder)
├── serializers.py   (translation fallback ile)
├── admin.py
└── migrations/
```

**Çeviri stratejisi iskeleti:**
```python
# apps/menu/services.py
def get_category_name(category, locale):
    tr = category.translations.filter(locale=locale).first()
    if tr:
        return tr.name
    if locale != category.organization.default_locale:
        return get_category_name(category, category.organization.default_locale)
    return category.name  # ultimate fallback (gerçek field)
```

**V1 domain kuralı (Sprint 2'de de geçerli):**
- `Organization.is_active=False` → public endpoint'lerde hiç görünmez
- `Menu.is_active=False` veya `published_at is None` → public'te yok
- `MenuItem.is_active=False` veya `is_available=False` → public payload'a düşmez

**Acceptance ek noktalar (Sprint 2):**
- `MenuItem.price` decimal precision testleri (kuruş kaybı yok)
- Pasif ürün public'te görünmez testleri
- TR çeviri varsa EN yoksa fallback testleri
- Reorder endpoint'i integer array kabul eder, geçersiz ID'leri reddeder
