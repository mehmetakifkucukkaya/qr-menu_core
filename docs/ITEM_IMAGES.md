# ITEM_IMAGES — Ürün ve kategori fotoğrafları (isteğe bağlı)

**Kapsam:** `apps/web` (yönetim formları, müşteri menüsü, `/media` rotası) + `backend` (yalnızca `MEDIA_ROOT` env)
**Karar:** fotoğraf **her yerde isteğe bağlıdır**. İşletme ekler ya da eklemez; eklediyse istediği an kaldırır.

---

## 1. İşletme için ne var?

| Yer | Fotoğraf yoksa | Fotoğraf varsa |
|---|---|---|
| Ürün (`Ürün düzenle` → **Fotoğraf**) | kart yalnızca isim + açıklama + fiyat | kartın sağında kare fotoğraf, detay çekmecesinde büyük hali |
| Kategori (`Kategori düzenle` → **Kategori fotoğrafı**) | yalnızca başlık | başlığın üstünde geniş şerit (banner) |
| İşletme (`İşletme` → Logo / Kapak fotoğrafı) | monogram / düz zemin | logo / menünün üstünde kapak (bu alanlar zaten vardı; kapak artık küçültülüyor) |

Form davranışı (`ImageUpload.tsx`):

* Dosya seçilir ya da sürüklenip bırakılır. Telefonda işletim sistemi kamera / galeri / dosya seçeneklerini sunar.
* Yalnızca **JPG, PNG, WEBP** ve **en fazla 5 MB**. Bu iki kontrol yüklemeden **önce** tarayıcıda yapılır; kullanıcı
  sunucunun reddetmesini beklemez, düz Türkçe bir mesaj görür.
* Yükleme sırasında yerel önizleme + ilerleme çubuğu; bitince önizleme, **sunucunun gerçekten servis ettiği** dosyaya
  geçer. Yani yüklenen ama yüklenemeyen bir görsel müşteri menüsünde değil, burada fark edilir.
* **Değiştir** ve **Kaldır** düğmeleri. Kaldırmak, ürünü yalnızca yazılı karta döndürür; başka hiçbir şey değişmez.
* Değişiklik formun **Kaydet** düğmesiyle uygulanır (yüklemek ürünü kendiliğinden değiştirmez).

## 2. Fotoğrafın yolu

```
form ──(tür + 5 MB kontrolü)──▶ POST /api/v1/admin/media/upload/
                                   │  EXIF yönü düzeltilir, ≤ 1920×1080'e küçültülür,
                                   │  400 px küçük resim üretilir, MediaAsset kaydı açılır
                                   ▼
              /media/tenants/<işletme>/image/<uuid>.<uzantı>   ← ürünün/kategorinin `image` alanına yazılır
                                   │
müşteri menüsü ── <img src="/media/…"> ──▶  production: Caddy, `backend-media` volume'undan
                                            dev / preview / e2e: Next.js `/media` rotası → Django
```

Neden işlenmiş hat? Telefon fotoğrafı 3–5 MB'dır; işlenmeden her müşteriye olduğu gibi gönderilirdi.

### Hangi alan hangi hattı kullanır

| Alan | Hat | Neden |
|---|---|---|
| Ürün, kategori, **kapak** | `POST /admin/media/upload/` (işlenmiş) | fotoğraf; küçültme + EXIF düzeltme istenir. Kapak her ziyaretçinin indirdiği ilk resimdir: 4032 px'lik telefon fotoğrafı olduğu gibi gitmemeli |
| Logo | `POST /admin/media/upload` (olduğu gibi) | işleme, şeffaf PNG'yi siyaha çevirir; logo bozulmasın diye dokunulmaz |

`ImageUpload` bunu `processed` prop'uyla seçer (varsayılan: `false`).

### Küçük resimler (thumbnail)

Backend her işlenmiş yüklemenin yanına `<ad>.thumb.<uzantı>` adıyla ≤ 400 px'lik bir kopya yazar. Ekranda **küçük** görünen
yerler bunu kullanır: menü kartı (~120 px), sepet satırı, admin liste karosu (`SmartImage thumbnail` →
`lib/media-url.ts → thumbnailSrc()`). 30 ürünlük bir kategori ≈ 10 MB yerine ≈ 1 MB indirir. **Büyük** yerler tam dosyayı
yükler: ürün çekmecesi, kategori şeridi, kapak, form önizlemesi.

* Yalnızca `tenants/<işletme>/image/<32 hex>.<jpg|png|webp>` biçimindeki dosyalar aday olur (host fark etmez, sorgu dizgisi
  korunur). Eski yüklemeler (`uploads/…`) ve zaten küçük resim olanlar tam dosyayla kalır.
* Küçük resim bir **tahmindir**: dosya yoksa (üretilememiş, silinmiş) `SmartImage` hata karosu göstermeden tam dosyaya döner
  (e2e flow 8b).
* Backend küçük resmi her zaman JPEG olarak kodlar ama adı özgün uzantıyı taşır (`x.thumb.png` içinde JPEG baytları olabilir).
  Tarayıcılar resmi içeriğinden tanıdığı için bu bir sorun değildir; yine de bilinen bir tuhaflık.

## 3. `/media` rotası (`app/media/[...path]/route.ts`)

Production'da `/media/*` isteğini Caddy karşılar ve bu rota hiç çalışmaz. Caddy olmayan her yerde
(`next dev`, preview, tünel, e2e) `/media` isteğini kimse karşılamıyordu: yükleme başarılı görünüyor, kaydediliyor,
ama müşteri menüsünde fotoğraf **404** oluyordu. Bu rota o açığı kapatır ve Django'ya (`INTERNAL_API_BASE_URL`,
istek başına okunur — Docker imajında yeniden build gerekmez) yönlendirir.

Kimlik doğrulamasız bir dosya proxy'si olduğu için kasıtlı olarak dardır:

* yalnızca `GET` / `HEAD` (başka metot export edilmez → 405);
* yol, `lib/media-proxy.ts` ile doğrulanır: yalnızca `/media/<en çok 8 parça>`; `.` / `..`, `%2e%2e`, `%2F`, `%5C`,
  kontrol karakteri / NUL, boş parça, 400 karakterden uzun yol → reddedilir; hedef her zaman yapılandırılmış backend origin'i;
* backend yönlendirmeleri **izlenmez**, 10 sn zaman aşımı;
* yalnızca `image/*` yanıtları geçer — aynı volume'daki içe aktarılmış PDF'ler (`pdf_imports/`) 404 olur;
* backend'in hata gövdesi / durum kodu istemciye yansıtılmaz.

Django, `DEBUG` kapalıyken `/media` servis etmez; production'da Caddy zaten önde olduğu için bu bir sorun değildir.

## 4. Eski kayıtlar ve mutlak URL'ler

Eski yükleme hattı `PUBLIC_BASE_URL` ile **mutlak** URL kaydeder (ör. `http://localhost:3000/media/uploads/1/x.jpg`).
Böyle bir adres yalnızca onu üreten makinede çalışır. `lib/media-url.ts → mediaSrc()` yalnızca şunu yapar:
**loopback host + `/media/` yolu** ise adresi aynı-origin `/media/…` yoluna çevirir. Gerçek alan adlarına (production
origin'i, CDN, R2) **dokunmaz**. `SmartImage` ve `PremiumHero` bunu otomatik uygular; JSON-LD (`lib/seo.ts`) için
`absoluteMediaUrl()` göreli yolu site origin'iyle mutlaklaştırır (arama motorları göreli `image` kabul etmez).

## 5. Testler

| Ne | Nerede |
|---|---|
| `mediaSrc` / `thumbnailSrc` / `absoluteMediaUrl` | `src/lib/media-url.test.ts` (`npm run test:media-url`) |
| yol doğrulama, `image/*` süzgeci | `src/lib/media-proxy.test.ts` (`npm run test:media-proxy`) |
| JSON-LD'de mutlak görsel URL'si | `src/lib/seo.test.ts` |
| uçtan uca: seç → yükle → kaydet → müşteri menüsünde **gerçekten yüklenir** (kart: küçük resim, çekmece: tam dosya, eksik küçük resimde geri dönüş) | `e2e/photos.spec.ts` (flow 8a–8h) |

E2E düzeneği artık yüklemeleri çalışma kopyasındaki `backend/media`'ya değil, her çalıştırmada silinen geçici bir
klasöre yazar: `MEDIA_ROOT` ortam değişkeni (`backend/config/settings/base.py`). `production.py` kendi yolunu
bilerek sabit tutar — Caddy tam o volume'u okur.

## 6. Bilinen sınırlar ve sonraki adımlar

* **Yetim dosya.** Yükleme, fotoğraf seçildiği anda yapılır. Kullanıcı Kaydet'e basmadan çıkarsa ya da fotoğrafı
  kaldırırsa dosya medya kitaplığında kalır (silinmez).
* **S3 / R2.** `MEDIA_STORAGE_BACKEND=s3` iken `public_url` mutlak (`MEDIA_PUBLIC_BASE_URL`) döner; `mediaSrc` ona
  dokunmaz ve `/media` rotası devreye girmez.
