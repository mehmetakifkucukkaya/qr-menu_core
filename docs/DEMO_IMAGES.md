# DEMO_IMAGES — Modern Cafe Demo Görseller Envanteri

**Tarih:** 2026-09-26
**Karar:** D-006 — Logo + kapak AI ile, kategori/ürün için stock placeholder stratejisi
**Sprint:** Sprint 6'da (seed komutunda) referans alınacak; envanteri şimdiden hazır

## Genel Strateji

| Öğe | Strateji | Görsel sayısı |
|---|---|---|
| Logo | AI (image generation) | 1 |
| Kapak | AI (image generation) | 1 |
| Kategori görselleri | Hibrit: Unsplash photo URL + gradient/emoji fallback | 5 |
| Ürün görselleri | Hibrit: Unsplash photo URL + gradient/emoji fallback | 25 |
| **Toplam** |  | **32** |

**Fallback zinciri (frontend'de):**
```
1. apps/web/public/demo-assets/{slug}.webp   (local optimized)
2. https://images.unsplash.com/photo-{id}...  (stock CDN)
3. /api/v1/placeholder?label=...&color=...   (server-generated SVG placeholder)
```

Bu zincir sayesinde görsel yüklenemezse bile demo bozulmaz.

## Modern Cafe Marka Kimliği

- **İsim:** Modern Cafe
- **Slug:** `modern-cafe`
- **Konsept:** Modern kahveci, minimalist, sıcak atmosfer, İstanbul
- **Renk paleti:**
  - Primary: `#8B5A3C` (sıcak kahve)
  - Secondary: `#D4A574` (krem kahve)
  - Accent: `#E07856` (terracotta)
  - Background: `#F5EFE6` (krem)
  - Text: `#2C1810` (koyu kahve)
- **Font önerisi:** Playfair Display (heading) + Inter (body)

## 1. Logo — AI Image Generation

**Amaç:** Modern, minimalist, "M" harfi veya kahve fincanı motifi, sıcak tonlu.

**AI prompt önerisi (image generation tool'a verilecek):**
```
Minimalist modern coffee shop logo, single letter "M" intertwined with a stylized coffee cup steam swirl,
warm earth tones (cream + coffee brown + terracotta accent),
flat design, vector-friendly, white background, no text other than letter,
suitable for app icon and favicon
```

**Varyasyonlar (2-3 üret, en iyisini seç):**
- Varyant A: "M" + steam swirl
- Varyant B: Kadeh + buhar
- Varyant C: Minimalist fincan + çekirdek

**Çıktı:**
- Dosya: `apps/web/public/demo-assets/modern-cafe-logo.webp`
- Boyut: 512x512 (vector source ayrıca SVG olarak)
- Format: WebP (optimize) + PNG fallback

## 2. Kapak Görseli — AI Image Generation

**Amaç:** Kafe iç mekanı veya kahve close-up, sıcak atmosfer, marka hissi.

**AI prompt önerisi:**
```
Modern specialty coffee shop interior, warm natural lighting, wooden counter with brass details,
exposed brick wall, soft focus latte art on cup in foreground,
photographed in morning golden hour, shallow depth of field,
editorial food photography style, neutral warm tones,
no text, no logos, no people in close-up
```

**Çıktı:**
- Dosya: `apps/web/public/demo-assets/modern-cafe-cover.webp`
- Boyut: 1200x600 (cover banner oranı)
- Format: WebP

## 3. Kategori Görselleri (5)

**Strateji:** Unsplash'ta bilinen coffee shop / food photo ID'leri + gradient fallback.

| # | Kategori | Slug | Unsplash konusu | Gradient fallback |
|---|---|---|---|---|
| 1 | Kahveler | `coffees` | espresso/latte/cappuccino | `#8B5A3C` → `#D4A574` |
| 2 | Soğuk İçecekler | `cold-drinks` | iced coffee/cold brew/smoothie | `#5B8DB8` → `#A3C9E2` |
| 3 | Tatlılar | `desserts` | tiramisu/cheesecake/brownie | `#A0522D` → `#E8C8A8` |
| 4 | Kahvaltı | `breakfast` | breakfast spread/eggs/pancakes | `#E8A04F` → `#F4D29C` |
| 5 | Sandviçler | `sandwiches` | sandwich/panini/club | `#7C9473` → `#C4D4B8` |

**Çıktı:** `apps/web/public/demo-assets/category-{slug}.webp` (800x600)

## 4. Ürün Görselleri (25)

**Strateji:** Her ürün için Unsplash'ta bilinen food photo URL + emoji/initial fallback.

### Kahveler (5)

| # | Ürün | Slug | Emoji | Unsplash konusu |
|---|---|---|---|---|
| 1 | Türk Kahvesi | `turk-kahvesi` | ☕ | cezve/turkish coffee |
| 2 | Espresso | `espresso` | ☕ | espresso shot |
| 3 | Latte | `latte` | ☕ | latte art |
| 4 | Cappuccino | `cappuccino` | ☕ | cappuccino foam |
| 5 | Americano | `americano` | ☕ | black coffee cup |

### Soğuk İçecekler (5)

| # | Ürün | Slug | Emoji | Unsplash konusu |
|---|---|---|---|---|
| 6 | Iced Latte | `iced-latte` | 🧊 | iced coffee glass |
| 7 | Cold Brew | `cold-brew` | 🧊 | cold brew bottle |
| 8 | Frappé | `frappe` | 🧊 | frappe blended |
| 9 | Lemonade | `lemonade` | 🍋 | lemonade glass |
| 10 | Berry Smoothie | `berry-smoothie` | 🍓 | berry smoothie bowl |

### Tatlılar (5)

| # | Ürün | Slug | Emoji | Unsplash konusu |
|---|---|---|---|---|
| 11 | Tiramisu | `tiramisu` | 🍰 | tiramisu slice |
| 12 | Cheesecake | `cheesecake` | 🍰 | classic cheesecake |
| 13 | Brownie | `brownie` | 🍫 | chocolate brownie |
| 14 | San Sebastian Cheesecake | `san-sebastian` | 🍰 | burnt cheesecake |
| 15 | Macaron (4'lü) | `macaron` | 🧁 | macarons colorful |

### Kahvaltı (5)

| # | Ürün | Slug | Emoji | Unsplash konusu |
|---|---|---|---|---|
| 16 | Serpme Kahvaltı | `serpme-kahvalti` | 🍳 | turkish breakfast spread |
| 17 | Menemen | `menemen` | 🍳 | menemen turkish eggs |
| 18 | Avokado Tost | `avokado-tost` | 🥑 | avocado toast |
| 19 | Pankek | `pankek` | 🥞 | pancakes stack |
| 20 | Granola Bowl | `granola-bowl` | 🥣 | granola yogurt bowl |

### Sandviçler (5)

| # | Ürün | Slug | Emoji | Unsplash konusu |
|---|---|---|---|---|
| 21 | Club Sandwich | `club-sandwich` | 🥪 | club sandwich |
| 22 | Tuna Sandwich | `tuna-sandwich` | 🥪 | tuna sandwich |
| 23 | Veggie Sandwich | `veggie-sandwich` | 🥪 | vegetable sandwich |
| 24 | Chicken Panini | `chicken-panini` | 🥪 | panini pressed |
| 25 | BLT | `blt` | 🥪 | BLT sandwich |

**Çıktı formatı:** `apps/web/public/demo-assets/product-{slug}.webp` (600x600)

## 5. AI Image Generation Tool

Logo ve kapak için kullanılacak tool: **mcode-tools multimodal generation** (Mavis runtime üzerinden).

**Komut şablonu:**
```bash
mcode-tools connector call <image-gen-tool> \
  --args '{"prompt": "<AI prompt yukarıdan>", "size": "<W>x<H>", "count": 3}'
```

**Tool keşfi:** `mcode-tools connector tools --keyword image` ile mevcut image generation tool'ları listelenir.

**Çıktı işleme:**
1. Üretilen görseli indir
2. Pillow veya sharp ile 512x512 / 1200x600 resize
3. WebP formatına çevir (quality 80)
4. `apps/web/public/demo-assets/` altına kaydet
5. Frontend'de fallback zinciri ile kullan

## 6. Fallback Stratejisi (Görsel Yüklenemezse)

`/api/v1/placeholder` endpoint'i (Sprint 3 veya Sprint 6'da):
- Query params: `?label={name}&color={hex}`
- SVG placeholder üret (gradient + label + emoji)
- Cache: 1 yıl
- Demo her koşulda çalışır

## 7. Doğrulama Checklist (Sprint 6 sonunda)

- [ ] Logo AI ile üretildi, optimize edildi, modern-cafe-logo.webp mevcut
- [ ] Kapak AI ile üretildi, optimize edildi, modern-cafe-cover.webp mevcut
- [ ] 5 kategori görseli (Unsplash + local cache) mevcut
- [ ] 25 ürün görseli (Unsplash + local cache) mevcut
- [ ] Frontend'de fallback zinciri çalışıyor (konsol'da 404 kontrolü)
- [ ] seed_demo komutu görselleri düzgün yüklüyor
- [ ] Demo telefonda tüm görseller 2 sn içinde render oluyor
- [ ] Lighthouse accessibility score > 90 (alt text'ler dolu)

## 8. Bilinen TODO'lar

- AI image generation tool'un host-managed auth durumu kontrol edilecek
- Unsplash photo ID'leri netleşecek (şu an konu bazlı; Sprint 5'te seçilecek)
- Brand guidelines (logo usage, color usage) hazırlanacak (Sprint 6)
- Türkçe/İngilizce alt text stratejisi (translation ile senkron)

---

**Not:** Bu envanter Sprint 1 paralelinde hazırlandı. Worker `bg_bf3c5343-60b7-4006-a1b7-35391c3c2a22` Sprint 1'i uygularken AI image generation tool'u ve Unsplash photo ID'leri için ayrı bir envanter çıkarılacak (Sprint 5 veya Sprint 6 öncesi).