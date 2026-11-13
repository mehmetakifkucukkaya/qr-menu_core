# Ajans El Kitabı

Ajansın sahibi ve teknik ekibi içindir: müşteri açmak, desteklemek ve işletmek. Sunucunun kurulumu ve dağıtımı için `docs/DEPLOYMENT.md`, tasarım için `docs/superpowers/specs/2026-10-03-pilot-readiness-design.md`.

Ajans paneli = Django admin: `https://<alan-adı>/django-admin/`. İşletme sahibinin ve ekibinin paneli ayrıdır (`/admin`, "Yönetim girişi").

## 1. Ajans hesabı ve panele giriş

Ajans personeli kendi kişisel hesabını `createsuperuser` ile açar (ortak şifre kullanılmaz):

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py createsuperuser
```

Giriş e-posta + şifre iledir. Hesabı olan herkes **tüm müşterileri** görür ve değiştirir; iki adımlı doğrulama yoktur. Bu yüzden paneli ağ düzeyinde de kısıtlayın (bkz. §9).

Sol menü dört gruptur: **Müşteriler** (ajansın müşterileri: işletmeler, üyelikler, kullanıcılar, şubeler, menüler, QR kodlar), **Siparişler** (siparişler, işletmelerin kendi müşterilerinin hesapları, sadakat ve ödeme kayıtları), **Plan & Kullanım** (plan ayarları, kullanım sayaçları, menü görüntülenmeleri), **Destek** (denetim olayları, medya, yapay zekâ ve PDF kayıtları).

## 2. Yeni müşteri açma

### 2.1 Ekrandan

**Müşteriler › İşletmeler › Yeni müşteri aç.** İşletme adı, adres adı (slug; menü bağlantısı `/m/<slug>` olur ve sonradan değişmez), sahip adı ve e-postası, paket, modüller, isteğe bağlı deneme günü, dil ve para birimi. **Müşteriyi aç** düğmesi şunları tek adımda yapar: sahip hesabı (geçici şifreyle), işletme, paket, tema, "Merkez" şubesi, boş "Ana Menü" ve ilk QR kodu.

Sonuç kartı **geçici şifreyi yalnızca bir kez** gösterir; kapatmadan önce kopyalayın.

### 2.2 Komutla

```bash
docker compose --env-file .env.production -f docker-compose.production.yml exec backend \
    python manage.py create_tenant --name "Pilot Kafe" --slug pilot-kafe \
    --owner-email owner@pilot.example --plan pro --modules orders --json
```

| Seçenek | Anlamı |
|---|---|
| `--name`, `--slug`, `--owner-email` | zorunlu |
| `--owner-name` | sahibin adı |
| `--plan` | `basic` (varsayılan), `pro`, `orders`, `ops` |
| `--modules` | pakete ek olarak açılır: `orders` (sipariş + mutfak ekranı), `loyalty`, `ai_pdf`, `ai_translate`, `analytics` |
| `--trial-days` | yalnız `basic` ve modülsüz müşteriye: tam özellikli deneme, bitince `basic` |
| `--locale`, `--currency` | `tr` / `en`; `TRY` / `EUR` / `USD` / `GBP` |
| `--json` | sonuç kartını JSON olarak yazar |

Çevrimiçi ödeme hiçbir komutla açılmaz (pilotta kapalıdır).

### 2.3 Müşteriye teslim

Karttaki yönetim giriş bağlantısını, e-postayı ve geçici şifreyi sahibe iletin. Sahip ilk girişte şifresini değiştirir; sonra **Ekip** sayfasından mutfak ve personel hesaplarını kendisi ekler. Menü bağlantısı `/m/<slug>`; basılı QR kodları sahibin panelindeki **QR Kodlar** sayfasından iner.

## 3. Askıya alma ve yeniden etkinleştirme

**Müşteriler › İşletmeler**, işletmeyi işaretleyin, eylem: **Seçili müşterileri askıya al** (bir onay sorulur). Etkisi:

* ekip giriş yapamaz; açık oturumlar "Hesabınız askıya alındı" ekranını görür;
* **herkese açık menü ve QR kodlar açılmaz** (404);
* hiçbir veri silinmez.

Geri almak için **Seçili müşterileri yeniden etkinleştir**. İkisi de denetim kaydına yazılır.

## 4. Deneme süresi

Deneme, `basic` bir müşteriye belirli süre tam özellik verir; süre bitince müşteri `basic`'e düşer. `--trial-days` ile ya da listeden **Denemeyi 7 gün uzat** / **Denemeyi 14 gün uzat** / **Denemeyi 30 gün uzat** ile verilir. `basic` olmayan (pro, orders, ops) müşteriye uygulanmaz; onun için paketi değiştirin.

Biten denemeleri her gün `basic`'e düşüren komutu cron'a koyun (plan okunurken de tembel olarak uygulanır, bu süpürme listeyi ve raporları tutarlı tutar):

```bash
17 4 * * * cd /opt/agency-qr-menu && docker compose --env-file .env.production -f docker-compose.production.yml exec -T backend python manage.py expire_trials >> /var/log/qr-menu-trials.log 2>&1
```

## 5. Paket ve modül değiştirme

İşletme sayfasındaki **Paketi ve modülleri düzenle** bağlantısı (ya da **Plan & Kullanım › Plan Ayarları**). Paketi değiştirmek özellikleri yeni paketin varsayılanına çeker ve deneme süresini sona erdirir; aynı kayıtta işaretlediğiniz özellikler korunur. Her değişiklik denetim kaydına before/after ile yazılır. Bir özellik kapalıysa müşteri ilgili ekranda "bu özellik paketinizde yok" görür: ilgili modülü açın (sipariş ve mutfak ekranı için **Sipariş + mutfak**).

## 6. Şifre sıfırlama

* **Sahip:** İşletmeler listesinde tek işletme seçin, eylem **Sahibin şifresini sıfırla**. Yeni geçici şifre bir sonraki ekranda bir kez görünür; sahibin açık oturumları kapanır.
* **Mutfak, personel, yönetici:** sahip kendi **Ekip** sayfasından sıfırlar.

## 7. Denetim kaydı ve kullanım

**Destek › Denetim olayları:** kim, ne zaman, hangi işletmede ne yaptı (ajans eylemlerinde "kim" sizsiniz). İşletme silinse de kayıtlar kalır. **Müşteriler** listesi plan, deneme, son 30 gün sipariş sayısı, ürün sayısı ve son siparişi tek bakışta gösterir; **Plan & Kullanım** aylık görüntülenme ve tarama sayaçlarını tutar.

## 8. Müşteriyi silme

İşletmeyi silmek menüsünü, QR kodlarını, ekibini ve görsellerini geri dönüşsüz siler. **Siparişi olan bir müşteri silinemez** (siparişler iş kaydıdır, sistem korur): onu askıya alın. Önce askıya alın, bir süre bekleyin; silmek için işletme sayfasında **Sil**. (Toplu silme kapalıdır.) Silinen müşterinin denetim kayıtları, işletmenin adıyla kalır.

## 9. Paneli kısıtlama (önerilir)

İki adımlı doğrulama olmadığı için `/django-admin/` yolunu Caddy'de ajansın ağına kapatın. `Caddyfile` içindeki `handle /django-admin/*` bloğunu şunlardan biriyle değiştirin.

IP izin listesi:

```caddy
handle /django-admin/* {
    @ajans_disi not remote_ip 203.0.113.10 198.51.100.0/24
    respond @ajans_disi "Erişim yok" 403
    reverse_proxy backend:8000
}
```

Ek parola (Django girişinin önünde ikinci bir kapı; `caddy hash-password` çıktısını kullanın):

```caddy
handle /django-admin/* {
    basic_auth {
        ajans <caddy hash-password çıktısı>
    }
    reverse_proxy backend:8000
}
```

Değişiklikten sonra: `docker compose --env-file .env.production -f docker-compose.production.yml restart caddy`.

## 10. Yedekleme kontrol listesi

* [ ] Gece yedeği çalışıyor (`/var/log/qr-menu-backup.log` dün geceyi gösteriyor; `docs/DEPLOYMENT.md` §5.1).
* [ ] Son yedek dosyasının tarihi dün gece ve boyutu sıfırdan büyük.
* [ ] Yüklenen görseller (medya klasörü) de yedekleniyor.
* [ ] Yedeğin bir kopyası sunucunun dışında (`docs/DEPLOYMENT.md` §5.2).
* [ ] Üç ayda bir geri yükleme denemesi yapıldı (`docs/DEPLOYMENT.md` §5.3).
* [ ] `expire_trials` günlüğü hatasız (§4).

## 11. Sık sorunlar

| Belirti | Bakılacak yer |
|---|---|
| "Müşteri giriş yapamıyor" | İşletme askıda mı (§3)? Üyeliği aktif mi (işletme sayfasındaki ekip tablosu)? Gerekirse şifre sıfırlayın (§6). |
| "QR kod açılmıyor / 404" | İşletme askıda mı, adres adı doğru mu, menü aktif mi? |
| "Sipariş ve mutfak ekranı yok" | Pakette **Sipariş + mutfak** açık mı (§5)? |
| "Bu özellik paketinizde yok" | İlgili modülü açın veya paketi yükseltin (§5). |
| "Deneme bitti, özellikler kapandı" | Denemeyi uzatın (§4) ya da paketi değiştirin (§5). |
| Yanlış kişiye şifre gitti | Hemen **Sahibin şifresini sıfırla** (§6); açık oturumlar kapanır. |
