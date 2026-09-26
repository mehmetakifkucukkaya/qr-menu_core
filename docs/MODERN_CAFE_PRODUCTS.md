# Modern Cafe — Ürün Envanteri

**Tarih:** 2026-09-26
**Sprint:** Sprint 6'da seed_demo için kullanılacak
**Toplam:** 5 kategori + 25 ürün + TR/EN çevirileri

> Bu envanter `seed_demo` management command'in kaynağıdır. Sprint 6'da her ürün `MenuItem` + `MenuItemTranslation` (TR + EN) olarak import edilir. Fiyatlar TRY, 2026 İstanbul modern kafe seviyesi.

## Genel Bilgiler

| Konu | Değer |
|---|---|
| İşletme | Modern Cafe |
| Slug | `modern-cafe` |
| Default locale | `tr` |
| Supported locales | `['tr', 'en']` |
| Currency | `TRY` |
| Fiyat aralığı | 60 — 650 TRY |
| Marka dili | Sıcak, modern, "üçüncü mekan" hissi, davetkar |
| Allergen kodları | `gluten`, `dairy`, `nuts`, `eggs`, `soy`, `fish`, `shellfish`, `sesame` |
| Tag kodları | `vegan`, `vegetarian`, `spicy`, `popular`, `new`, `gluten_free` |

---

## Kategori 1 — Kahveler

**Slug:** `kahveler`  
**Sort order:** 1  
**TR:** "Kahveler"  
**EN:** "Coffees"  
**TR description:** "Modern kavurma teknikleriyle hazırlanan özel kahve çekirdeklerinden elde edilen, geleneksel ve modern yöntemlerin harmanlandığı bir koleksiyon."  
**EN description:** "A collection where traditional and modern brewing methods blend with carefully selected coffee beans."

### 1.1 Türk Kahvesi

- **Slug:** `turk-kahvesi`
- **Emoji:** ☕
- **Sort order:** 1
- **Fiyat:** 75.00 TRY
- **Allergens:** _(yok)_
- **Tags:** `popular`
- **TR name:** Türk Kahvesi
- **TR description:** "Geleneksel cezvede yavaşça pişirilmiş, ince veya orta çekilmiş kahve. Sade, orta şekerli veya şekerli olarak servis edilir. Yanında lokum ve su ikramımızdır."
- **EN name:** Turkish Coffee
- **EN description:** "Traditional slow-brewed Turkish coffee, finely or medium ground. Served plain, medium sweet or sweet, with complimentary Turkish delight and water."

### 1.2 Espresso

- **Slug:** `espresso`
- **Emoji:** ☕
- **Sort order:** 2
- **Fiyat:** 60.00 TRY
- **Allergens:** _(yok)_
- **Tags:** `popular`
- **TR name:** Espresso
- **TR description:** "Tek shot, yoğun ve karakteristik kremasıyla klasik İtalyan stili espresso. Hızlı bir enerji molası için ideal."
- **EN name:** Espresso
- **EN description:** "Single shot with rich, distinctive crema in classic Italian style. Perfect for a quick energy break."

### 1.3 Latte

- **Slug:** `latte`
- **Emoji:** ☕
- **Sort order:** 3
- **Fiyat:** 95.00 TRY
- **Allergens:** `dairy`
- **Tags:** `popular`
- **TR name:** Latte
- **TR description:** "Buğdaylanmış süt ile yumuşatılmış, yumuşak içimli espresso. Üzerinde ince bir latte art desenimiz."
- **EN name:** Latte
- **EN description:** "Espresso softened with steamed milk for a smooth sip, finished with delicate latte art."

### 1.4 Cappuccino

- **Slug:** `cappuccino`
- **Emoji:** ☕
- **Sort order:** 4
- **Fiyat:** 95.00 TRY
- **Allergens:** `dairy`
- **Tags:** `popular`
- **TR name:** Cappuccino
- **TR description:** "Eşit oranda espresso, buğdaylanmış süt ve süt köpüğünden oluşan klasik İtalyan stili. Üzerine hafif kakao serpiştirilir."
- **EN name:** Cappuccino
- **EN description:** "Equal parts espresso, steamed milk and milk foam in classic Italian style, dusted with cocoa."

### 1.5 Americano

- **Slug:** `americano`
- **Emoji:** ☕
- **Sort order:** 5
- **Fiyat:** 80.00 TRY
- **Allergens:** _(yok)_
- **Tags:** _(yok)_
- **TR name:** Americano
- **TR description:** "Espresso üzerine sıcak su eklenerek hazırlanan, yumuşak içimli Amerikan stili kahve."
- **EN name:** Americano
- **EN description:** "Espresso topped with hot water for a smooth, American-style cup."

---

## Kategori 2 — Soğuk İçecekler

**Slug:** `soguk-icecekler`  
**Sort order:** 2  
**TR:** "Soğuk İçecekler"  
**EN:** "Cold Drinks"  
**TR description:** "Yaz günlerine özel, buz gibi soğuk ve ferahlatıcı içecekler koleksiyonu."  
**EN description:** "An ice-cold, refreshing drink collection crafted for warm afternoons."

### 2.1 Iced Latte

- **Slug:** `iced-latte`
- **Emoji:** 🧊
- **Sort order:** 6
- **Fiyat:** 110.00 TRY
- **Allergens:** `dairy`
- **Tags:** `popular`
- **TR name:** Iced Latte
- **TR description:** "Soğuk süt ve buz üzerine dökülen espresso, hafif tatlı. Yaz klasiği."
- **EN name:** Iced Latte
- **EN description:** "Espresso poured over cold milk and ice, lightly sweetened. A summer classic."

### 2.2 Cold Brew

- **Slug:** `cold-brew`
- **Emoji:** 🧊
- **Sort order:** 7
- **Fiyat:** 120.00 TRY
- **Allergens:** _(yok)_
- **Tags:** `new`
- **TR name:** Cold Brew
- **TR description:** "Soğuk suda 16 saat demlenen, düşük asiditeli ve yumuşak içimli kahve. Buz üzerinde servis edilir."
- **EN name:** Cold Brew
- **EN description:** "16-hour cold steeped coffee with low acidity and smooth body, served over ice."

### 2.3 Frappé

- **Slug:** `frappe`
- **Emoji:** 🧊
- **Sort order:** 8
- **Fiyat:** 130.00 TRY
- **Allergens:** `dairy`
- **Tags:** `new`
- **TR name:** Frappé
- **TR description:** "Çırpılmış buz, espresso ve sütün köpürtülmesiyle hazırlanan kremamsı soğuk kahve."
- **EN name:** Frappé
- **EN description:** "Creamy iced coffee made with blended ice, espresso and milk."

### 2.4 Limonata

- **Slug:** `limonata`
- **Emoji:** 🍋
- **Sort order:** 9
- **Fiyat:** 85.00 TRY
- **Allergens:** _(yok)_
- **Tags:** _(yok)_
- **TR name:** Limonata
- **TR description:** "Taze sıkılmış limon, nane ve doğal şeker ile hazırlanan ev yapımı limonata. Buz gibi servis edilir."
- **EN name:** Lemonade
- **EN description:** "Homemade lemonade with freshly squeezed lemon, mint and natural sugar. Served ice cold."

### 2.5 Berry Smoothie

- **Slug:** `berry-smoothie`
- **Emoji:** 🍓
- **Sort order:** 10
- **Fiyat:** 145.00 TRY
- **Allergens:** _(yok)_
- **Tags:** `vegan`, `gluten_free`
- **TR name:** Berry Smoothie
- **TR description:** "Çilek, ahududu ve böğürtlen karışımından hazırlanan kremamsı smoothie. Bitkisel süt ile zenginleştirilmiştir."
- **EN name:** Berry Smoothie
- **EN description:** "Creamy smoothie from a blend of strawberry, raspberry and blackberry, enriched with plant-based milk."

---

## Kategori 3 — Tatlılar

**Slug:** `tatlilar`  
**Sort order:** 3  
**TR:** "Tatlılar"  
**EN:** "Desserts"  
**TR description:** "Geleneksel ve modern tariflerin harmanlandığı, her biri usta ellerden çıkmış ev yapımı tatlılar."  
**EN description:** "Homemade desserts where traditional and modern recipes blend, each crafted by master hands."

### 3.1 Tiramisu

- **Slug:** `tiramisu`
- **Emoji:** 🍰
- **Sort order:** 11
- **Fiyat:** 145.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`
- **Tags:** `popular`
- **TR name:** Tiramisu
- **TR description:** "Mascarpone, espresso ve kadifemsi kadife kakao arasında katmanlanmış klasik İtalyan tatlısı."
- **EN name:** Tiramisu
- **EN description:** "Classic Italian dessert layered between mascarpone, espresso and velvety cocoa."

### 3.2 Cheesecake

- **Slug:** `cheesecake`
- **Emoji:** 🍰
- **Sort order:** 12
- **Fiyat:** 155.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`
- **Tags:** _(yok)_
- **TR name:** Cheesecake
- **TR description:** "Bisküvili taban üzerinde kremamsı Philadelphia peyniri. Üzerine taze meyve sosu."
- **EN name:** Cheesecake
- **EN description:** "Creamy Philadelphia cheese on a biscuit base, topped with fresh fruit sauce."

### 3.3 Brownie

- **Slug:** `brownie`
- **Emoji:** 🍫
- **Sort order:** 13
- **Fiyat:** 125.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`, `nuts`
- **Tags:** `popular`
- **TR name:** Brownie
- **TR description:** "Yoğun çikolata, erimiş parçacıklarıyla dolu sıcak servis brownie. Yanında vanilya dondurması."
- **EN name:** Brownie
- **EN description:** "Rich chocolate brownie served warm with melted chunks, accompanied by vanilla ice cream."

### 3.4 San Sebastian Cheesecake

- **Slug:** `san-sebastian`
- **Emoji:** 🍰
- **Sort order:** 14
- **Fiyat:** 175.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`
- **Tags:** `featured`
- **TR name:** San Sebastian Cheesecake
- **TR description:** "İçi akışkan, üzeri karamelize burnt Basque usulü cheesecake. Modern Cafe'nin imza tatlısı."
- **EN name:** San Sebastian Cheesecake
- **EN description:** "Burnt Basque-style cheesecake with a custardy interior and caramelized top. Modern Cafe's signature dessert."

### 3.5 Macaron (4'lü)

- **Slug:** `macaron`
- **Emoji:** 🧁
- **Sort order:** 15
- **Fiyat:** 165.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`, `nuts`
- **Tags:** `new`
- **TR name:** Macaron (4'lü)
- **TR description:** "Fransız usulü çıtır badem kabuklu, kremamsı dolgulu dört farklı renkte makaron: vanilya, çikolata, fıstık, frambuaz."
- **EN name:** Macaron (4 pieces)
- **EN description:** "French-style crispy almond shells with creamy fillings in four flavors: vanilla, chocolate, pistachio and raspberry."

---

## Kategori 4 — Kahvaltı

**Slug:** `kahvalti`  
**Sort order:** 4  
**TR:** "Kahvaltı"  
**EN:** "Breakfast"  
**TR description:** "Güne keyifle başlamak için sıcak, doyurucu ve özenle hazırlanmış kahvaltı seçenekleri."  
**EN description:** "Warm, generous and carefully prepared breakfast options for a delightful start to your day."

### 4.1 Serpme Kahvaltı

- **Slug:** `serpme-kahvalti`
- **Emoji:** 🍳
- **Sort order:** 16
- **Fiyat:** 650.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`
- **Tags:** `vegetarian`
- **TR name:** Serpme Kahvaltı (2 Kişilik)
- **TR description:** "Beyaz peynir, kaşar, sucuk, salam, sosis, bal-kaymak, tereyağı, zeytin, çeşitli reçeller, domates-salatalık, yumurtalı ekmek. İki kişiliktir."
- **EN name:** Turkish Breakfast Spread (for 2)
- **EN description:** "White cheese, kashar, soudjouk, salami, sausage, honey-clotted cream, butter, olives, assorted jams, tomato-cucumber, bread with eggs. Serves two."

### 4.2 Menemen

- **Slug:** `menemen`
- **Emoji:** 🍳
- **Sort order:** 17
- **Fiyat:** 145.00 TRY
- **Allergens:** `eggs`
- **Tags:** `vegetarian`, `popular`
- **TR name:** Menemen
- **TR description:** "Tereyağında kavrulmuş biber, domates ve yumurtanın buluştuğu sıcacık Türk klasiği. Ekmekle servis edilir."
- **EN name:** Menemen (Turkish Scrambled Eggs)
- **EN description:** "Warm Turkish classic with peppers, tomato and eggs sautéed in butter. Served with bread."

### 4.3 Avokado Tost

- **Slug:** `avokado-tost`
- **Emoji:** 🥑
- **Sort order:** 18
- **Fiyat:** 165.00 TRY
- **Allergens:** `gluten`
- **Tags:** `vegan`, `popular`
- **TR name:** Avokado Tost
- **TR description:** "Çekirdeksiz avokado ezmesi, cherry domates, kırmızı soğan ve limon. Ekşi maya ekmeğinde."
- **EN name:** Avocado Toast
- **EN description:** "Mashed avocado, cherry tomatoes, red onion and lemon on sourdough bread."

### 4.4 Pankek

- **Slug:** `pankek`
- **Emoji:** 🥞
- **Sort order:** 19
- **Fiyat:** 155.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`
- **Tags:** `vegetarian`, `popular`
- **TR name:** Pankek
- **TR description:** "Üç kat yumuşak pankek, taze çilek ve yaban mersini, akçaağaç şurubu ve tereyağı ile."
- **EN name:** Pancakes
- **EN description:** "Three fluffy pancakes with fresh strawberries and blueberries, maple syrup and butter."

### 4.5 Granola Bowl

- **Slug:** `granola-bowl`
- **Emoji:** 🥣
- **Sort order:** 20
- **Fiyat:** 145.00 TRY
- **Allergens:** `nuts`
- **Tags:** `vegan`, `gluten_free`
- **TR name:** Granola Bowl
- **TR description:** "Ev yapımı granola, bitkisel yoğurt, taze meyveler (muz, çilek, yaban mersini), chia tohumu ve bal yerine akçaağaç şurubu."
- **EN name:** Granola Bowl
- **EN description:** "House granola, plant-based yogurt, fresh fruit (banana, strawberry, blueberry), chia seeds and maple syrup."

---

## Kategori 5 — Sandviçler

**Slug:** `sandvicler`  
**Sort order:** 5  
**TR:** "Sandviçler"  
**EN:** "Sandwiches"  
**TR description:** "Taze malzemelerle hazırlanan, kahvaltıdan öğle yemeğine her saatin tercihi sandviçler."  
**EN description:** "Sandwiches prepared with fresh ingredients, a choice for any hour from breakfast to lunch."

### 5.1 Club Sandwich

- **Slug:** `club-sandwich`
- **Emoji:** 🥪
- **Sort order:** 21
- **Fiyat:** 195.00 TRY
- **Allergens:** `gluten`, `dairy`, `eggs`
- **Tags:** `popular`
- **TR name:** Club Sandwich
- **TR description:** "Tavuk, bacon, marul, domates ve yumurta ile klasik üç katmanlı club sandwich. Patates cipsi yanında."
- **EN name:** Club Sandwich
- **EN description:** "Classic triple-decker with chicken, bacon, lettuce, tomato and egg. Served with potato chips."

### 5.2 Tuna Sandwich

- **Slug:** `tuna-sandwich`
- **Emoji:** 🥪
- **Sort order:** 22
- **Fiyat:** 185.00 TRY
- **Allergens:** `gluten`, `fish`, `eggs`
- **Tags:** _(yok)_
- **TR name:** Tuna Sandwich
- **TR description:** "Ton balığı, kornişon, kırmızı soğan, marul ve mayonez. Ekşi maya ekmeğinde."
- **EN name:** Tuna Sandwich
- **EN description:** "Tuna, cornichons, red onion, lettuce and mayonnaise on sourdough bread."

### 5.3 Veggie Sandwich

- **Slug:** `veggie-sandwich`
- **Emoji:** 🥪
- **Sort order:** 23
- **Fiyat:** 175.00 TRY
- **Allergens:** `gluten`
- **Tags:** `vegan`
- **TR name:** Veggie Sandwich
- **TR description:** "Roka, ızgara kabak, patlıcan, biber, kurutulmuş domates ve humus. Ciabatta ekmeğinde."
- **EN name:** Veggie Sandwich
- **EN description:** "Arugula, grilled zucchini, eggplant, pepper, sun-dried tomato and hummus on ciabatta."

### 5.4 Chicken Panini

- **Slug:** `chicken-panini`
- **Emoji:** 🥪
- **Sort order:** 24
- **Fiyat:** 195.00 TRY
- **Allergens:** `gluten`, `dairy`
- **Tags:** `popular`
- **TR name:** Chicken Panini
- **TR description:** "Marine edilmiş tavuk göğsü, mozzarella, fesleğen pesto ve kiraz domates. Sıcak basılmış panini ekmeğinde."
- **EN name:** Chicken Panini
- **EN description:** "Marinated chicken breast, mozzarella, basil pesto and cherry tomatoes on a hot-pressed panini."

### 5.5 BLT

- **Slug:** `blt`
- **Emoji:** 🥪
- **Sort order:** 25
- **Fiyat:** 175.00 TRY
- **Allergens:** `gluten`, `eggs`
- **Tags:** _(yok)_
- **TR name:** BLT
- **TR description:** "Bacon, marul, domates ve mayonez. Tost ekmeğinde. Klasik ve doyurucu."
- **EN name:** BLT
- **EN description:** "Bacon, lettuce, tomato and mayonnaise on toast bread. Classic and satisfying."

---

## İletişim ve Meta

| Konu | Değer |
|---|---|
| Telefon | +90 212 555 0123 |
| WhatsApp | +90 532 555 0123 |
| E-posta | hello@modern-cafe.example |
| Adres | Caferağa Mahallesi, Moda Caddesi No:42, Kadıköy, İstanbul |
| Google Maps | https://maps.google.com/?q=Caferaga+Moda+Kadikoy |
| Instagram | https://instagram.com/modern.cafe.tr |
| Web sitesi | https://modern-cafe.example |
| Çalışma saatleri (Pzt-Cum) | 08:00 — 22:00 |
| Çalışma saatleri (Cmt-Pzr) | 09:00 — 23:00 |

---

## Seed Komut Notu (Sprint 6 için)

`seed_demo` komutu bu envanteri okuyacak ve aşağıdaki sırayla import edecek:
1. Organization (Modern Cafe, slug=modern-cafe)
2. ThemeConfig (Modern Cafe palette)
3. Menu (slug=modern-cafe-menu, default_locale=tr)
4. Categories (5 kategori, sort_order 1-5)
5. Items (25 ürün, sort_order 1-25)
6. Translations (TR + EN her ürün/kategori için)
7. Allergens + DietaryTags (zaten Sprint 2'de seed_allergens_tags var)
8. M2M relations (item → allergens + tags)

Fiyatlar `DecimalField(max_digits=10, decimal_places=2)` ile Decimal('75.00') olarak kaydedilecek (OP-6).