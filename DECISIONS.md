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

### OP-8 — Working Hours JSON Şeması (Sprint 2)
`Branch.working_hours_json` alanının yapısı. Olası şema:
```json
{
  "mon": [{"open": "08:00", "close": "22:00"}],
  "tue": [{"open": "08:00", "close": "22:00"}],
  ...
}
```
P2 özellik ama veri şeması erkenden gerekiyor; Sprint 2 model tanımında netleşecek.

### OP-9 — Sentry / Monitoring (Sprint 6)
Sentry self-hosted vs SaaS, uptime monitoring tool'u (Better Stack / UptimeRobot / Healthchecks.io).

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