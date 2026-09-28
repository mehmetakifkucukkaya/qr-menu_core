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

## KARAR D-019 — AI Multimodal Image Generation (Sprint 6B)

**Karar:** mcode-tools `connector__matrix__generate_image` tool'u kullanılarak logo + kapak üretimi.

**Pattern:**
1. `mcode-tools connector call connector__matrix__generate_image --args '{"requests": [{"prompt": "...", "aspect_ratio": "1:1" veya "16:9", "resolution": "1K", "output_file": "modern-cafe-{logo,cover}"}]}'`
2. Response: `success_items[0].node_id` (örn. 446014663938318)
3. `mcode-tools get-asset-url <node_id>` → short-lived OSS URL (24h expiry)
4. `curl -fsS -o /tmp/orig.jpg "<oss_url>"` → indir
5. PIL ile optimize (resize, convert to WebP, quality 85-90, method 6)
6. Final: `apps/web/public/demo-assets/modern-cafe-{logo,cover}.webp` (git'e commit)

**Prompt patterns (Modern Cafe için):**
- Logo (1:1, 512x512): "Minimalist modern coffee shop logo, single letter M intertwined with a stylized coffee cup steam swirl, warm earth tones (cream + coffee brown + terracotta accent), flat vector design, white background"
- Kapak (16:9, 1200x675): "Modern specialty coffee shop interior, warm natural lighting, wooden counter with brass details, exposed brick wall, soft focus latte art on cup in foreground, golden hour, editorial food photography style"

**Tarih:** 2026-09-26

**Bağlam:** D-006 kararı "logo + kapak AI ile, ürün/kategori stock placeholder". V1 demo için profesyonel marka görseli.

**Sonuçlar:**
- `apps/web/public/demo-assets/modern-cafe-logo.webp` (10.9 KB, 512x512)
- `apps/web/public/demo-assets/modern-cafe-cover.webp` (96.2 KB, 1200x675)
- `apps/web/public/demo-assets/og-image.jpg` (138.2 KB, 1200x630)
- `apps/web/public/favicon.ico` (modern-cafe-logo.webp kopyası)
- `apps/web/src/app/layout.tsx` root metadata (OG image, favicon, twitter card)
- `apps/web/src/app/(public)/m/[businessSlug]/page.tsx` `generateMetadata()` (per-business OG + twitter)

**Notlar:**
- 2 image generation call (logo + kapak), toplam < 30 saniye
- OSS URL 24h expire, image generation sonrası hemen indirmek gerekli
- Varyasyon: 2 logo üretip en iyisini seçmek (V2'de A/B test)
- WebP optimize method 6 (lanczos resize + quality 85-90) — kalite/boyut optimal
- OG image JPEG olarak kalır (Twitter/Facebook JPEG daha iyi destekler)

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
| D-017 | 2026-09-26 | QR + Media + Analytics (qrcode[pil] lib, multipart upload mime/size validation, MenuViewEvent + IP/UA hash with ANALYTICS_SALT) | aktif |
| D-018 | 2026-09-26 | Production settings (env-driven, Caddy-proxied HSTS, secure cookies, JSON logging, Sentry opt-in, dj-database-url) | aktif |
| D-019 | 2026-09-26 | AI multimodal generation pattern (mcode-tools `connector__matrix__generate_image`; aspect_ratio + resolution; output_file; node_id → get_asset_url → curl → PIL optimize WebP 512x512 / 1200x675) | aktif |
| D-017 | 2026-09-26 | QR Codes + Media Upload + Analytics Pattern (qrcode[pil] PNG; tenant-prefix uploads; sha256+salt IP/UA hashing; per-event throttle; Postgres-side aggregation) | aktif |
| D-018 | 2026-09-26 | Production settings pattern (env-driven; SECRET_KEY/ALLOWED_HOSTS/CORS runtime guards; Caddy-proxied HTTPS; JSON-to-stdout logging; optional Sentry) | aktif |
---

## KARAR D-018 — Production Settings Pattern + Deploy Config (Sprint 6A)

**Karar:**
- **Env-driven everything** — `config/settings/production.py` reads `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DATABASE_URL`, `ANALYTICS_SALT`, `SENTRY_DSN` from env; no hard-coded values, no safe-looking defaults that would silently ship with a placeholder secret
- **Runtime safety rails** — production.py raises `RuntimeError` at import time if `DJANGO_SECRET_KEY` is missing/placeholder, `DJANGO_ALLOWED_HOSTS` is empty, or `CORS_ALLOWED_ORIGINS` is empty. Fail fast at startup, not at the first request
- **HTTPS via Caddy, not Django** — Caddy terminates TLS at the edge (auto Let's Encrypt) and reverse-proxies `/api/*`, `/admin/*`, `/health`, `/media/*`, `/static/*` to the backend container. Django trusts `X-Forwarded-Proto` (one-hop) so `SECURE_SSL_REDIRECT` and `SECURE_HSTS_SECONDS=31_536_000` (1 year, preload) work without breaking the loop
- **Cookies secure + SameSite=Lax** — single-domain setup (api + menu on `*.example.com`) keeps `SameSite=Lax` for top-level navigation POSTs; `Secure` flag is on so cookies never leak over plain http
- **JSON logs to stdout** — `json_logging.JSONFormatter` (12-factor), falls back to a hand-rolled JSON shape if the lib is missing so a slimmer image can still start. DEBUG mode keeps the readable `[{asctime}] {levelname} {name}: {message}` format for local debugging
- **Sentry opt-in** — `if SENTRY_DSN:` guards `sentry_sdk.init()` so the same image works with or without a monitoring account. 10% traces sample rate, `send_default_pii=False` (GDPR/KVKK default)
- **Dockerfile prod target** — multi-stage (base / dev / prod). `prod` stage chains `migrate → collectstatic → gunicorn --workers 3 --timeout 60` so a single `docker compose up -d` brings the API to a serving state without manual steps
- **`docker-compose.production.yml`** — 4-service stack (postgres + backend + frontend + caddy), all `restart: unless-stopped`. Postgres has NO host port mapping (network-internal only). Caddy is the only service publishing 80/443
- **Caddyfile** — single primary site `{$DOMAIN:localhost}` with backend-specific reverse proxies first, frontend catch-all second. Security headers (HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy) applied to every response via Caddy `header` block (defence-in-depth alongside Django's own headers)
- **`.env.production.example`** — template only; `.env.production` is in `.gitignore` (covered by `.env*` catch-all). Documented with `secrets.token_urlsafe(50)` commands for each value
- **`scripts/validate_prod_env.sh`** — pre-deploy sanity check: required vars present, no placeholders, DJANGO_SECRET_KEY ≥ 50 chars, POSTGRES_PASSWORD ≥ 24 chars, ANALYTICS_SALT ≥ 32 chars. Exits non-zero on any failure so it can gate a CI deploy
- **Production settings tests** — `tests/test_production_settings.py` (14 tests) pins the safety rails: structural source check (10 tests) + subprocess end-to-end (4 tests). Refactoring `production.py` without keeping the guards breaks CI

**Tarih:** 2026-09-26

**Bağlam:** V1 demo'su local'de çalışıyor (Sprint 5B-2 sonu), production deploy Hetzner + Cloudflare + Caddy (D-004) kararı Sprint 0'da alındı, gerçek deploy V1 demo'su sonrasına ertelendi. Bu sprint sadece production config + docs hazırlıyor; gerçek deploy manuel (V1 sonrası).

**Alternatifler:**
- **Django Caddy yerine Nginx** — Nginx daha güçlü ama Caddy'nin otomatik Let's Encrypt + HSTS + zero-downtime restart özellikleri V1 demo için yeterli. Nginx V2'ye (multi-tenant scaling)
- **Whitenoise / static served by Django** — V1 demo'sunda `/static/*` trafiği düşük; Caddy reverse proxy tek network hop, Whitenoise'un process overhead'i yok
- **Self-hosted Sentry** — V1 SaaS free tier (5K events/ay) yeterli; self-hosted V2+ (multi-tenant, daha büyük ölçek)
- **Env-based config only (no YAML/TOML)** — Django settings.py zaten Python; `.env` + `os.environ.get()` pattern proje genelinde tutarlı (local + test + prod aynı `base.py`'yi inherit ediyor). YAML/TOML ek dependency
- **`DEBUG=False` her zaman (env override yok)** — Sprint 5B-2'de bir kere `DJANGO_DEBUG=1` ile prod-shaped config kullanarak bug debug ettik; env override kalsın ama default hâlâ `0`

**Seçim gerekçesi:**
- Runtime safety rails (`RuntimeError` at import): bir kez "production'da placeholder secret ile deploy ettik" skandalı yaşamamak için startup-time fail. Tests `config.settings.test` modülünü kullanır (production.py import etmez), 14 yeni structural test production.py'nin korunmasını sağlar
- Caddy-proxy pattern: TLS termination + reverse proxy + security headers tek container'da; backend basit kalır (`SECURE_PROXY_SSL_HEADER` ile bir hop trust eder)
- JSON stdout: 12-factor compliant, Better Stack / Loki / Datadog / CloudWatch hepsi native parse eder. `json-logging` lib requirements-dev.txt'te (dev + prod aynı image)
- Dockerfile prod target: gunicorn + collectstatic + migrate tek CMD'de. V2'de init container + healthcheck + rolling restart için base altyapısı hazır
- `docker-compose.production.yml` restart: unless-stopped: VPS reboot'ta stack otomatik ayağa kalkar
- `validate_prod_env.sh` exit codes: CI gate olarak kullanılabilir (`bash scripts/validate_prod_env.sh || exit 1`)

**Sonuçlar:**
- `backend/config/settings/production.py` — env-driven, runtime guards, JSON logging, optional Sentry
- `backend/Dockerfile` — multi-stage (base / dev / prod), prod target = migrate+collectstatic+gunicorn
- `docker-compose.production.yml` — 4 servis stack (postgres + backend + frontend + caddy)
- `Caddyfile` (root) — HTTPS + reverse proxy + security headers + `{$DOMAIN:localhost}` env placeholder
- `.env.production.example` — template with `secrets.token_urlsafe(N)` regeneration commands
- `scripts/validate_prod_env.sh` — required vars + strength checks, exit codes for CI
- `docs/DEPLOYMENT.md` — 12-section runbook (Prerequisites, Initial Setup, First Deploy, Subsequent, Backup, Rollback, Monitoring, Performance, Security, Troubleshooting, Appendices)
- `backend/requirements.txt` — `sentry-sdk[django]==2.19.2` eklendi
- `backend/requirements-dev.txt` — `json-logging==1.4.1` eklendi
- `tests/test_production_settings.py` — 14 yeni test (10 structural source check + 4 subprocess e2e)
- Backend test sayısı 120 → 134 (yeşil)
- `python -c "import config.settings.production"` artık valid env ile çalışır, eksik env ile RuntimeError fırlatır (CI gate)

**Notlar:**
- Hetzner VPS şu an yok, gerçek deploy V1 sonrası. Bu sprint config + docs hazırlıyor
- 6A sonunda 6B başlayacak (AI görsel + meta tags + QR seed)
- Caddyfile'da `{$DOMAIN:localhost}` default localhost — production'da env ile override edilir
- Sentry opsiyonel — `SENTRY_DSN` env varsa init olur, yoksa skip
- `docker-compose.production.yml` restart: unless-stopped ile sunucu reboot'ta otomatik restart
- Production settings module test ortamında import edilmemeli (`DJANGO_SETTINGS_MODULE=config.settings.test` zaten set'li, test.py `from .base import *` kullanır)

---

## KARAR D-020 — Monitoring + Observability Pattern (Sprint 6C)

**Karar:**
- **Health endpoint `GET /health`** — `AllowAny`, throttle yok, DB bağlantı check + version + UTC timestamp. HTTP her zaman 200; body'si `status: ok|degraded` ile konuşur (D-018'de gerekçelendirildi — LB ve Docker healthcheck body'i parse eder, 503 fırlatmak probe loop'ı yanıltır)
- **Sentry SaaS (free tier)** — `SENTRY_DSN` env varsa `sentry_sdk.init()` opt-in. `send_default_pii=False` (KVKK), `traces_sample_rate=0.1`, environment=production. Aynı image Sentry olmadan da ayağa kalkabilir
- **Better Stack uptime checks (free tier)** — 5 dakika interval, GET /health probe. E-posta + Slack webhook alert. Better Stack üzerinden incident timeline tutulur (V1 demo'sunda 1 adet ücretsiz monitor yeterli)
- **JSON logging to stdout (12-factor)** — Production settings `json_logging.JSONFormatter` kullanır; her log satırı `{"ts": "...", "level": "INFO", "logger": "...", "msg": "..."}`. Loki/Datadog/CloudWatch/Better Stack hepsi native parse eder. DEBUG modunda okunabilir `[{asctime}] {levelname}` formatına düşer
- **`X-Request-Id` middleware (her response'da)** — `meta.request_id` JSON field'ı + response header. Log korelasyonu için: bir request'in tüm log satırları aynı `request_id` taşır
- **Smoke test gate (`scripts/smoke_test.sh`)** — 9 check (health, public menu, frontend, auth gate, pytest, tsc, QR count, demo assets). Exit 0/1, CI'da pre-deploy job olarak kullanılabilir; local'de `./scripts/smoke_test.sh`
- **Backup pattern (cron, V1 scope-out)** — V1 demo için `pg_dump` cron'u V2 backlog'unda; backup stratejisi Sprint 6A DEPLOYMENT.md §6'da dokümante (manuel backup + Hetzner snapshot). Gerçek otomasyon V2'de

**Tarih:** 2026-09-26

**Bağlam:** V1 deploy'u sonrası çalışır durumda olmalı, hata olursa hızlı tespit + recovery gerekli. Monitoring yığını mümkün olduğunca "free tier + opt-in" — gerçek production trafik V2'de başlayacak

**Alternatifler:**
- **Self-hosted Sentry** — Free tier 5K event/ay V1 için yeterli; self-hosted V2+ (multi-tenant scale, PII kontrolü sıkılaştırma)
- **Prometheus + Grafana** — V1 overkill. Better Stack uptime + Sentry error tracking V1 demo'su için yeterli; metrik dashboard V2'de (Lighthouse score, request latency, error budget)
- **Cloud-native monitoring (CloudWatch / Stackdriver)** — V1 Hetzner VPS'te, cloud-provider bağımlılığı istemiyoruz. Vendor lock-in V2 kararı
- **Datadog APM** — Pahalı ($0.10/host/gün + custom metrics). V1 demo'su için burn rate yüksek
- **Log drain (Vector / Fluent Bit)** — V1 stdout log'larını external sink'e göndermek için V2. Şimdilik `docker compose logs` yeterli
- **Health endpoint için 503 when degraded** — Docker healthcheck `retries=3` ile bu zaten oluyor (3 fail → unhealthy → container restart). 503 manuel olarak da eklenebilir ama LB health probe'u 503'ü "remove from pool" olarak okur — bu sefer tek transient DB blip'inde tüm instance'lar LB'den çıkar, recovery yavaşlar. Body konuşsun kuralı daha sağlam

**Seçim gerekçesi:**
- Sentry SaaS free tier: KVKK'ya uyumlu (`send_default_pii=False`), 5K event yeterli, opsiyonel (`SENTRY_DSN` env ile enable)
- Better Stack: V1 demo'su için 1 monitor + e-posta alert free tier kapsamında; V2'de HTTP probe + keyword check + status page eklenebilir
- JSON stdout: 12-factor compliant, vendor-agnostic, Better Stack / Datadog / CloudWatch hepsi native parse eder. V2'de vendor lock-in olmadan log aggregator değiştirebiliriz
- `X-Request-Id` middleware: Maliyet sıfır (header forward + generate), debug experience dramatik iyileşir (bir request'in tüm log'ları gruplanabilir)
- Smoke test script: Pre-deploy gate olarak CI'da çalışır, local'de developer's "is the demo ready?" sorusuna 1 dakikada cevap. Tüm 9 check read-only + idempotent
- DB backup cron V2'de: V1 demo'su tek bir org + tek bir VPS'te, gerçek backup ihtiyacı az. Manual `pg_dump` + Hetzner snapshot Sprint 6A'da dokümante edildi

**Sonuçlar:**
- `backend/apps/health/views.py` — `HealthView` her zaman 200 döner, body'si konuşur (D-018 gerekçesi)
- `backend/config/settings/production.py` — JSON formatter + Sentry opt-in + `X-Request-Id` propagation
- `docs/API_CONTRACT.md` §2.1 — `/health` shape dokümante
- `docs/TROUBLESHOOTING.md` §16 — "Sentry not receiving errors" fix
- `docs/DEPLOYMENT.md` §8 — Monitoring section (Better Stack + Sentry setup adımları, Sprint 6A)
- `scripts/smoke_test.sh` — 9 check pre-deploy gate (CI + local)
- Backend test sayısı değişmedi (134 yeşil) — bu sprint sadece docs + ops script
- V1 demo-ready monitoring: Better Stack hesabı açılınca + Sentry hesabı açılınca gerçek DSN'ler `.env.production`'a girer

**Notlar:**
- V1 demo gerçek deploy olmadığı için Better Stack + Sentry hesapları henüz yok; bu sprint pattern'i belirliyor, hesaplar gerçek deploy günü açılacak
- `scripts/smoke_test.sh` 9 check kapsamında; Sprint 7+ yeni check eklenirse (örn. Lighthouse CI, Playwright) aynı script genişler
- DB backup otomasyonu (pg_dump cron) bilinçli olarak V2 — V1 demo'su tek bir müşteri, manual backup yeterli
- JSON log format Better Stack'e forward'lanabilir (V2 — V1'de sadece stdout)
- `X-Request-Id` middleware V1'de Django'nun kendi middleware'i; Caddy reverse proxy header'ı forward eder

---

## KARAR D-021 — AI PDF Menu Import Pattern (Sprint 7A)

**Karar:**
- **AI provider stratejisi:** OpenAI GPT-4o primary, Anthropic Claude 3.5 Sonnet fallback. OpenAI önce dener; herhangi bir exception'da (rate limit, timeout, content policy, network) Anthropic'e düşer. İkisi de başarısız olursa endpoint `502 ai.parse_failed` döner, kullanıcıya anlamlı hata gösterir
- **Structured output:** OpenAI `response_format={"type": "json_schema"}` ile constrained — AI'ın serbest text dönmesini engeller. Anthropic'de aynı schema prompt'un içinde verilir, cevap JSON olmazsa `\`\`\`json ... \`\`\`` fence'leri temizlenir
- **İki katmanlı model:** `MenuImportDraft` (PDF metadata + AI provider + status + parsed JSON) ve `MenuImportItem` (draft FK + sort_order + category_name + name + price + currency + allergens + dietary_tags + confidence + is_edited). Review/edit onaylanana kadar `Menu/Category/Item` modellerine dokunulmaz. Confirm atomik transaction'da bulk-save yapar
- **Status machine:** `pending → parsing → parsed → {confirmed | discarded | failed}`. Terminal state'lerden çıkış yok; re-upload yeni draft açar. UI'da "draft hâlâ review bekliyor" gösterilir
- **PDF guardrails:** MIME `application/pdf`, max 10 MB, mid-stream abort (Content-Length yalan söylerse erken kes). Storage `MEDIA_ROOT/pdf_imports/{org_id}/{uuid4}-{filename}.pdf` — organization-prefix'li path
- **Tenant izolasyonu:** `IsOrganizationMember` + her endpoint'te ilk aktif membership'ten org çözümleme. Başka org'un draft/item'ı `404`. AuditEvent'ler de org-scoped
- **Audit integration:** 3 yeni action — `ai_import_uploaded` (target_type=`menu_import_draft`), `ai_import_confirmed` (target_type=`menu`, payload'da `draft_id` + `item_count` + `ai_provider` + `ai_model`), `ai_import_discarded` (payload'da `status_before`)
- **Confidence UX:** `confidence_avg` decimal(4,2) `MenuImportDraft`'ta, ayrıca her item'da `confidence` decimal(4,2). Frontend (7B) `confidence < 0.5` olan satırları kırmızı vurgular. Eşik 0.50 UI kararı; backend sadece skor verir
- **Edit-before-confirm:** Admin `PATCH /items/{id}/` ile whitelist'teki alanları (`name`, `description`, `price`, `allergens`, `dietary_tags`, `category_name`) düzenleyebilir. `is_edited=True` set edilir. Sadece `status=parsed` olan draft'lar editable; confirmed/failed/discarded read-only
- **Bulk save ordering:** `MenuCategory` oluşturulurken sıra, AI'ın item'ları emit etme sırasıdır (en küçük `MenuImportItem.id` proxy). Kategori adına alfabetik sort **yapılmaz** — SQLite'ın Türkçe collation'ı "Sıcak" ve "Soğuk"'u yanlış sıralar (Unicode 'ı' yüksek codepoint)
- **SDK lazy-load:** OpenAI/Anthropic modülleri `services._get_openai()` / `_get_anthropic()` üzerinden ilk kullanımda import edilir. Test'ler bu helper'ları mock'lar; CI'da gerçek API key gerekmez
- **Future V2 backlog:** PDF'ten image extraction (kategori/item fotoğrafı kopyalama, copyright riski nedeniyle V1'de yok), OCR fallback (pypdf pinlendi, henüz kullanılmıyor), multi-language parsing (V2 ileri), image-aware vision prompt (V2 ileri), per-org quota (V2 SaaS feature)

**Tarih:** 2026-09-26

**Bağlam:** V2 ilk sprint. Operatörün PDF menüsünü upload edip AI ile otomatik parse → review/edit → onay ile menü oluşturma süresini **5 dakikadan 30 saniyeye** düşürmek. V1'deki manuel 25-ürün seed_demo'nun otomatik versiyonu. OpenAI multi-modal vision (GPT-4o PDF'i görsel okuyor, text extraction değil) Claude'da da native document content block ile çalışır

**Alternatifler:**
- **Sadece OpenAI (fallback yok):** Rate limit / downtime durumunda demo kırılır. Çift provider = availability guarantee
- **Anthropic primary, OpenAI fallback:** İkisi de güçlü; OpenAI'nin structured-output (`json_schema`) desteği Anthropic'den daha iyi, primary olarak tercih edildi
- **Direct PDF text extraction + heuristic parsing (AI yok):** Layout varies (multi-column, image-only menus); AI vision zor kısımları çözüyor (handwritten, scanned). Heuristic yetersiz
- **Llama / Mistral self-hosted:** Multi-modal vision için yeterli kalite yok (2026-09); API'ler operasyonel olarak daha basit. V2+ ileri self-hosted opsiyon olabilir
- **Confirm flow = sync (tek transaction'da parse + bulk save):** 30+ saniye beklenir, request timeout riski. Mevcut pattern 2 adım: upload → parse (sync, hızlı) → confirm (sync, hızlı). Status polling ile UX hala doğal
- **Save to draft DB model, but commit to menu via separate job:** Queue/Celery ekle complexity. V2 SaaS scale'de düşünülür; V1'de sync yeterli
- **Inline edit menu modelinde (draft model yok):** Kullanıcı yanlışlıkla yanlış menüye yazabilir; rollback zor. Draft model = review buffer
- **Category/image extraction from PDF:** Image extraction complexity + copyright riski; V1'de yok (V2 backlog)

**Seçim gerekçesi:**
- OpenAI primary + Anthropic fallback: structured output sınırı + rate-limit recovery. Her iki sağlayıcının API key'i env'de opsiyonel; biri varsa o çalışır, ikisi de yoksa demo'da mock response ile development mümkün (V2 backlog)
- Draft + Item iki katman: review/edit atomik, partial success durumunda kurtarma mümkün, confirm ayrı bir step
- Status machine explicit: terminal state'ler net, re-upload yeni draft açar — UX'te "hayalet" durum yok
- Tenant + audit standart pattern: V1'deki `IsOrganizationMember` + `record_event` reuse, kod tutarlılığı
- PDF guardrails (mime + size + mid-stream): kötü niyetli upload'lar (örn. Content-Length yalanı) sistemi kilitlemesin
- Confidence decimal(4,2): skor 0.00-1.00 arası 2 ondalık hassasiyetle. UI 0.50 eşiği ile "düşük güven" rozeti
- Edit whitelist (`EDITABLE_FIELDS`): kullanıcı draft'ın internal alanlarını (`status`, `ai_provider`, `parsed_data` vs.) değiştiremesin; explicit whitelist = daha güvenli parse
- Bulk save sırası = AI emit sırası (en küçük id proxy): operatörün beklediği sıra korunur. Alfabetik sort Türkçe collation bug'ı yaratır
- SDK lazy-load: AI key olmadan development ortamı çalışsın, test'lerde mock'la; production'da her iki SDK import graph'ta hazır

**Sonuçlar:**
- `backend/apps/pdf_import/` — yeni Django app (models, schemas, services, views, urls, admin, migrations, tests)
- `backend/apps/pdf_import/models.py` — `MenuImportDraft`, `MenuImportItem`
- `backend/apps/pdf_import/schemas.py` — `MENU_PARSE_SCHEMA` JSON schema, `SYSTEM_PROMPT`, `EDITABLE_FIELDS`
- `backend/apps/pdf_import/services.py` — `parse_menu_pdf()`, `_parse_with_openai()`, `_parse_with_anthropic()`, `confirm_draft()`. Lazy SDK import pattern
- `backend/apps/pdf_import/views.py` — 6 endpoint (upload, drafts list/detail, item update, confirm, discard)
- `backend/apps/pdf_import/urls.py` + `backend/config/urls.py` mount — `/api/v1/admin/pdf-import/`
- `backend/apps/audit/models.py` — `ACTION_CHOICES` +3 (ai_import_uploaded, ai_import_confirmed, ai_import_discarded), `TARGET_CHOICES` +1 (menu_import_draft). Migration `0002_alter_auditevent_action_alter_auditevent_target_type.py`
- `backend/config/settings/base.py` — `apps.pdf_import` INSTALLED_APPS, AI settings (OPENAI_API_KEY, OPENAI_DEFAULT_MODEL, ANTHROPIC_API_KEY, ANTHROPIC_DEFAULT_MODEL), PDF guardrails (PDF_IMPORT_MAX_SIZE_BYTES=10MB, PDF_IMPORT_MAX_PAGES=20)
- `backend/requirements.txt` — openai==1.54.0, anthropic==0.36.2, pypdf==5.1.0
- `.env.example` + `.env.production.example` — AI key env var blokları eklendi
- `backend/apps/pdf_import/migrations/0001_initial.py` — yeni modeller + 3 index
- Test: 171 yeşil (134 V1 + 37 yeni). PDF import tests: test_upload.py (7), test_parsing.py (7), test_confirm.py (9), test_views.py (14)
- Test coverage: happy-path + MIME/size validation + tenant isolation + audit event + provider fallback + schema hataları + atomic rollback + edit/discard lifecycle + unknown draft 404 + cross-tenant 404
- Mocked AI tests: `services._get_openai`/`_get_anthropic` patched, gerçek SDK call yok. CI'da API key gerekmez
- Frontend (Sprint 7B): `/admin/pdf-import` list, `/admin/pdf-import/new` upload + drag-drop, inline edit table, confidence < 0.5 highlight, confirm modal
- DECISIONS.md'de (bu karar) ve SPRINT_7_PLAN.md'de dokümante

**Notlar:**
- 7B frontend gelmeden operatör AI import'u kullanabilir mi? Django admin görüntüleme (`/admin/pdf_import/menuimportdraft/`) read-only çalışır — yükleme + onay için frontend şart. Demo akışı 7B sonrası uçtan uca
- OpenAI Files API uploaded file'ı 30 gün tutar, biz her parse sonrası `client.files.delete()` ile sileriz. Maliyet etkisi sıfır
- GPT-4o vision PDF'i text extraction değil, görsel olarak okur. Bu nedenle image-only menüler de parse olur (handwritten V2 backlog'unda)
- Anthropic document content block base64 + media_type ile çalışır, max 100 sayfa ve 32 MB. Biz 10 MB / 20 sayfa koyduk (OP-16) — operatör için makul
- `confidence` AI'ın kendi tahmini; ground truth yok. UI'da "düşük güven" rozeti operatörü uyarır, ama engellemez
- V2 ileri: gerçek SaaS quota (parse başına maliyet takibi), image extraction (kategori/item fotoğrafı), multi-language menu (TR/EN aynı PDF'ten), handwritten OCR fallback
- 7B frontend demo'su: Modern Cafe PDF'i yükle → AI parse → "Türk Kahvesi 45 TL, Çay 15 TL, Limonata 65 TL" + 2 kategori (Sıcak/Soğuk İçecekler) → confirm → menü `/m/modern-cafe` altında canlı

---

## KARAR D-022 — Order + Kitchen Flow Pattern (Sprint 8A)

**Karar:**
- **Order model:** `organization` (PROTECT), `branch` (SET_NULL nullable), `menu` (SET_NULL nullable), `order_number` (max 30, unique=True, format `{slug2}-{YYYYMMDD}-{NNN}`), `table_number`, `customer_name`, `customer_phone`, `notes`, `status` (OrderStatus enum 6 değer), `total_amount` (DecimalField(10,2) OP-6 uyumlu), `currency`, 6 lifecycle timestamp (placed/confirmed/preparing/ready/delivered/cancelled), `metadata` JSON. Indexes: `(organization, -placed_at)` dashboard, `(organization, status)` kitchen
- **OrderItem:** `order` FK (CASCADE), `menu_item` FK (SET_NULL nullable — item silinse bile order bozulmaz), `name` + `price` snapshot (DB'den kopyalanır; sonradan menü değişse bile order doğru render), `quantity`, `notes`
- **Order number generator:** `{slug[:2].upper()}-{YYYYMMDD}-{NNN}` formatı. Counter **prefix-scoped (global)**, per-org DEĞİL — iki org aynı 2-harf öneki paylaşırsa DB unique constraint çakışır (test ile yakalandı). Per-day reset. Integrity race olursa retry (max 5)
- **Total hesabı:** Server-side, client price YOK sayılır (güvenlik). `calculate_total_from_items` her line için `MenuItem.price`'ı DB'den okur, `is_active=False` ve `is_available=False` ValidationError ile reject
- **Status state machine:** `STATUS_TRANSITIONS` dict — pending→{confirmed,cancelled}, confirmed→{preparing,cancelled}, preparing→{ready,cancelled}, ready→delivered, delivered + cancelled terminal. `transition_status()` validate + timestamp stamp + audit event emit. Yeni status'a göre ilgili timestamp set edilip `save(update_fields=...)` ile partial update; sonra `record_event(target_type='order', action='order_<new_status>', payload={'from','to'})`
- **6 audit action + 'order' target_type:** `order_placed` (customer public POST), `order_confirmed`, `order_preparing`, `order_ready`, `order_delivered`, `order_cancelled`. Naming convention OrderStatus değerleriyle bire bir eşleşiyor — payload lookup trivial
- **Endpoints (6):** public POST `/public/orders` (AllowAny + throttle 20/min `public_orders` scope, customer_name/phone trim, total + audit emit), public GET `/public/orders/{number}/status` (sadece status + 5 timestamp, internal field leak YOK — phone/notes/total dönmez), admin GET `/admin/orders/` (?status + ?date filter, son 100 order, item_count branch_name eklentisi), admin GET `/admin/orders/{id}` (full order + items snapshot), admin POST `/admin/orders/{id}/status` (transition validation + audit), admin GET `/admin/kitchen/tickets` (default pending+confirmed+preparing; ?status= override; ?status=all)
- **Tenant isolation:** admin lookuplar organization ile filter. Cross-tenant cross-tenant 404 (existence leak yok). Kullanıcı membership yoksa 404. Platform admin bypass YOK (audit.summary ile aynı tutarlılık)
- **Throttle:** public POST 20/min (AnonRateThrottle custom scope `public_orders`). Public GET status throttlesız değil ama default anon bucket (60/min) yeterli — 15s polling × 4 = 4 req/dk müşteri, 20 sipariş için OK
- **Snapshot semantiği:** `OrderItem.name` + `OrderItem.price` write-time DB snapshot. Menü güncellense bile eski siparişler doğru renderlanır. Test: `test_order_creation_creates_order_items_with_snapshots`
- **`metadata` JSON:** V2 ileri için reserve. Masa session ID, source QR code, özel talimatlar (per-item olmayan). V1'de boş dict default
- **Future V2 backlog:** WebSocket real-time (V2), online ödeme (Sprint 9 — ödeme akışı), müşteri hesabı + sadakat (V2 ileri), masa QR scanner (V2 — table_number otomatik populate), ses bildirimleri (mutfak V2), POS entegrasyonu, multi-restaurant (V2 SaaS)

**Tarih:** 2026-09-26

**Bağlam:** V2 ikinci sprint. Müşteri public menüden sipariş verir → admin onaylar → mutfak hazırlar → müşteri "Hazır!" görür. POS entegrasyonu olmadan V1 seviyesinde. Hedef demo akışı uçtan uca: masada QR okut → sipariş ver → admin kabul et → mutfak ticket bas → hazır olunca müşteriye bildir → teslim edildi

**Alternatifler:**
- **Müşteri hesabı (login/password + login flow):** V1 için yavaş onboarding; hesap açmadan sipariş friction az. V2 ileri sadakat için gerekli olacak
- **Server-side cart (cross-device sync):** Account gerektirir; V2 ileri. localStorage V1 yeterli
- **Real-time WebSocket (channel layer / Daphne + Redis):** V1 polling 15s yeterli, WebSocket complexity V2'ye ertelendi. V2 SaaS scale için gerekli
- **Payment integration (Stripe / iyzico):** Sprint 9'da. Önce sipariş akışı oturur, sonra ödeme
- **Order number = UUID:** machine-readable ama operatör telefonla okuyamaz. MC-20260115-001 human-readable
- **Snapshot yerine canlı FK price lookup:** menü değişince eski siparişler yanlış renderlanır; mali kayıt bozulur. Snapshot = audit-friendly
- **Per-org counter:** 2 harf önek çakışması bug'ı yakalandı test'te (cafe-a/cafe-b → CA). Global prefix counter ile çözüldü

**Seçim gerekçesi:**
- Telefon+isim customer auth (V1), account V2 ileri: V1 demo akışını 90 saniyeye indirmek için friction sıfır. Account + sadakat V2'de karlılık + engagement artışı
- Server-side total (client price ignored): güvenlik. Manipülasyon denemelerinde "price" field ignore edilir, DB fiyatı kazanır
- 6-state FSM, terminal explicit: pending/confirmed/preparing/ready/delivered/cancelled — operatör mutfak ekranında sadece aktifleri görür, delivered/cancelled hidden (default filter)
- Snapshot price+name: mevzuat/muhasebe için kritik; menü fiyat değişikliği eski siparişleri geriye dönük değiştirmemeli
- Prefix-scoped global counter: format + uniqueness sağlıyor, aynı önekli iki org DB constraint çakışmasını test'te yakaladık
- Audit action naming convention OrderStatus = OrderStatus değerleriyle bire bir — `order_<status>` event lookup trivial, payload'da from/to tek başına yeterli
- Admin throttle yok: operatör kendi IP'sinden ardışık update yapabilir. Public endpoint throttle yeterli (DDS baseline)
- Snapshot pattern için SET_NULL FK: menü item silinse bile order item satırı duruyor, name+price snapshot render yapıyor

**Sonuçlar:**
- `backend/apps/orders/` — yeni Django app (models, serializers, services, views, urls_public, urls_orders, urls_kitchen, admin, migrations, tests)
- `backend/apps/orders/models.py` — `Order` + `OrderItem`, `OrderStatus` enum (TextChoices)
- `backend/apps/orders/services.py` — `generate_order_number` (prefix-global), `calculate_total_from_items` (server-side, DB price), `create_order` (atomic + IntegrityError retry), `transition_status` (FSM + timestamp + audit). `STATUS_TRANSITIONS` dict
- `backend/apps/orders/views.py` — 6 endpoint (2 public, 4 admin), `_resolve_organization`, `_wrap`, `PublicOrderCreateThrottle` (20/min)
- `backend/apps/orders/serializers.py` — `OrderItemSerializer`, `OrderSerializer`, `PublicOrderCreateSerializer` + `PublicOrderLineSerializer`
- `backend/apps/orders/urls_public.py` — POST + GET status
- `backend/apps/orders/urls_orders.py` — admin list/detail/status
- `backend/apps/orders/urls_kitchen.py` — tickets feed (separate prefix kararlılığı için)
- `backend/apps/orders/admin.py` — Django admin registration, readonly_fields timestamp koruması
- `backend/apps/orders/migrations/0001_initial.py` — Order + OrderItem, 2 index
- `backend/apps/audit/models.py` — `ACTION_CHOICES` +6 (order_placed, order_confirmed, order_preparing, order_ready, order_delivered, order_cancelled), `TARGET_CHOICES` +1 ('order'). Migration `0003`
- `backend/config/settings/base.py` — `apps.orders` INSTALLED_APPS, `DEFAULT_THROTTLE_RATES['public_orders']='20/min'`
- `backend/config/urls.py` — mount `/admin/orders/`, `/admin/kitchen/`, `/public/orders`
- Test: 229 yeşil (171 + 58 yeni). Orders tests: test_order_creation (13), test_status_transitions (12), test_views (20), test_security (13)
- Test coverage: happy-path snapshot + tenant isolation + cross-tenant 404 + audit event + state machine illegal edges + terminal no-op + DB unique constraint + negative decimal reject + throttle rate registration
- DECISIONS.md'de (bu karar) ve SPRINT_8_PLAN.md'de dokümante

**Notlar:**
- 8A sonunda 8B başlayacak: public cart drawer + checkout modal + confirmation page polling + admin orders list/detail/status update UI + sidebar Orders link
- 8B sonunda 8C mutfak ekranı: full-screen-style grid + 10s polling + status butonları + pulse animation (pending + confirmed + preparing)
- Order number format `{slug[:2].upper()}-{YYYYMMDD}-{NNN}` (test pattern: cafe-a → "CA-20260926-001"). Prefix-global counter nedeniyle cafe-a + cafe-b aynı gün "CA-20260926-001" + "CA-20260926-002" üretiyor — operatör için bu çoklu-restaurant V2'ye kadar sorun değil
- 8A sonrası 8B için cart store (Zustand + localStorage persist) + CartDrawer + CheckoutForm + confirmation polling başlayacak
- 8A sonrası 8C için kitchen display full-screen + audio alert V2 backlog (V1 visual only)
- Online ödeme Sprint 9 sonrası planlanıyor — order flow V1'de ödemesiz, hesap + sadakat V2'de
- V1 demo scenarios (Modern Cafe ile): (1) QR okut → müşteri sipariş verir, (2) admin onaylar, (3) mutfak hazırlar, (4) admin "ready" der, (5) müşteri confirmation page'de "Hazır!" görür (15s polling), (6) admin teslim eder, sipariş kapanır

---

## KARAR D-023 — AI Translation + Description Pattern (Sprint 9A)

**Karar:**
- **İki paralel model:** `TranslationMemory` (org-scoped SHA-256 cache, `(org, src_hash, tgt_locale)` unique) ve `AIProductDescription` (per-menu-item, per-locale, `is_edited` regen guard)
- **Provider stratejisi:** D-021'i birebir devral — OpenAI GPT-4o primary, Anthropic Claude 3.5 Sonnet fallback. SDK lazy-load (`_get_openai()` / `_get_anthropic()`). Strict JSON schema (`response_format={"type": "json_schema"}`)
- **Locale-specific prompts:** `TRANSLATION_PROMPTS[(src, tgt)]` dict — TR→EN restaurant ton, EN→TR food terminology. Şu an 2 çift (TR↔EN). DE/AR V2 backlog
- **Service-layer signatures:**
  - `translate_text(text, source_locale, target_locale, organization) → {translated, provider, model, confidence, cached}` — cache hit → API call yapmaz
  - `describe_product(menu_item, locale, organization, *, force=False) → {description, ...}` — `is_edited=True` kayıt + `force=False` → mevcut text korunur (regen guard)
  - `describe_bulk(menu_items, locale, organization, *, item_ids=None) → {results, total_generated, total_skipped}` — boş description + filter yalnız verilen `item_ids`'i çalıştırır
- **Endpoint'ler (admin, 5 + 1 bonus):**
  - `POST /api/v1/admin/translate/` — tek metin, öni̇zleme + cache test
  - `POST /api/v1/admin/translate/menu-item/{id}/` — bulk translate `target_locales[]`
  - `POST /api/v1/admin/translate/menu-category/{id}/` — kategori başlık + açıklama
  - `POST /api/v1/admin/describe/menu-item/{id}/` — tek item description generation
  - `POST /api/v1/admin/describe/bulk/` — N item, `?item_ids=` filter
  - `GET  /api/v1/admin/translate/stats/` — bonus: cache hit rate + description coverage (9B dashboard banner için)
- **Validation:** text max `AI_TRANSLATION_MAX_CHARS=2000` (default), bos/aynı-locale/unsupported locale → 400. Item kategorisi yoksa 422. Provider fail → 502 `ai.provider_unavailable`
- **Cache strategy:** Write-through — translation API call dönünce `TranslationMemory` kaydı oluşur. SHA-256 hash whitespace normalize edilmiş text üzerinden. Cache tenant-isolated (org FK filter queries'te). Confidence Decimal(4,2)
- **Regen guard:** `describe_product()` `is_edited=True` kayıt görürse + `force=False` → mevcut text'i döner. Admin'in manuel yazdığı açıklama AI tarafından ezilmez. `force=True` explicit regen
- **Audit integration:** 2 yeni action (`ai_translation_generated`, `ai_description_generated`) + 2 yeni target_type (`translation_memory`, `ai_product_description`). Audit event **view katmanında** emit (service değil) — duplicate önlemek için. Multi-locale bulk translate'te N event (target_id=menu_item.id veya category.id)
- **Tenant isolation:** D-022 ile aynı pattern — `IsAuthenticated + IsOrganizationMember`, `_resolve_organization(request)`, cross-tenant 404 (existence leak yok). Cache org-scoped (aynı src text iki org'da iki ayrı hit)
- **Test pattern:** D-021 ile aynı — `_get_openai()` / `_get_anthropic()` monkeypatch'lenir, gerçek API key yok. `apps/translate/tests/conftest.py`'te DRF throttle cache clear autouse fixture (Sprint 3 menu conftest pattern)
- **Side effect:** `apps.translate` INSTALLED_APPS'a eklendi. Audit `ACTION_CHOICES` +2, `TARGET_CHOICES` +2 (migration 0004 AlterField — geriye uyumlu, eski event'ler etkilenmez). Mevcut pdf_import + orders endpoint'lerine dokunulmadı

**Tarih:** 2026-09-28

**Bağlam:** V2 üçüncü sprint. Operatör menü içeriğini AI ile hızlıca çok dilli + SEO-friendly açıklamalı hale getirmesi. Multi-language onboarding (TR + EN aynı anda) için manuel edit döngüsünü (Sprint 4B TranslationTabs) çeviri için 30+ dakikadan 30 saniyeye indirmek. Description generation özellikle 1-2 cümlelik menü kartlarını "italyan mutfağı, ana yemek, hafif acılı, ₹…" gibi zenginleştirip arama motoru görünürlüğünü artırır. D-021 OpenAI primary + Anthropic fallback pattern'ı birebir devralınır — yeni provider abstraksiyonu katmanı (`apps.ai/`) Sprint 10+ SaaS scale için düşünülebilir, V1 inline kalır

**Alternatifler:**
- **Single provider (fallback yok):** Sprint 7 ile aynı trade-off — rate limit / outage'da demo kırılır
- **Translation cache global (per-org değil):** Tenant izolasyonu kırılır — bir müşterinin gizli menü metni başka müşteri tarafından cache hit'le görülebilir
- **`description` field doğrudan DB'de overwrite:** Admin'in manuel yazdığı içerik kaybolabilir. `is_edited` flag + `force` parametre guard'ı
- **Service-layer audit emit (view-layer değil):** Bulk endpoint N event'i tekrar emit eder, double-count hatası. View-layer emit + service return ID — tek emit guarantee
- **DE/AR locale desteği şimdi:** `LOCALE_CHOICES` (menu modelde) sadece TR+EN. DE/AR V2 backlog
- **AIProviderError → 500 (DRF default):** Custom exception + DRF `custom_exception_handler` ile 502 `ai.provider_unavailable`
- **Shared `apps.ai/` provider abstraction:** Sprint 7'de düşünülmemişti, Sprint 9 refactor scope şişerdi. Inline bırakıldı
- **Async background task (Celery):** V1 complexity +52 satır, Sprint 7B PDF import sync pattern yeterli

**Seçim gerekçesi:**
- D-021 pattern birebir reuse: provider know-how'ı korunur, yeni bug surface yok
- Per-org cache: tenant izolasyonu Sprint 8'de kanıtlanmış standart; tipik 25 item × 3 dil işleminde 10-15 hit beklenir (maliyet tasarrufu)
- Regen guard (`is_edited` + `force`): kullanıcı manuel yazarsa AI üzerine yazmaz
- View-layer audit emit: bulk endpoint double-count bug'ı test'te yakalandı, fix hemen uygulandı
- 5 endpoint yeterli: öni̇zle vs uygula + bulk modu için her use case ayrı endpoint
- DE/AR V2 backlog: `(src,tgt)` çifti ekle = tek satır değişiklik
- 2000 char validation: OpenAI 16k context ama fiyat lineer; 500 kelime = tipik ürün açıklamasının 5-10 katı

**Sonuçlar:**
- `backend/apps/translate/` — yeni Django app (models, schemas, services, serializers, views, urls_translate, urls_describe, admin, migrations, tests)
- `backend/apps/translate/models.py` — `TranslationMemory` (SHA-256 hash + cache) + `AIProductDescription` (regen guard). Indexes per (org, locale)
- `backend/apps/translate/schemas.py` — `TRANSLATION_OUTPUT_SCHEMA` + `DESCRIPTION_OUTPUT_SCHEMA` + `TRANSLATION_PROMPTS[(src,tgt)]` + `DESCRIPTION_PROMPTS[locale]` + `AIProviderError`
- `backend/apps/translate/services.py` — `translate_text`, `describe_product`, `describe_bulk`, `_get_openai`, `_get_anthropic`, `_dispatch_*` helper'lar
- `backend/apps/translate/views.py` — 6 endpoint. `_resolve_organization` + audit view-layer emit
- `backend/apps/translate/urls_translate.py` + `urls_describe.py` — separate `urlpatterns` so config include karışmaz
- `backend/apps/translate/migrations/0001_initial.py` — 2 model + 4 index
- `backend/apps/audit/migrations/0004_alter_*` — ACTION_CHOICES +2, TARGET_CHOICES +2 (AlterField, backward-compatible)
- `backend/config/settings/base.py` — `apps.translate` INSTALLED_APPS, `AI_TRANSLATION_MAX_CHARS=2000`, `AI_DESCRIPTION_BULK_MAX_ITEMS=50`
- `backend/config/urls.py` — `path("api/v1/admin/translate/", include("apps.translate.urls_translate"))` + `path("api/v1/admin/describe/", include("apps.translate.urls_describe"))`
- `.env.example` + `.env.production.example` — comment-only env var referansı
- Test: 269 yeşil (229 baseline + 40 yeni). Translate tests: test_translation (10), test_description (8), test_views (12), test_security (8), factories.py + conftest.py
- Test coverage: provider happy-path + Anthropic fallback + cache hit/miss + validation + regen guard (force=False skip, force=True regen) + bulk filter + tenant isolation + audit org-scoped + endpoint integration
- DECISIONS.md (bu karar) + SPRINT_9_PLAN.md'de dokümante
- D-021 + D-022 ile provider + tenant pattern tutarlılığı korunur

**Notlar:**
- 9A sonunda 9B frontend başlayacak: admin menu item edit sayfasında "AI Çevir" + bulk translate modal + description generator — provider 9A API'sini kullanır
- 9B sonunda 9C public SEO: hreflang + OG + JSON-LD menu schema — `MenuItem.translations` 9A ile büyüyecek (her locale için translation memory hit'li), 9C public'te render eder
- V2 ileri: shared `apps.ai/` provider abstraction (multi-provider router), tenant-level AI quota, gerçek zamanlı müşteri tarafı AI çevirisi, image alt-text generation
- Description regen guard UX: buton "İlk kez oluştur / Yeniden üret" 2-state (Sprint 9B)
- V2 backlog: per-org custom glossary (örn. "pide" → "Turkish flatbread with thin crust")

| D-022 | 2026-09-26 | Order + Kitchen Flow Pattern (Order/OrderItem + 6-state FSM + server-side total + audit integration + tenant isolation + 20/min public throttle + snapshot pricing) | aktif |
| D-023 | 2026-09-28 | AI Translation + Description Pattern (TranslationMemory SHA-256 cache + AIProductDescription regen guard + D-021 provider reuse + 5+1 admin endpoint + audit view-layer emit + per-org cache isolation) | aktif |
