# FRONTEND_PLACEHOLDERS — Görsel Fallback Stratejisi

**Tarih:** 2026-09-26
**Sprint:** Sprint 3 (referans) + Sprint 6 (final demo polish)
**Amaç:** Logo/kapak/kategori/ürün görselleri yüklenemediğinde bile demo'nun bozulmaması

## Strateji

4 katmanlı fallback zinciri (frontend'de sırayla denenir):

```
1. item.image (DB'den, admin panelde yüklenmiş gerçek görsel)
   ↓ (yoksa veya kırık URL)
2. /demo-assets/{slug}.webp (lokalde cache'lenmiş optimize görsel)
   ↓ (yoksa)
3. https://images.unsplash.com/photo-{id}... (stock CDN — DEMO_IMAGES.md'deki ID)
   ↓ (yoksa veya hata)
4. data:image/svg+xml;base64,... (anlık üretilen SVG placeholder — gradient + emoji + initial)
```

Bu zincir sayesinde:
- Görsel varsa → en iyi kalite
- Görsel yoksa → tutarlı placeholder (her zaman aynı emoji/renk)
- Network hatası → hâlâ placeholder görünür
- Mobilde yavaş internet → ilk render'da placeholder, sonra gerçek görsel

## Katman 4: SVG Placeholder Detay

### Yapısı

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="{color1}" />
      <stop offset="100%" stop-color="{color2}" />
    </linearGradient>
  </defs>
  <rect width="400" height="400" fill="url(#g)" />
  <text x="50%" y="50%" font-size="180" text-anchor="middle" dominant-baseline="central">{emoji}</text>
</svg>
```

### Kategori Bazlı Gradient Renkleri (Modern Cafe)

| Kategori | Slug | Emoji | Renk 1 | Renk 2 |
|---|---|---|---|---|
| Kahveler | `kahveler` | ☕ | `#8B5A3C` | `#D4A574` |
| Soğuk İçecekler | `soguk-icecekler` | 🧊 | `#5B8DB8` | `#A3C9E2` |
| Tatlılar | `tatlilar` | 🍰 | `#A0522D` | `#E8C8A8` |
| Kahvaltı | `kahvalti` | 🍳 | `#E8A04F` | `#F4D29C` |
| Sandviçler | `sandvicler` | 🥪 | `#7C9473` | `#C4D4B8` |

### Ürün Bazlı Emoji (DEMO_IMAGES.md'den)

| Ürün | Emoji | Kategori |
|---|---|---|
| Türk Kahvesi | ☕ | Kahveler |
| Espresso | ☕ | Kahveler |
| Latte | ☕ | Kahveler |
| Cappuccino | ☕ | Kahveler |
| Americano | ☕ | Kahveler |
| Iced Latte | 🧊 | Soğuk İçecekler |
| Cold Brew | 🧊 | Soğuk İçecekler |
| Frappé | 🧊 | Soğuk İçecekler |
| Limonata | 🍋 | Soğuk İçecekler |
| Berry Smoothie | 🍓 | Soğuk İçecekler |
| Tiramisu | 🍰 | Tatlılar |
| Cheesecake | 🍰 | Tatlılar |
| Brownie | 🍫 | Tatlılar |
| San Sebastian | 🍰 | Tatlılar |
| Macaron | 🧁 | Tatlılar |
| Serpme Kahvaltı | 🍳 | Kahvaltı |
| Menemen | 🍳 | Kahvaltı |
| Avokado Tost | 🥑 | Kahvaltı |
| Pankek | 🥞 | Kahvaltı |
| Granola Bowl | 🥣 | Kahvaltı |
| Club Sandwich | 🥪 | Sandviçler |
| Tuna Sandwich | 🥪 | Sandviçler |
| Veggie Sandwich | 🥪 | Sandviçler |
| Chicken Panini | 🥪 | Sandviçler |
| BLT | 🥪 | Sandviçler |

## Implementation (`apps/web/src/lib/placeholder.ts`)

```typescript
// ============================================================
// apps/web/src/lib/placeholder.ts
// ============================================================

export interface PlaceholderOptions {
  emoji: string;
  color1: string;
  color2?: string;
  size?: number;
  label?: string; // accessibility için (örn. ürün adı)
}

const CATEGORY_DEFAULTS: Record<string, { emoji: string; color1: string; color2: string }> = {
  kahveler:        { emoji: '☕', color1: '#8B5A3C', color2: '#D4A574' },
  'soguk-icecekler': { emoji: '🧊', color1: '#5B8DB8', color2: '#A3C9E2' },
  tatlilar:        { emoji: '🍰', color1: '#A0522D', color2: '#E8C8A8' },
  kahvalti:        { emoji: '🍳', color1: '#E8A04F', color2: '#F4D29C' },
  sandvicler:      { emoji: '🥪', color1: '#7C9473', color2: '#C4D4B8' },
};

export function getCategoryPlaceholder(categorySlug: string, size = 400): string {
  const def = CATEGORY_DEFAULTS[categorySlug] || CATEGORY_DEFAULTS.kahveler;
  return generatePlaceholderSvg({
    emoji: def.emoji,
    color1: def.color1,
    color2: def.color2,
    size,
  });
}

export function getItemPlaceholder(item: {
  image?: string | null;
  category_slug?: string;
  slug: string;
}, size = 600): string {
  // Katman 1: item.image varsa onu kullan
  if (item.image) return item.image;
  // Katman 4: SVG placeholder
  const categoryDef = CATEGORY_DEFAULTS[item.category_slug || 'kahveler'] || CATEGORY_DEFAULTS.kahveler;
  return generatePlaceholderSvg({
    emoji: categoryDef.emoji,
    color1: categoryDef.color1,
    color2: categoryDef.color2,
    size,
  });
}

export function generatePlaceholderSvg(opts: PlaceholderOptions): string {
  const { emoji, color1, color2 = color1, size = 400, label = '' } = opts;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="${escapeXml(label || emoji)}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#g)" />
    <text x="50%" y="50%" font-size="${size * 0.45}" text-anchor="middle" dominant-baseline="central">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c] || c));
}
```

## Component Entegrasyonu

### `<ItemCard>` kullanımı:

```tsx
// apps/web/src/components/public/ItemCard.tsx
import { getItemPlaceholder } from '@/lib/placeholder';

export function ItemCard({ item }: { item: PublicMenuItem }) {
  const [src, setSrc] = useState(item.image || getItemPlaceholder({ slug: item.slug, category_slug: item.category_slug }));
  const [errored, setErrored] = useState(false);

  const handleError = () => {
    if (errored) return;
    setErrored(true);
    setSrc(getItemPlaceholder({ slug: item.slug, category_slug: item.category_slug }));
  };

  return (
    <article className="...">
      <img
        src={src}
        alt={item.name}
        onError={handleError}
        loading="lazy"
        className="..."
      />
      <h3>{item.name}</h3>
      <p>{formatPrice(item.price, item.currency)}</p>
    </article>
  );
}
```

### `<BusinessHero>` kullanımı:

```tsx
export function BusinessHero({ business }: { business: PublicMenuBusiness }) {
  const cover = business.cover_image || generatePlaceholderSvg({
    emoji: '☕',
    color1: '#8B5A3C',
    color2: '#D4A574',
    size: 1200,
    label: business.name,
  });
  const logo = business.logo || generatePlaceholderSvg({
    emoji: 'M',
    color1: '#D4A574',
    color2: '#8B5A3C',
    size: 200,
    label: `${business.name} logo`,
  });

  return (
    <header className="relative">
      <img src={cover} alt={`${business.name} kapak`} className="w-full h-48 object-cover" />
      <img src={logo} alt={`${business.name} logo`} className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-24 h-24 rounded-full ring-4 ring-white" />
      <h1 className="text-center mt-14 text-2xl font-bold">{business.name}</h1>
    </header>
  );
}
```

## Lokal Cache Yapısı

Görsel optimize edilip lokalde tutulmak istenirse:

```
apps/web/public/demo-assets/
├── modern-cafe-logo.webp         (512x512, AI generated)
├── modern-cafe-cover.webp        (1200x600, AI generated)
├── category-kahveler.webp        (800x600)
├── category-soguk-icecekler.webp
├── category-tatlilar.webp
├── category-kahvalti.webp
├── category-sandvicler.webp
├── product-turk-kahvesi.webp     (600x600)
├── product-espresso.webp
├── ...
└── product-blt.webp
```

Next.js `<Image>` component `public/` altındaki dosyaları otomatik serve eder.

## Next.js `<Image>` Component

```tsx
import Image from 'next/image';

<Image
  src={item.image || getItemPlaceholder({ slug: item.slug, category_slug: item.category_slug })}
  alt={item.name}
  width={600}
  height={600}
  className="object-cover"
  placeholder="blur"
  blurDataURL={getItemPlaceholder({ slug: item.slug, category_slug: item.category_slug })}
  onError={(e) => { e.currentTarget.src = getItemPlaceholder({ ... }); }}
/>
```

`placeholder="blur"` ile görsel yüklenene kadar blur placeholder gösterilir (daha iyi UX).

## Test Notları

- [ ] Her ürün için placeholder emoji + renk doğru görünüyor
- [ ] Logo placeholder (M harfi veya kahve) görünüyor
- [ ] Cover placeholder (gradient) görünüyor
- [ ] Network hatasında fallback çalışıyor (Chrome DevTools → offline)
- [ ] Lazy load: viewport dışındaki görseller yüklenmiyor (Performance tab)
- [ ] Accessibility: alt text'ler dolu, role="img" doğru
- [ ] Lighthouse mobile performance > 80 (placeholder boyutu küçük olduğu için hızlı)

## Sprint 6 Demo İçin Final Yapılacaklar

1. Logo + kapak AI ile üret (`apps/web/public/demo-assets/`)
2. Kategori görselleri Unsplash'tan cache'le (DEMO_IMAGES.md'deki ID'ler ile)
3. Ürün görselleri için: ya Unsplash ID ya da SVG placeholder
4. Modern Cafe seed komutu (Sprint 6'da) görselleri DB'ye image URL olarak kaydeder
5. Frontend placeholder fallback zinciri demo'yu her koşulda çalışır tutar

## Bilinen TODO'lar

- AI image generation tool'un host-managed auth durumu kontrol edilecek (mcode-tools multimodal)
- Unsplash photo ID'leri Sprint 5/6'da netleşecek
- Türkçe/İngilizce alt text stratejisi (translation ile senkron — örn. alt="Türk Kahvesi" / "Turkish Coffee")
- Brand guidelines (logo usage, color usage) hazırlanacak (Sprint 6)
- WebP dönüşüm pipeline (sharp veya Next.js Image optimization) — V1'de atlanabilir, V2'de

---

**Not:** Bu strateji Sprint 3 worker'ın `lib/placeholder.ts` implementasyonu için referans. Sprint 6'da demo polish'te final görseller eklenir; zincirin 4. katmanı (SVG placeholder) her koşulda fallback olarak kalır.