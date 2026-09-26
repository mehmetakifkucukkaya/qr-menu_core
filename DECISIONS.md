# QR Menü — DECISIONS

**Tarih:** 2026-09-26 (başlangıç) — sürekli güncellenen karar kaydı
**Versiyon:** V1 Implementation

Bu belge, QR Menü V1 geliştirmesi sırasında alınan mimari ve ürün kararlarını, alternatiflerini, gerekçelerini ve sonuçlarını kayıt altına alır.

Yeni karar her alındığında bu dosyaya eklenir; geri alınan kararlar üzeri çizilmez, "reverted" notu düşülür.

> **Tarihçe:** D-001..D-006 Sprint 0'da alındı (`myagency/product-plans/qr-menu/DECISIONS.md`'de de arşivlenmiş). D-007+ yaşayan karar kaydı olarak bu dosyada birikir.

---

## KARAR D-001 — Repo Konumu

**Karar:** `/Users/mehmetakif/projects/agency-qr-menu`

**Tarih:** 2026-09-26

**Bağlam:** Plan setinde önerilen monorepo kök yolu (`TECHNICAL_PLAN.md:46`). Backend (Django), frontend (Next.js), Docker setup ve docs bu klasör altında olacak.

**Alternatifler:**
- `/Users/mehmetakif/projects/qr-menu` — daha kısa, agency prefix yok
- `/Users/mehmetakif/projects/agency-qrmenu` — tire olmadan bitişik

**Seçim gerekçesi:**
- Plan setinde resmi olarak önerilen tam yol
- `agency` prefix portföy kimliğini yansıtıyor (myagency portföyü)
- Tire ile ayrım diğer projelerden görsel ayrım sağlıyor

**Sonuçlar:**
- Sprint 1'de `mkdir -p /Users/mehmetakif/projects/agency-qr-menu` ile başlanır
- Tüm göreceli path'ler bu köke göre planlanır
- Git remote bu path'e karşılık gelecek bir repo'ya bağlanır

---

## KARAR D-002 — Backend API Framework: Django REST Framework

**Karar:** Django REST Framework (DRF)

**Tarih:** 2026-09-26

**Bağlam:** Backend API contract (`TECHNICAL_PLAN.md:328-377`) hem public hem admin endpoint'leri içeriyor. Hızlı, geniş plugin ekosistemi olan, topluluk bilgisi yüksek bir framework tercih edildi.

**Alternatifler:**
- **Django Ninja** — modern, Pydantic tip güvenli, async uyumlu, az boilerplate; ama daha küçük ekosistem

**Seçim gerekçesi:**
- DRF'in resmi plugin paketleri (drf-spectacular OpenAPI, drf-spectacular auth, drf-standardized-errors, django-filter) V1'in ihtiyaçlarını olgun şekilde karşılıyor
- Token/session auth, throttling, pagination, permissions hepsi built-in
- Decimal price, M2M allergen/tag, file upload validation gibi V1 gereksinimleri DRF serializer yapısında temiz ifade edilir
- Topluluk bilgisi yüksek; hata çözümü ve örnekler kolay bulunur

**Sonuçlar:**
- Tüm endpoint'ler `views.APIView` veya `viewsets.ModelViewSet` ile yazılır
- Serializer'lar `serializers.ModelSerializer` üzerinden; özelleştirme `to_representation` / `validate` ile
- Pagination default `PageNumberPagination`
- Auth: SessionAuthentication (admin panel için cookie tabanlı) + opsiyonel TokenAuth (ileride API consumers için)
- Throttling: public `events` endpoint için baseline rate limit
- OpenAPI docs: drf-spectacular ile `/api/schema/` ve `/api/docs/`

**Notlar:**
- Django Ninja V2 sprint'lerinde tekrar değerlendirilebilir (özellikle async endpoint ihtiyacı çıkarsa)

---

## KARAR D-003 — Next.js Uygulama Yapısı: Tek App + Route Group

**Karar:** Tek Next.js uygulaması, route group ile `(public)` ve `(admin)` ayrımı

**Tarih:** 2026-09-26

**Bağlam:** Public menü (müşterinin QR ile açtığı sayfa) ve admin panel (işletme sahibinin yönettiği sayfa) tek Next.js uygulaması içinde yaşayacak (`TECHNICAL_PLAN.md:113`).

**Alternatifler:**
- **Ayrı public ve admin app'ler** — farklı deploy targetları, sıkı sınır; V1'de bakım yükü yaratıyor

**Seçim gerekçesi:**
- Ortak component kütüphanesi (Button, Card, Form fields), tip tanımları, API client tek yerden yönetilir
- Tek build, tek deploy pipeline
- V1'in gereksinimleri (küçük ama kaliteli) monorepo yapıyla yeterince kontrol edilebilir
- V2'de ayrılma ihtiyacı doğarsa Next.js multi-zone veya monorepo split ile geçilebilir

**Sonuçlar:**
- Klasör yapısı:
  ```
  apps/web/src/app/
    (public)/
      m/[businessSlug]/page.tsx
      layout.tsx          (public shell)
    (admin)/
      login/page.tsx
      dashboard/page.tsx
      menus/...
      categories/...
      items/...
      qr-codes/...
      analytics/...
      settings/...
      layout.tsx          (admin shell, auth guard)
    api/                  (BFF proxy gerekirse)
  apps/web/src/components/
  apps/web/src/features/{public-menu,admin-dashboard,menu-management,qr-codes,analytics,settings}/
  apps/web/src/lib/
  apps/web/src/styles/globals.css
  ```
- Middleware ile route guard: `(admin)` grubu login gerektirir, `(public)` serbest
- Theme tokens, ortak `globals.css` ile
- Tailwind config tek, design token'lar `tailwind.config.ts` üzerinden
- Zustand veya React Context ile minimal client state (locale seçimi, drawer state)

**Notlar:**
- Route group URL'de görünmez (parantez), sadece layout/middleware ayrımı
- Build target ileride V2'de bölünebilir; şu an gereksiz

---

## KARAR D-004 — Production Deploy: Hetzner VPS + Cloudflare DNS + Caddy

**Karar:** Hetzner VPS + Cloudflare DNS + Caddy reverse proxy

**Tarih:** 2026-09-26

**Bağlam:** V1 production altyapısı; pilot müşteri için yeterli, maliyet kontrollü, bakım yükü düşük olmalı (`TECHNICAL_PLAN.md:32-38`).

**Alternatifler:**
- **Hetzner + Cloudflare + Nginx** — klâsik kombinasyon, daha yapılandırılabilir
- **Railway.app** — managed PaaS, GitHub push deploy; kontrol daha az, kullanım başına ücret
- **Fly.io** — edge deploy, global dağıtım; küçük ölçekte ucuz

**Seçim gerekçesi:**
- Caddy otomatik HTTPS (Let's Encrypt) yönetir, config dosyası minimal
- Cloudflare DNS + proxy DDoS/WAF temel koruma sağlar
- Hetzner VPS Avrupa lokasyonu, düşük maliyet (~€5-10/ay CX22/CX32)
- Toplam maliyet: VPS + domain + Cloudflare free tier ≈ €8-15/ay
- VPS üzerinde Docker Compose ile backend + frontend + postgres + caddy konumluyor
- Sentry + uptime monitoring (Better Stack veya UptimeRobot) Sprint 6'da eklenecek

**Sonuçlar:**
- Production docker-compose: backend (Django + DRF), frontend (Next.js standalone build), postgres, caddy
- Caddyfile: `menu.{domain}` → frontend, `api.{domain}` → backend (veya path-based routing)
- Backup stratejisi: Postgres `pg_dump` cron, NFS veya Hetzner Storage Box'a
- Deploy: VPS'e SSH + `git pull && docker compose -f docker-compose.production.yml up -d --build`
- Health endpoint production'da `/health` Caddy üzerinden erişilebilir
- Lokasyon: NBG1 (Nürnberg) veya FSN1 (Falkenstein) — Sprint 6 deployment doc'ta netleşir

**Notlar:**
- Hetzner Storage Box opsiyonel; object storage için S3-compatible sağlayıcı Sprint 5'te ayrıca değerlendirilecek
- Domain seçimi (menu.agencyqr.com veya benzeri) Sprint 6'da
- Cloudflare proxy mode: sadece DNS veya proxied — Sprint 6 deployment'ta kararlaşır

---

## KARAR D-005 — GitHub Remote: Public + MIT, qr-menu_core

**Karar:** Repo `https://github.com/mehmetakifkucukkaya/qr-menu_core`, **public** + **MIT** lisansı

**Tarih:** 2026-09-26

**Bağlam:** Lokal monorepo (`agency-qr-menu/`) uzak GitHub repo'ya bağlanacak. Repo daha önce private + boş olarak kullanıcı tarafından oluşturulmuştu; Sprint 0 kararıyla public'e çevrildi ve lisans eklendi.

**Alternatifler:**
- Private + MIT — repo gizli, MIT lisansı içeride
- Private + All rights reserved — tam kapalı
- Public + All rights reserved — açık ama kapalı lisans

**Seçim gerekçesi:**
- **Public:** Portföyde gösterilebilirlik + topluluk katkısına açıklık
- **MIT:** SaaS satışına engel değil; marka/ürün ticari, kod açık. MIT yaygın, basit, düşük hukuk overhead
- İsim `qr-menu_core`: kullanıcı kararı, plan setinden bağımsız; ticari/core anlamı açık

**Sonuçlar:**
- `gh repo edit ... --visibility public` uygulandı
- `LICENSE` (MIT) dosyası repo köküne eklendi
- Açıklama: "QR Menü / Restoran Mini Sistem V1 — mobil-first dijital menü, admin panel, QR kod, çoklu dil, tema ve basit analytics. Django REST Framework + Next.js monorepo."
- Topics: `qr-menu`, `restaurant`, `django`, `nextjs`, `saas`, `digital-menu`
- İlk commit: README, LICENSE, .gitignore, DECISIONS.md
- Branch: `main`

**Notlar:**
- V2'de monorepo'nun müşteri-özgü kısımları private submodule olabilir; V1 için gerek yok

---

## KARAR D-006 — Demo Görseller Stratejisi

**Karar:** Logo + kapak AI ile üretilecek; kategori ve ürün görselleri için stock photo placeholder (Unsplash URL) kullanılacak

**Tarih:** 2026-09-26

**Bağlam:** Modern Cafe demo işletmesi için 32 görsel gerekiyor (logo + kapak + 5 kategori + ~25 ürün). Sprint 6'da demo seed komutunda kullanılacak; şimdiden hazırlanması planlandı (`PRD.md:227`).

**Alternatifler:**
- Hepsi AI ile üret (32 görsel, paralel worker'larla ~30-60 dk)
- Hepsi stock placeholder (Unsplash, AI yok, hızlı ama daha az özgün)
- **Logo + kapak AI, ürün/kategori stock** (seçilen)

**Seçim gerekçesi:**
- Logo ve kapak marka kimliği taşıyacak; özgün olmalı → AI
- Ürün/kategori görselleri için profesyonel kahve/yemek fotoğrafçılığı yeterli → Unsplash'tan tematik seçim
- AI maliyeti 2 görsel ile sınırlı kalıyor (logo + kapak)
- Stock görsellerin lisansı açık ve ticari kullanıma uygun (Unsplash License)

**Sonuçlar:**
- Logo: AI (image generation) ile üretilecek; sıcak tonlu, "M" veya kahve fincanı motifi, modern minimalist
- Kapak: AI ile üretilecek; kafe iç mekanı veya kahve close-up, sıcak atmosfer
- Kategori görselleri: Unsplash'tan 5 sabit URL (kahveler, soğuk içecekler, tatlılar, kahvaltı, sandviçler)
- Ürün görselleri: 25+ Unsplash URL'si, ürün bazlı
- Görsel envanteri `docs/DEMO_IMAGES.md`'de tutulacak
- Görseller `apps/web/public/demo-assets/` altında optimize edilmiş kopya olarak da tutulacak (CDN/cache için)
- Frontend'de görsel URL fallback zinciri: lokal asset → Unsplash URL → placeholder.com

**Notlar:**
- AI görsel üretimi için kullanılacak tool ve prompt'lar `docs/DEMO_IMAGES.md`'de
- Stock seçim tutarlılığı için renk paleti ve kompozisyon Unsplash'ta filtrelenerek seçilecek

---

## KARAR D-007 — Versiyon ve Container Sabitleme (OP-10 netleştirmesi)

**Karar:**
- **Python:** lokal dev sistem versiyonu (3.14) + container'da `python:3.12-slim` base image. `pyproject.toml`'da `python = ">=3.12,<3.15"`
- **Node:** lokal dev sistem versiyonu (25.x) + container'da `node:20-bookworm-slim` base image. Next.js production build için LTS
- **PostgreSQL:** container'da `postgres:16-alpine`
- **Django:** 5.2 LTS
- **Next.js:** 14.x (App Router stable)

**Tarih:** 2026-09-26

**Bağlam:** Lokal sistemde Python 3.14.3 ve Node 25.6.1 mevcut; ancak production container'larında stabil LTS versiyonları sabitlemek "benim makinemde çalışıyor" sorununu engeller.

**Alternatifler:**
- Lokalde de Python 3.12 / Node 20 zorla — esneklik kaybı, mevcut sistem bozulur
- Container'sız lokal dev — sürdürülebilirlik ve ortam tekrarüretilebilirliği kaybı

**Seçim gerekçesi:**
- Django 5.2 LTS Python 3.10-3.14 destekliyor; 3.14 lokal uyumlu, 3.12 production için pin
- Next.js 14 LTS Node 18.17+ istiyor; Node 20 container LTS, Node 25 lokal geliştirme için yeterli
- Container'da sabitlenen versiyonlar production Hetzner VPS ile birebir aynı
- Lokal geliştirme sistem Python/Node'una dokunmuyoruz; Docker ile izole çalışma

**Sonuçlar:**
- `backend/Dockerfile`: `FROM python:3.12-slim`, `ENV PYTHONUNBUFFERED=1`, pip cache mount
- `apps/web/Dockerfile`: `FROM node:20-bookworm-slim AS builder`, multi-stage build (builder → runner)
- `docker-compose.yml`: postgres 16-alpine, redis 7-alpine (opsiyonel, V2'de)
- `pyproject.toml`: `[project] requires-python = ">=3.12,<3.15"`
- `apps/web/package.json`: `engines.node = ">=20.0.0"`

**Notlar:**
- Django 5.2 Python 3.14 desteği Mart 2026'da netleşti; LTS güvenli
- Node 25 bleeding-edge; container'da 20 LTS sabit kalır
- Sistem Python/Node'u değiştirilmez; sadece container'a pin yapılır

---

## Karar Geçmişi

| ID | Tarih | Karar | Durum |
|---|---|---|---|
| D-001 | 2026-09-26 | Repo yolu = `/Users/mehmetakif/projects/agency-qr-menu` | aktif |
| D-002 | 2026-09-26 | API framework = DRF | aktif |
| D-003 | 2026-09-26 | Frontend = tek app + route group | aktif |
| D-004 | 2026-09-26 | Deploy = Hetzner + Cloudflare + Caddy | aktif |
| D-005 | 2026-09-26 | GitHub remote = qr-menu_core, public, MIT | aktif |
| D-006 | 2026-09-26 | Demo görseller = logo/kapak AI + ürün/kategori stock | aktif |
| D-007 | 2026-09-26 | Container sabitleme = Python 3.12, Node 20 LTS, PG 16 | aktif |
| D-008 | 2026-09-26 | Custom User: email USERNAME_FIELD + role + Membership | aktif |
| D-009 | 2026-09-26 | Settings & deps: requirements.txt + pyproject.toml (poetry yok) | aktif |
| D-010 | 2026-09-26 | CSRF akışı: cookie-based session + X-CSRFToken header | aktif |
| D-011 | 2026-09-26 | Image upload = local MEDIA_ROOT, Sprint 5'te S3/R2 | aktif |
| D-012 | 2026-09-26 | Slug = manuel + opsiyonel auto (save() override + Türkçe tablo) | aktif |
| OP-1  | Sprint 5  | Object storage sağlayıcısı | açık |
| OP-2  | Sprint 6  | Production domain | açık |
| OP-3  | Sprint 6  | Hetzner VPS lokasyon + boyut | açık |
| OP-4  | Sprint 6  | DB backup & recovery | açık |
| OP-6  | 2026-09-26 | DecimalField(10, 2) + negative rejected | **netleşti** |
| OP-8  | 2026-09-26 | Working hours: {day:[{open,close}], ...} + JSON validator | **netleşti** |
| OP-9  | Sprint 6  | Sentry / uptime monitoring | açık |
| OP-11 | 2026-09-26 | Postgres host port = 5434 → 5432 (local) | aktif |

---

## KARAR D-008 — Custom User: Email USERNAME_FIELD + Role + Membership Ayrımı (Sprint 1)

**Karar:**
- `User.email` USERNAME_FIELD, password Django built-in, `role` (admin/agency_admin/owner/manager/staff) global kullanıcı rolü
- `Membership(user, organization, role)` ile per-org rol ayrımı: aynı kullanıcı farklı organizasyonlarda farklı role sahip olabilir
- `is_platform_admin` (User.role == admin veya is_superuser) tenant isolation'ı bypass eder

**Tarih:** 2026-09-26

**Bağlam:** `TECHNICAL_PLAN.md §3` Organization/Branch alanları ve `OP-5` admin auth kararı.

**Alternatifler:**
- User üzerinde tek `organization` FK (tek-tenant kullanıcı) — multi-org kullanımı zorlaştırır
- Group/Permission tabanlı RBAC — V1 için fazla karmaşık, Sprint 4+ değerlendirilebilir

**Seçim gerekçesi:**
- Agency'nin kendi staff'ı (agency_admin) birden fazla işletmeyi yönetebilmelidir → Membership tablosu zorunlu
- Per-org role (owner/manager/staff/agency_admin) ile yetki ayrımı net
- `is_platform_admin` bypass'ı acil müdahale ve demo için gerekli; production'da daraltılabilir

**Sonuçlar:**
- `apps/accounts/models.py` — User + Membership
- `apps/accounts/permissions.py` — IsOrganizationMember (object-level + queryset filter)
- `apps/organizations/views.py` — queryset `Organization.objects.for_user(user)`
- Serializer'lar (Branch, ThemeConfig) `organization_id` queryset'ini user memberships'a göre filtreler; başka org'a yazma denemesi → 400

---

## KARAR D-009 — Settings & Dependency Yönetimi (Sprint 1)

**Karar:**
- `requirements.txt` (prod) + `requirements-dev.txt` (test) + `pyproject.toml` (tool config) — poetry kullanmıyoruz
- Settings modülleri: `base.py` → `local.py` / `test.py` / `production.py`
- `DJANGO_SETTINGS_MODULE` env ile seçilir; default local

**Tarih:** 2026-09-26

**Bağlam:** Docker build'i sade tutmak ve opsiyonel poetry lock karmaşıklığından kaçınmak.

**Alternatifler:**
- Poetry + `poetry.lock` — daha katı reproducibility, ama Dockerfile'a poetry binary eklemek + cache katmanları daha karmaşık
- Pipenv — benzer nedenlerle tercih edilmedi
- Sadece `pyproject.toml` (PEP 621) — Django 5.2 için çalışır ama `pip install .` prod deps'i çözemiyor

**Seçim gerekçesi:**
- `requirements.txt` Docker layer cache için ideal (değişmeyen dosya erken install)
- `pyproject.toml` test/lint tool config'i için zaten gerekli (pytest, ruff)
- Poetry'nin V1 başlangıcında getirdiği ek yük (lock sync, keyring, virtualenv handling) değerine göre yüksek

**Sonuçlar:**
- Versiyonlar `requirements.txt`'te pinned (Django==5.2.7, djangorestframework==3.16.1, ...)
- Container'da hem `requirements.txt` hem `requirements-dev.txt` install edilir → `docker compose exec backend pytest` çalışır
- İleride Poetry'ye geçiş istenirse: `requirements.txt` → `pyproject.toml` dependency block + `pip install .` komutu

---

## KARAR D-010 — CSRF Akışı (Sprint 1)

**Karar:**
- DRF SessionAuthentication default (CSRF unsafe method'larda aktif)
- Login endpoint'i JSON POST, CSRF korumalı; önce `GET /api/v1/auth/csrf` ile token alınır
- CSRF cookie adı `qr_csrftoken`, session cookie adı `qr_sessionid`

**Tarih:** 2026-09-26

**Bağlam:** `OP-5` admin auth kararı: cookie tabanlı session + CSRF aktif.

**Alternatifler:**
- Token auth (DRF TokenAuthentication) — frontend BFF proxy'si için ek yük; V1 admin panel browser tabanlı, cookie daha doğal
- Custom header token (X-Auth-Token) — CSRF yok ama session hijacking riski
- SameSite=Strict cookie — daha sıkı ama bazı cross-site akışları bozar

**Seçim gerekçesi:**
- Tarayıcı tabanlı admin paneli için cookie + CSRF endüstri standardı
- SameSite=Lax default; production'da Secure=true (HTTPS)
- DRF SessionAuth CSRF enforcement default'u zaten var, ek birşey yazmaya gerek yok

**Sonuçlar:**
- `apps/accounts/auth_views.py` — LoginView, LogoutView, MeView, CSRFView
- Login response'da session cookie + CSRF cookie set edilir (DRF `login()` + `request.session.save()`)
- Logout unsafe method, X-CSRFToken header zorunlu

---

## KARAR D-011 — Image Upload: Local MEDIA_ROOT, Sprint 5'te S3/R2'ye Geçiş (Sprint 2)

**Karar:** Logo, kapak, kategori ve ürün görselleri Django `ImageField` ile `MEDIA_ROOT=/app/media/` altına yazılır. CDN / object storage entegrasyonu Sprint 5'te.

**Tarih:** 2026-09-26

**Bağlam:** Sprint 2 ile birlikte Menu/MenuCategory/MenuItem modellerinde görseller gerekiyor (`ImageField` kullanılıyor). V1 başlangıcında S3-compatible object storage kararı netleşmedi (OP-1 Sprint 5). Lokal disk V1 demo için yeterli, prod'a Sprint 5'te geçilecek.

**Alternatifler:**
- Hetzner Object Storage — Avrupa lokasyon, ucuz, ancak henüz OP-1 değerlendirmesi yapılmadı
- Cloudflare R2 — egress ücretsiz, CDN yönetimi kolay
- AWS S3 — endüstri standardı, AB dışı
- MinIO self-hosted — kontrol tam, operasyon yükü yüksek

**Seçim gerekçesi:**
- V1'in pilot yayını için lokal `MEDIA_ROOT` yeterli; admin paneli demo işletmeler için 50-100 görsel barındıracak, Postgres backup stratejisi ile beraber yedeklenebilir
- `ImageField` API'si değişmeyecek; Sprint 5'te sadece `DEFAULT_FILE_STORAGE` veya `django-storages` ile backend değişecek
- `MEDIA_URL=/media/` zaten `config/urls.py`'da `static()` helper ile DEBUG'ta serve ediliyor; production'da Caddy üzerinden serve edilebilir

**Sonuçlar:**
- `Organization.logo`, `Organization.cover_image` zaten `ImageField` (Sprint 1)
- `MenuCategory.image` (upload_to="categories/"), `MenuItem.image` (upload_to="items/") — Sprint 2
- `docker-compose.yml` zaten `./backend/media:/app/media` mount'u ile host'ta persist
- Backend Dockerfile + Pillow dependency hazır
- Sprint 5'te: `django-storages[s3]` + `OP-1` kararı + bucket env değişkenleri

**Notlar:**
- Image upload boyut sınırı V1'de yok; Sprint 4'te (admin polish) eklenecek
- Varyant görseller (size, color) V2'de — şu an tek image per item

---

## KARAR D-012 — Slug Generation: Manuel Giriş + Opsiyonel Auto (Sprint 2)

**Karar:**
- `slug` alanı API'da opsiyonel; verilmediğinde `name`'den otomatik üretilir (save() override)
- Türkçe karakterler için basit transliterasyon tablosu: `ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u`
- Aynı org içinde slug çakışırsa `-2`, `-3` ... suffix'i ile unique kalır
- Admin UI'da `prepopulated_fields` slug'ı name'den türetir (mevcut pattern)

**Tarih:** 2026-09-26

**Bağlam:** Branch ve Organization modelleri Sprint 1'de slug istiyordu. Menu/MenuCategory de Sprint 2'de slug istiyor. UX açısından "slug girmek zorunda olmak" admin için ek yük; otomatik üretim çoğu durumda yeterli.

**Alternatifler:**
- Slug her zaman zorunlu (Sprint 1 davranışı) — admin UX kötü, hata yüzeyi büyük
- `django.utils.text.slugify` ile transliterasyon — Türkçe karakterleri doğru çevirmez (örn. `Tatlılar → tatlılar` olur, `tatlilar` olmaz)
- pre_save signal — `save()` override'a göre daha az explicit
- Manuel giriş + opsiyonel auto (seçilen)

**Seçim gerekçesi:**
- `save()` override explicit, debug edilebilir, signal side-effect'lerinden kaçınıyor
- Türkçe karakter tablosu minimal: 6 harf değişimi, sürdürülebilir
- Çakışma çözümü (suffix) Django'nun standart pattern'i
- Admin prepopulated_fields zaten slug'ı name'den türetiyor (mevcut UX'i koruyor)

**Sonuçlar:**
- `apps/menu/models.py` — `Menu.save()`, `MenuCategory.save()` slug auto-generate
- `apps/branches/serializers.py` — Branch.slug opsiyonel (mevcut davranış korundu, default="" ile)
- `apps/menu/serializers.py` — Menu/MenuCategory.slug opsiyonel
- Test: `test_unique_slug_per_organization` aynı slug'ın farklı org'da yeniden kullanılabileceğini, aynı org'da auto-suffix olacağını doğrular

**Notlar:**
- Manuel override her zaman mümkün: API caller `slug="custom"` gönderirse auto-generate atlanır
- Gelecekte i18n slug (örn. `tr-kahve` vs `en-coffee`) gerekirse V2'de ayrı `slug_i18n` table

---

## KARAR OP-6 — Decimal Price Precision (Sprint 2 Netleşti)

**Karar:** `MenuItem.price` ve `MenuItem.compare_at_price` = `DecimalField(max_digits=10, decimal_places=2)`. Negatif değer reddedilir (`MinValueValidator(Decimal("0.00"))`).

**Tarih:** 2026-09-26

**Bağlam:** Para birimi hassasiyeti (TRY/EUR/USD) V1 için 2 ondalık yeterli. 10 digit toplam kapasite (örn. 99999999.99 TRY) V1'in tek-ürün veya etkinlik fiyatları için yeterli.

**Alternatifler:**
- `decimal_places=4` — kripto paralar için, V1'de gerek yok
- `max_digits=12` — daha büyük sayılar için, V1'de over-engineering
- Float — kuruş kaybı riski (YASAK)

**Seçim gerekçesi:**
- Decimal yerine float kullanmak 0.1+0.2 = 0.30000000000000004 gibi klasik sorunlara yol açar
- Django `DecimalField` Python `decimal.Decimal` ile saklanır; serialize JSON'da string olarak çıkar (kuruş kaybı yok)
- Negative price validation `MinValueValidator` ile hem API hem admin'de çalışır

**Sonuçlar:**
- `apps/menu/models.py` — `price` ve `compare_at_price` DecimalField(10,2)
- Test: `test_max_digits_enforced` (99999999.99 kabul, 100000000.00 red), `test_decimal_places_enforced` (12.999 red), `test_negative_price_rejected`, `test_price_stored_as_decimal_not_float`

**Notlar:**
- Serializer'da `price` JSON'dan string olarak alınır (`"12.50"`); response'da `"12.50"` olarak döner. Frontend parse ederken `parseFloat`/`Number()` değil, kuruş hassasiyeti için `Decimal` parse kullanmalı
- `compare_at_price < price` validation serializer'da (anlamlı: "indirim önceki fiyatı" semantiği)

---

## KARAR OP-8 — Working Hours JSON Şeması (Sprint 2 Netleşti)

**Karar:**
`Branch.working_hours_json` alanı aşağıdaki şemayı kabul eder:

```json
{
  "mon": [{"open": "08:00", "close": "22:00"}],
  "tue": [{"open": "08:00", "close": "22:00"}],
  ...
  "sun": []
}
```

- Gün anahtarları: `mon, tue, wed, thu, fri, sat, sun` (3 harf lowercase, ISO 8601 weekday)
- Her gün `[{open, close}, ...]` listesi (tek vardiya veya birden çok vardiya olabilir)
- `HH:MM` 24-saat formatında (validator)
- Default değer `{}` (boş dict)
- Eksik günler `normalize_working_hours()` ile `[]` olarak doldurulur

**Tarih:** 2026-09-26

**Bağlam:** Şube çalışma saatleri verisi Sprint 4+ UI tarafında kullanılacak (ön yüzde "şu an açık mı?" rozetleri için). Veri şeması Sprint 2'de netleşti; UI Sprint 4+'da eklenecek (V1 dışı guard).

**Alternatifler:**
- Her gün tek `open/close` (vardiya yok) — V1 ihtiyaçlarını karşılamaz, esneklik kaybı
- ISO 8601 duration format (örn. `"mon":"08:00/22:00"`) — multi-vardiya desteği yok
- Ayrı `WorkingHours` model — overkill, JSON daha pratik (P2 özellik, basit tutmak istiyoruz)
- **3-harf lowercase + array of intervals** (seçilen)

**Seçim gerekçesi:**
- Multi-vardiya desteği gerçek işletmelerde var (kahvaltı + akşam servisi gibi)
- JSONField ile başka migration gerekmiyor; ihtiyaç değişirse V2'de ayrı model'e migrate edilebilir
- Validator `apps/menu/services/working_hours.py`'da, branch admin'de form-level doğrulama ile entegre

**Sonuçlar:**
- `apps/branches/admin.py` — `BranchAdminForm.clean_working_hours_json` schema validation
- `apps/menu/services/working_hours.py` — `validate_working_hours_schema()`, `normalize_working_hours()`
- Test: `test_working_hours.py` (7 test — valid/invalid/day/time/interval/normalize/admin form)

**Notlar:**
- UI Sprint 4+; şimdilik Django admin JSONField edit + form-level validation yeterli
- Holiday/tatil override şeması V2'de düşünülebilir (örn. `"holidays":[{"date":"2026-12-25","closed":true}]`)

---

## KARAR D-013 — Next.js Config: `.mjs` (Standalone Build için Zorunlu) (Sprint 3B-1)

**Karar:** `apps/web/next.config.mjs` (ESM JavaScript, TypeScript değil).

**Tarih:** 2026-09-26

**Bağlam:** Next.js 14'te `output: "standalone"` özelliği docker runner için gerekli; bu özellik `next.config.{js,mjs,ts}` dosyası arar. Next 15 `.ts`'yi destekler, ancak Next 14 resmi olarak yalnızca `.js` ve `.mjs`'i destekler (Next 14 changelog — `next.config.ts` Next 15 feature).

**Alternatifler:**
- `next.config.ts` — Next 15'te native destekleniyor; biz Next 14.2.x'teyiz
- `next.config.js` (CJS) — çalışır ama projede ESM tutarlılığı için `.mjs` tercih edildi
- **`next.config.mjs`** (ESM, seçilen)

**Seçim gerekçesi:**
- Standalone build çıktısı Docker runner stage'de `node server.js` ile çalışıyor; bu da `.mjs` ile uyumlu
- ESM modül sistemi modern Node 20 ile uyumlu (D-007 — `node:20-bookworm-slim`)
- Tüm frontend repo dosyaları `.ts/.tsx` veya `.mjs` (postcss.config.mjs dahil) — tutarlılık
- Sprint 6+ Next upgrade geldiğinde `.ts`'ye geçiş küçük bir rename olur

**Sonuçlar:**
- `apps/web/next.config.mjs` — standalone output + image remotePatterns + reactStrictMode
- `apps/web/postcss.config.mjs` — tailwindcss + autoprefixer
- `apps/web/Dockerfile` — `COPY --from=builder /app/.next/standalone` + `CMD ["node", "server.js"]`

**Notlar:**
- ESLint config'i yine `.eslintrc.json` (Next 14 ESLint flat config desteği sınırlı)
- TypeScript strict + isolatedModules aktif; next.config.mjs'de types `@type {import('next').NextConfig}` JSDoc ile

---

## KARAR D-014 — Theme Tokens: Inline CSS Variables Override (Sprint 3B-2)

**Karar:** Per-business tema renkleri, `BusinessHero` component'inin root element'inde inline `style={{ "--color-primary": "R G B" }}` olarak override edilir; global token'lar `src/styles/tokens.css`'de `:root` altında Modern Cafe default'ları olarak kalır.

**Tarih:** 2026-09-26

**Bağlam:** V1'de tek işletme (Modern Cafe) çalışıyor; ancak Sprint 6 multi-tenant demo için her işletmenin kendi paleti olması gerekiyor. Backend payload'da `theme` objesi opsiyonel olarak geliyor (`{primary_color, secondary_color, ...}` — hex string). Tailwind utility'leri `rgb(var(--color-primary) / <alpha>)` formunda tanımlı (D-007 + tailwind.config.ts).

**Alternatifler:**
- **CSS class swap** (örn. `theme-modern-cafe`, `theme-blue-bistro`) — Tailwind JIT her varyantı generate etmeli, bundle şişer
- **Runtime CSS variable override (inline style)** (seçilen) — sıfır bundle ek maliyeti, anında uygulanır, server component'ten render edilebilir
- **Theme Provider + Context** — overkill V1 için, server-render'ı bozuyor
- **Multiple `<link rel="stylesheet">`** — Sprint 6+ için aday, şimdilik inline yeterli

**Seçim gerekçesi:**
- Server component'te inline style kabul edilebilir (CSS-in-JS değil, düz `style` attr)
- Override scope `BusinessHero`'nun root `<section>`'ına sınırlı — diğer bileşenler (ItemCard, CategoryNav, vs.) global token'ları kullanmaya devam eder; bu sayede kazara global leak yok
- Tailwind `rgb(var(--color-primary) / <alpha>)` pattern'i zaten kurulu (D-007 + tailwind.config.ts)
- `hexToRgbTriplet()` helper'ı `BusinessHero.tsx` içinde, 3-haneli kısa formu da destekler

**Sonuçlar:**
- `apps/web/src/components/public/BusinessHero.tsx` — `themeStyle` objesi, `hexToRgbTriplet()` helper
- `apps/web/src/styles/tokens.css` — `:root` Modern Cafe default'ları (Sprint 3B-1)
- `apps/web/tailwind.config.ts` — `rgb(var(--color-X) / <alpha-value>)` semantic tokens
- `backend/apps/organizations/serializers.py` — `OrganizationSummarySerializer.theme` payload'a dahil (Sprint 3A)
- `backend/apps/menu/services/visibility.py` — `theme_payload` dict (Sprint 3A)

**Notlar:**
- Inline CSS variable'lar React'te `style={{ "--color-primary": "139 90 60" }}` olarak set edilebilir (TypeScript typing için `as React.CSSProperties` cast gerekli)
- Sprint 6 multi-tenant demo'da tenant picker bu override'ı tetikleyecek
- Brand font override (`theme.font_family`) V2 backlog'unda (şimdilik sadece renkler)

---

## Açık / Sonraki Sprint'lerde Netleşecek Kararlar

Bu kararlar henüz netleşmedi; ilgili sprint'lerin başında değerlendirilecek.

### OP-1 — Object Storage Sağlayıcısı (Sprint 5)
S3-compatible storage (logo, kapak, ürün görseli) için Hetzner Object Storage / Cloudflare R2 / AWS S3 / MinIO self-hosted karşılaştırması Sprint 5 öncesi yapılacak.
- Adaylar: Hetzner Storage Box (ucuz, AB), R2 (egress ücretsiz), MinIO (self-hosted, kontrol)

### OP-2 — Production Domain (Sprint 6)
Hangi domain ve alt domain'ler kullanılacak (örn. `menu.{brand}.com`, `app.{brand}.com`). Marka kararı Sprint 6 deployment doc'ta netleşir.

### OP-3 — Hetzner VPS Lokasyonu ve Boyutu (Sprint 6)
NBG1 vs FSN1 vs HEL1, CX22 (4GB RAM) vs CX32 (8GB RAM). İlk pilot için CX22 yeterli olabilir; yük artarsa CX32 upgrade'i.

### OP-4 — Database Backup ve Recovery (Sprint 6)
Postgres backup stratejisi (pg_dump cron, point-in-time, offsite). Günlük/haftalık otomasyonu; Hetzner Storage Box ile offsite.

### OP-9 — Sentry / Monitoring (Sprint 6)
Sentry self-hosted vs SaaS, uptime monitoring tool'u (Better Stack / UptimeRobot / Healthchecks.io).

### OP-11 — Postgres Host Port (Sprint 1 notu)
Local'de birden fazla Postgres instance çakışmasın diye ana stack'te host port **5434 → 5432** kullanılır.
Üretimde bu mapping yok (Caddy/Cloudflare üzerinden erişim). Gerekirse `.env`'de değiştirilebilir.

---

## KARAR D-015 — Admin Panel V1 Scope (Sprint 4B)

**Karar:** Admin panel V1 kapsamı: işletme + menü + kategori + ürün + tema CRUD, fiyat/durum inline edit, kategori reorder, çeviri (TR/EN) tab interface, alerjen/diyet chip seçimi. Görsel upload V1'de önizleme-only (multipart endpoint Sprint 5'te, D-011). Audit log, admin summary endpoint, AI menü import, müşteri hesabı, sipariş/ödeme V1 dışı.

**Tarih:** 2026-09-26

**Bağlam:** Sprint 4A'da auth + layout + dashboard + login tamamlandı. Sprint 4B'de admin operatörünün menüyü uçtan uca yönetebildiği demo akışı hedefleniyor: login → menu → kategori → ürün → fiyat değiştir → public sayfada gör. Backend 12 admin endpoint Sprint 2'de hazır ve tenant-isolated (D-002 + IsOrganizationMember). Frontend altyapısı 4A'dan reusable.

**Alternatifler:**
- **Inline-only edit** (örn. her şey tabloda, modal ile) — hızlı ama keşfedilebilirlik düşük, SEO/erişilebilirlik zayıf
- **Full edit page + quick actions** (seçilen) — list page'lerde inline price + status toggle, full form için `/.../edit` route'ları
- **Drag-and-drop reorder** — UX güzel ama Sprint 5'teki keyboard a11y + touch parity'si ek iş; up/down butonları yeterli V1
- **Image upload cloud-first** (S3/R2) — Sprint 5'e ertelendi (D-011); V1'de ObjectURL preview + mevcut MEDIA_ROOT upload Sprint 5'te

**Seçim gerekçesi:**
- Full edit pages SEO-friendly URL'ler veriyor (deep link, bookmark, browser back düzgün çalışıyor)
- Inline price/status toggle operatörün günlük akışını hızlandırıyor — ayrı sayfa açmadan 1 saniyede fiyat güncellemesi
- Up/down reorder yeterli çünkü V1'de ortalama kategori sayısı < 10; drag-drop ekran okuyucu desteği + touch parity'si + bundle maliyeti gerektiriyor
- TranslationTabs ayrı component → tüm formlarda reusable, her seferinde TR/EN state'ini sıfırdan yazmıyoruz
- AllergenSelector + DietaryTagSelector: backend `icon` alanını zaten string olarak veriyor (lucide-react icon adı); V1'de emoji fallback yeterli, full lucide icon registry Sprint 5+

**Sonuçlar:**
- 14 admin route build edildi (`npm run build` clean): dashboard + business + theme + menus + categories (3) + items (3)
- 7 yeni component: TranslationTabs, AllergenSelector, DietaryTagSelector, ImageUpload, ConfirmDialog, PriceEditor, MenuForm, CategoryForm, ItemForm, BusinessForm, ThemeForm, ItemsListClient, CategoriesReorder, DeleteMenuButton (client islands)
- `lib/api-admin.ts` 12 yeni typed wrapper (menus/categories/items CRUD + reorder + allergens/tags/orgs/theme)
- `types/admin.ts` 4A'dan gelen model'ler yeterli — değişiklik yok
- Backend tarafında değişiklik yok; Sprint 2'deki 67 test hâlâ yeşil
- Image upload V1 sınırı: parent form `ImageUpload` component'ini kullanır ama gerçek multipart upload Sprint 5'te (D-011). Bu sprint'te görsel önizleme + delete çalışıyor, mevcut görsel backend'de korunuyor.

**Notlar:**
- Backend envelope inconsistency: `menus/categories/menu-items` list+detail `_wrap()` ile `{data, meta}` dönüyor; `organizations/theme/allergens/dietary-tags` default ModelViewSet.list() kullanıyor (raw payload). adminFetch envelope-tolerant yapıldı (`data` varsa VE `count/results` yoksa unwrap, yoksa raw) — D-015-fix
- Tema create path org'a ThemeConfig seed'lenmesini gerektiriyor; V1'de sadece PATCH var (POST yolu hata mesajıyla guard'lı), seed_management komutu Sprint 4C
- Auth expire UX: session expire olunca layout sessizce `/login`'e atıyor, toast yok — Sprint 5+ UX polish'inde
- `/admin/menus/[menuId]/categories/[categoryId]/items/new` POST sonrası edit sayfasına redirect ediyor (kategoriye değil) — operatör hemen çevirileri tamamlasın diye

---

## KARAR D-016 — Audit Log + Admin Summary (Sprint 4C)

**Karar:**
- AuditEvent modeli generic FK pattern (target_type + target_id, generic foreign key yerine) — Django contenttypes bağımlılığı olmadan basit, hızlı sorgu
- Thread-local context (AuditContextMiddleware) request'ten actor + IP'yi signal'lara taşır; signal kayıtları kim yaptı + nereden izlenebilir
- Signal'lar pre_save snapshot kullanır — `post_save` tetiklendiğinde DB zaten yeni değerde olduğu için `pre_save` kayıtlarına `post_save` erişir (request.user ve IP ile birlikte)
- AuditEvent immutable: update/delete API yok, sadece append; retention cron Sprint 6'da
- Admin summary endpoint tenant-scoped (IsOrganizationMember), counts + son 10 audit event, envelope `{data, meta}` (4B D-015 fix pattern uyumlu)

**Tarih:** 2026-09-26

**Bağlam:** V1 demo akışının admin tarafında "kim ne zaman ne yaptı" görünürlüğü + dashboard metrikleri. Frontend admin dashboard'da stat cards + recent events listesi olarak render edilir.

**Alternatifler:**
- django-audit-log paketi — V1 için overkill, custom signal yeterli
- ContentType generic FK — güçlü ama migration/admin complexity ekliyor; 12 entity type için explicit target_type yeterli
- Celery async event yazma — V1 senkron yeterli, async Sprint 6+ (büyük tenant)

**Seçim gerekçesi:**
- Generic FK explicit type + id ile basit sorgu (`AuditEvent.objects.filter(target_type='item', target_id=27)`)
- Thread-local context request scope'unda temiz; middleware'den clear ediyoruz (memory leak önleme)
- pre_save snapshot DB rollback'e karşı dayanıklı (sadece save edilen değişiklikler loglanır)
- Counts sorgusu tek endpoint'te, dashboard için ideal (10 etkinlik + 5 sayı)

**Sonuçlar:**
- `apps/audit/models.py` — AuditEvent (organization FK, actor FK null, action, target_type, target_id, target_repr, payload JSON, IP, created_at) + indexes
- `apps/audit/context.py` — thread-local actor + IP
- `apps/audit/middleware.py` — AuditContextMiddleware (AuthenticationMiddleware'den sonra)
- `apps/audit/signals.py` + `services.py` — MenuItem (price_changed, deactivated, reactivated), Menu (published/unpublished), Category (reordered), Branch, ThemeConfig, Organization signals
- `apps/audit/apps.py` — `ready()` ile signal connect
- `apps/core/views.py` — AdminSummaryView
- Backend test 18 yeni (audit signals + summary endpoint), 85 toplam
- Frontend `apps/web/src/lib/api-admin.ts` — `fetchAdminSummary()` + AuditEvent/AdminSummary types
- Frontend `apps/web/src/app/(admin)/admin/dashboard/page.tsx` — stat cards (5) + recent events listesi + relative time formatter

---

## KARAR D-017 — QR Codes + Media Upload + Analytics Pattern (Sprint 5A)

**Karar:**
- **QRCode model + target URL pattern** — `apps.qr.models.QRCode` (organization FK, branch FK nullable, menu FK, label/table_number, scan_count, is_active) + `target_url` auto-computed on save as `{PUBLIC_BASE_URL}/m/{business_slug}?branch={branch_slug}&qr={qr_id}`
- **PNG generation** — `qrcode[pil]==7.4.2` library (`generate_qr_png` in `apps/qr/utils.py`), encoder version auto-selected, black-on-white, no custom error correction. QR endpoint = `/api/v1/admin/qr-codes/{id}/download` (returns `image/png`, no envelope)
- **Media upload endpoint** — `/api/v1/admin/media/upload` multipart with strict validation: MIME whitelist (`image/jpeg`/`image/png`/`image/webp`), 5 MB cap, extension whitelist, tenant-scoped path `MEDIA_ROOT/uploads/{org_id}/{uuid}-{sanitized_filename}`. Local storage only (D-011 — S3/R2 V2). Mid-stream size re-check so a client that lies about Content-Length is rejected on the second chunk
- **MenuViewEvent generic telemetry** — `apps.analytics.models.MenuViewEvent` for any public menu interaction (menu_view, language_change, whatsapp_click, phone_click, qr_open). Tenant-isolated with explicit `organization` FK (D-016 uyumlu). No contenttypes/generic FK — flat rows + dedicated index `(organization, event_type, -created_at)` keeps GROUP BY trivial
- **IP/UA hashing** — sha256(`ANALYTICS_SALT` + ':' + value) truncated 64 chars. Salt from `ANALYTICS_SALT` env (default `qr-menu-default-salt-change-me`). Production'da 32+ karakter random token set edilmeli. Plain IP ve User-Agent string'i DB'ye ASLA yazılmıyor (`apps.analytics.hashing`)
- **Public events throttle** — DRF `AnonRateThrottle` scope `"public_events"` 30/min/IP. Test skip pattern Sprint 4A gibi (DRF throttle cache process-level, pytest'te izole edilemiyor). Manual curl smoke ile doğrulanır
- **Analytics overview** — `/api/v1/admin/analytics/overview` returns `today_views`, `week_views`, `month_views`, `event_counts` (per-type), `language_distribution` (per-locale ratio), `top_qr_codes` (QRCode.scan_count desc, limit 5), `daily_views` (TruncDate). DB-side aggregation (Postgres), `TruncDate` cross-DB uyumlu (SQLite test dahil)
- **PUBLIC_BASE_URL setting** — `apps.core` mantığıyla `base.py` içinde env'den okunur, default `http://localhost:3000`. Production'da `https://menu.example.com`

**Tarih:** 2026-09-26

**Bağlam:** V1 demo akışının üç parçası tek sprint'te: (1) restoran sahibi QR oluşturur + indirir + masa etiketine basar, (2) ürün/kategori görselini yükleyebilir, (3) müşteri sayfa açınca analytics olay kaydedilir ve admin dashboard metrik olarak gösterir. Tüm üç parça aynı tenant scope'ta, aynı audit pattern'inde.

**Alternatifler:**
- **Custom QR encoder** — kendi Reed-Solomon implementasyonu: overkill, qrcode lib stable + audited
- **S3/R2 storage** — Sprint 5 planı V1'in local MEDIA_ROOT ile başlayacağını netledi (D-011); cloud storage V2'ye
- **ContentType generic FK for MenuViewEvent.qr_code** — D-016 audit pattern plain target_type/id kullanır, ama burada FK only 1 (QRCode), o yüzden plain FK migration'a tercih
- **Recharts/Chart.js in overview** — V1 frontend planı basit SVG bar; backend aggregation yeterli, frontend render Sprint 5B'de
- **Materialized view for daily aggregation** — V1 trafik 10-100 olay/gün bekliyoruz, GROUP BY yeterli; mat view V2'de

**Seçim gerekçesi:**
- `qrcode[pil]` lib minimal dependency, encoder side only — scan side telefon native
- Tenant prefix in upload path (`uploads/{org_id}/`) filesystem-level görünürlük sağlar, metadata'ya bakmadan bile org sınırı görünür
- IP/UA salt + truncate: GDPR/KVKK uyumlu; low-entropy brute-force'a dirençli
- DRF scope-based throttle: test ortamında izole etmesek de prod'da 30/min yeterli koruma
- TruncDate: SQLite test + Postgres prod aynı sorgu; date_trunc Postgres-spesifik olmaktan kaçınıyoruz
- Soft-delete via `is_active=False` (qr.delete()): scan_count historical analytics'te kalmaya devam eder

**Sonuçlar:**
- `apps/qr/` — models.py, views.py (CRUD + DownloadView), serializers.py, urls.py, utils.py (build_target_url + generate_qr_png + sanitize_filename)
- `apps/qr/migrations/0001_initial.py` — QRCode + indexes
- `apps/media/` — views.py (upload + multipart streaming + mid-stream size re-check), urls.py
- `apps/analytics/` — models.py (MenuViewEvent), hashing.py (sha256 + salt), views_public.py, views_admin.py (overview aggregation)
- `apps/analytics/migrations/0001_initial.py + 0002_initial.py` — initial + qr_code FK
- `config/settings/base.py` — PUBLIC_BASE_URL + ANALYTICS_SALT env + `public_events` throttle 30/min
- `.env.example` — ANALYTICS_SALT + PUBLIC_BASE_URL belgelerine eklendi
- `requirements.txt` — `qrcode[pil]==7.4.2` pinned
- 33 yeni backend test (qr: 10, media: 9, analytics events: 5+1 skip, analytics overview: 7), toplam 105+ yeşil (85 + ~20)
- `apps.qr.utils.sanitize_filename` media upload ile paylaşılır (cross-app import path-aq)
- Throttle 30/min test'i skip pattern (Sprint 4A throttle cache pattern'i ile uyumlu); manual curl smoke ile doğrulanır

---

## Karar Geçmişi (Güncel)

| ID | Tarih | Karar | Durum |
|---|---|---|---|
| D-001 | 2026-09-26 | Repo yolu = `/Users/mehmetakif/projects/agency-qr-menu` | aktif |
| D-002 | 2026-09-26 | API framework = DRF | aktif |
| D-003 | 2026-09-26 | Frontend = tek app + route group | aktif |
| D-004 | 2026-09-26 | Deploy = Hetzner + Cloudflare + Caddy | aktif |
| D-005 | 2026-09-26 | GitHub remote = qr-menu_core, public, MIT | aktif |
| D-006 | 2026-09-26 | Demo görseller = logo/kapak AI + ürün/kategori stock | aktif |
| D-007 | 2026-09-26 | Container sabitleme = Python 3.12, Node 20 LTS, PG 16 | aktif |
| D-008 | 2026-09-26 | Custom User: email USERNAME_FIELD + role + Membership | aktif |
| D-009 | 2026-09-26 | Settings & deps: requirements.txt + requirements-dev.txt + pyproject.toml | aktif |
| D-010 | 2026-09-26 | CSRF: GET /auth/csrf + Set-Cookie qr_csrftoken + qr_sessionid | aktif |
| D-011 | 2026-09-26 | Image upload = local MEDIA_ROOT, Sprint 5'te S3/R2'ye geçilecek | aktif |
| D-012 | 2026-09-26 | Slug = save() override + slugify + TR char normalizasyon | aktif |
| D-013 | 2026-09-26 | Next.js 14 standalone output = `next.config.mjs` zorunlu (Next 14.x) | aktif |
| D-014 | 2026-09-26 | Theme override = inline CSS variables (component-level) | aktif |
| D-015 | 2026-09-26 | Admin Panel V1 scope (catalog CRUD + inline edit + reorder + i18n tabs + chip selectors; görsel upload preview-only) | aktif |
| D-016 | 2026-09-26 | Audit Log + Admin Summary (generic FK pattern + thread-local context + pre_save snapshot + immutable append-only; counts + 10 recent events) | aktif |