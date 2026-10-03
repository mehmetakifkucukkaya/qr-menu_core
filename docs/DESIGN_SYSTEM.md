# DESIGN_SYSTEM — Velouté, modernleştirilmiş ("Soft UI Evolution")

**Kapsam:** `apps/web` (müşteri menüsü, yönetim paneli, giriş/kayıt)
**Dal:** `feat/modern-ui-refresh`
**Kimlik korundu:** zeytin yeşili + krem + terakota, Playfair Display + Plus Jakarta Sans (D-035).
**Değişen:** uygulamanın kalitesi — yumuşak katmanlı yüzeyler, ölçülü cam efekti, Lucide ikonlar,
tek modal bileşeni, mobil-önce yerleşimler ve bozuk token katmanının onarımı.

---

## 1. Neden bu yön?

`ANALYSIS_2_UI_UX` raporunun teşhisi: *"Tasarım niyeti güçlü, çalışan deneyim zayıf."* Sitenin "eski" görünmesinin
nedenleri estetikten çok uygulama hatalarıydı:

| Sorun | Kök neden |
|---|---|
| Koyu 1 px çizgiler, şeffaf yüzeyler | `border-[var(--color-border)]` **geçersiz CSS** (token'lar çıplak RGB üçlüsü) |
| Silinmiş metin hiyerarşisi | `text-on-surface-variant`, `text-outline`, `bg-surface-low` Tailwind'de tanımsızdı |
| Hata mesajı "başarı" gibi okunuyordu | hata/silme durumları zeytin `accent` rengini kullanıyordu (145 yer) |
| İlk ekranda ürün yok, 13 px yatay taşma | dev hero, 3 tam genişlik buton, negatif marjinli kategori çubuğu |
| Telefonda yönetim paneli kullanılamıyor | kenar çubuğu `md` altında gizli, menü düğmesi yok |
| Kırık görselde alt metin / "broken image" | SSR'lı `<img>`'in `onError`'u hidrasyondan önce kaçıyordu |

`ui-ux-pro-max` önerisi (restoran/kafe + otel): **Soft UI Evolution + Minimalism**, sıcak/organik palet
("Nature Distilled"), yalnızca yüzen katmanlarda cam, 150–300 ms hareket, SVG ikon.
(Aracın otomatik `--design-system` çıktısı "Enterprise Gateway / Vibrant & Block" önerdi; bu ürüne uymadığı için
hedefli `style`/`product`/`typography` aramalarıyla değiştirildi.)

---

## 2. Token'lar (`src/styles/tokens.css`)

Renkler **çıplak RGB üçlüsü** olarak tutulur (`--color-x: 42 68 54`). Tailwind bunları
`rgb(var(--color-x) / <alpha>)` ile kullanır → `bg-surface-low`, `border-border`, `bg-background/80` çalışır.

| Token | Açık tema | Kullanım | Kontrast |
|---|---|---|---|
| `primary` | `#2A4436` | CTA, fiyat, aktif durum | 10.0:1 (arka planda) |
| `secondary` | `#A9532F` | sıcak vurgu, rozet | **5.0:1** (eskisi `#B25E3B` 4.35:1 → AA'yı geçmiyordu) |
| `accent` | `#3E5641` | **yalnızca** marka dekoru / ikincil buton | — |
| `background` / `surface` / `surface-low` / `surface-high` | `#FAF8F5` / `#FFF` / `#F5F1EB` / `#EDE8E0` | sayfa / kart / çip, girinti / basılı-hover | — |
| `text` / `muted` / `outline` | `#1A1E21` / `#4A5459` / `#5F6965` | gövde / ikincil / üçüncül metin | 15.8 / 7.3 / **5.4:1** |
| `border` / `border-strong` | `#E6E1DA` / `#D9D2C7` | **dekoratif** çizgi (1.2:1) | — |
| `input` | `#857F74` | **form kontrolü kenarlığı** | **3.75:1** (WCAG 1.4.11 ≥ 3:1) |
| `danger` / `success` / `warning` (+ `-soft`) | `#B42318` / `#166534` / `#92400E` | gerçek durumlar | ≥ 6:1 |
| `primary-soft` / `secondary-soft` | `#E8F0EB` / `#F9ECE4` | seçili / vurgulu dolgu | — |

Koyu tema (`[data-theme="dark"]`) aynı isimlerle tanımlı; `ThemeToggle` henüz hiçbir yerde bağlı değil.

- **Yarıçap:** `sm 8 · md 12 · lg 16 (varsayılan) · xl 20 · 2xl 24 · 3xl 32 · pill`. Sheet'ler `rounded-t-[1.75rem]`.
- **Gölge:** `xs → xl` katmanlı, orman-tonlu; `shadow-card` = `sm`, `shadow-floating` = `lg`, `shadow-ring` = 1 px çizgi.
- **Cam:** `.glass` / `.glass-strong` — **yalnızca** yüzen katmanlarda (üst bar, kategori çipleri, alt dock). Arka plan ≥ %80 opak.
- **z-index:** `raised 10 · nav 20 · header 30 · dock 40 · toast 60 · skip 100`. Native `<dialog>` top-layer'dadır, z-index gerekmez.
- **Hareket:** 150–300 ms, yalnızca `transform`/`opacity`; `prefers-reduced-motion` global olarak kapatır.
- **Ölçüler:** `--header-h` (56 px) ve `--nav-h` (56 px) sticky katmanların ortak kaynağı; `html { scroll-padding-top }` bunlardan türer.

---

## 3. Kurallar

1. **Asla** `border-[var(--color-x)]` yazma. ESLint kuralı (`no-restricted-syntax`) bunu hata verir. `border-border`,
   `bg-surface-low`, `text-outline` kullan.
2. **Anlama göre renk:** hata/silme/iptal → `danger`; başarı/yeni → `success`; uyarı/alerjen → `warning`.
   `accent` bunlar için **kullanılmaz** (olumlu görünür). Anlam yalnızca renkle verilmez: ikon + metin.
3. **Varyantı `className` ile ezme.** İki rakip `text-*`/`bg-*`/`h-*` sınıfı, yazılış sırasına değil stylesheet
   sırasına göre çözülür. Yeni bir varyant/boyut ekle (`Button` → `inverse`, `Badge` → `size`, `Input` → `density`).
4. **Form kenarlığı `border-input`** (3:1). `border-border` dekoratiftir; kontrolü tek başına çevrelemez.
5. **Input metni 16 px** (`text-base`, admin'de `sm:text-sm`); aksi hâlde iOS odakta sayfayı yakınlaştırır.
6. **Dokunma hedefi ≥ 44 px** (`h-11`). `sm` boyut yalnızca yoğun masaüstü araç çubukları içindir.
7. **Emoji değil Lucide** (`lucide-react`). Görsel/logo `<img>` yerine `SmartImage`/`BusinessMark`.
8. **Modal = `Sheet`.** Elle `fixed inset-0` + `Escape` mantığı yazma.
9. **Tablo telefonda kart olsun:** `<table class="table-stack">` + hücrelerde `data-label` (bkz. `globals.css`).

---

## 4. Bileşenler

**`src/components/ui/`**

| Bileşen | Not |
|---|---|
| `Button` + `buttonStyles()` | varyantlar `primary secondary soft outline ghost danger inverse`; bağlantı için `buttonStyles()` |
| `Badge` | tonlar `neutral primary warm success warning danger solid`; `size sm|md` |
| `Input` / `Textarea` + `inputStyles` | `density comfortable|compact`; `aria-invalid` → kırmızı |
| `Sheet` | native `<dialog>`; `variant sheet|drawer|left`; telefonda tutamaç + aşağı sürükleyerek kapatma |
| `SmartImage` | yüklenmeyen/eksik görselde alt metin göstermez; SSR'da kaçan `onError`'u `img.complete` ile yakalar |
| `Card`, `IconButton`, `Container` | mevcut; yeni token'larla uyumlu |

**Müşteri menüsü (`components/public/`)** — `MenuHeader` (üstte saydam, kaydırınca cam + marka), `PremiumHero`
(kapak + logo + iletişim karoları, kiracı verisi), `ContactActions` (hero karoları ve dock simgeleri tek kaynak),
`CategoryNav` + `useCategorySpy` (çipler ve masaüstü rayı aynı kaynaktan), `ItemCard` (yatay; fotoğrafı olmayan
üründe fotoğraf yuvası **açılmaz**), `BottomDock` (iletişim + sepet tek bar), `ItemDetailDrawer` / `CartDrawer` /
`CheckoutForm` (hepsi `Sheet`).

**Yönetim paneli (`app/(admin)/_components/`)** — `AdminNav` (gruplanmış tek IA: Operasyon / Katalog / Büyüme /
Hesap), `AdminSidebar` (masaüstü, sticky), `AdminHeader` (telefonda menü düğmesi → `Sheet variant="left"`,
Türkçe ve ID'siz breadcrumb), `FormField`, `ConfirmDialog` (artık `Sheet`; satır başına benzersiz id), boş/hata durumları.

---

## 5. Bilinçli kararlar

- **Fotoğrafsız ürün = fotoğraf yuvasız kart.** Demo menünün 25 üründen 24'ünün görseli yok; emoji-gradient yer
  tutucu yerine basılı menü gibi tipografik satır gösterilir. Yüklenemeyen fotoğraf yuvasını korur (düzen zıplamaz).
  `lib/placeholder.ts` silinmedi ama artık kullanılmıyor.
- **Hero'da kiracı teması:** yalnızca kiracının *gerçekten seçtiği* renkler uygulanır (eskiden eksik alanlar
  orman yeşiline düşüp arka plan/metni de yeşile boyuyordu) ve `primary-foreground` kontrasta göre türetilir.
  Tema hâlâ yalnızca hero kapsayıcısına uygulanır (sayfa köküne taşımak ayrı bir iş).
- **Hero WhatsApp karosu artık ölü `#contact` bağlantısı değil:** kiracının gerçek numarasına gider (F-14).
- **Alerjen adları** kartta artık Türkçe (`dairy` → "Süt Ürünleri"); `locale_used` tipi gerçek değerlerine
  (`requested | default | model`) düzeltildi — eski kod hep "TR" gösteriyordu.
- **Sepete ekleme çekmeceyi açar** (cart-store davranışı değiştirilmedi). Alt dock toplamı zaten gösterdiği için
  telefonda her eklemede çekmece açılması gereksiz; istenirse `cart-store.add` içindeki `isOpen: true` kaldırılabilir
  (e2e akışı bunu zaten destekliyor).

---

## 6. Geliştirici notları

- **`tailwind.config.ts` değişince dev sunucuyu yeniden başlat.** `next dev` yapılandırma değişikliğini canlı
  almıyor; yeni sınıflar (`bg-surface-low`, `z-header`, `animate-pop` …) eksik kalır. Docker dev konteyneri için de geçerli.
- Doğrulama: `npx tsc --noEmit`, `npx next lint`, birim testleri (`npm run test:*`), `npm run test:e2e`
  (yeni: akış 1b — yatay taşma yok, akış 7 — telefonda admin gezinmesi).
- Telefonda `<dialog>` + `:has()` gerekir (Safari 15.4+, Chrome 105+, Firefox 121+); `Sheet` daha eski tarayıcıda
  modal olmayan `open` özniteliğine düşer.

## 7. Kapsam dışı / sonraki adımlar

`next/font` (self-host) ve `next/image`; kiracı temasını sayfa köküne taşıma + kayıtta kontrast doğrulaması;
koyu tema anahtarı; kalan ≤ 11 px metinler (≈110 yer) ve 140 `uppercase` kullanımı; admin form sayfalarında
`Button`'a tam geçiş (şu an yalnızca kontrol stilleri ve semantik renkler token'a taşındı); admin için sayfa
başlığı bileşeni (`PageHeader`).
