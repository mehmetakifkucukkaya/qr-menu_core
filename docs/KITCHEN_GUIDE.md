# Mutfak Ekranı Kılavuzu

İşletme sahibi ve mutfak ekibi içindir; ajansın pilot günü kontrol listesi en altta. Ekranın adresi `https://<alan-adı>/admin/kitchen`: mutfak hesabı giriş yapınca doğrudan buraya düşer. Müşteri açma ve ajans işleri için `docs/AGENCY_RUNBOOK.md`, sunucu kurulumu için `docs/DEPLOYMENT.md`.

## 1. Kurulum (sahip, bir kez)

1. **Ekip** sayfasında **Üye ekle**, rol **Mutfak**. Geçici şifre yalnızca bir kez gösterilir; tablete not edin. **Her tablet kendi hesabını kullanır**: denetim kaydında bir siparişe kimin dokunduğu görünür.
2. Tablette `https://<alan-adı>/login` adresini açın, e-posta ve geçici şifreyle girin, yeni şifrenizi belirleyin. Mutfak ekranı doğrudan açılır. Yan menü yoktur; yalnız işletme adı, saat ve **Çıkış yap** görünür.
3. Tableti şarja takın, sesini açın, "Rahatsız etme" modunu kapatın ve tarayıcıyı bu sayfada bırakın.

## 2. Her serviste

1. Ekranı açın. Başlığın altında "Canlı · son güncelleme …" satırı görünmeli.
2. **Servisi başlat**'a bir kez dokunun. Bu dokunuş yeni siparişte zilin çalmasına, tablet ekranının açık kalmasına ve tarayıcı destekliyorsa tam ekrana izin verir. Sayfa yenilenirse ya da tablet yeniden açılırsa yeniden dokunun: dokunulmadıkça zil çalmaz, ekran yeni siparişi yalnızca vurgular. (Tarayıcı tam ekranı desteklemiyorsa **Tam ekran** düğmesi görünmez; ekranın çalışmasını etkilemez.)
3. İş bitince **Servisi bitir**.

## 3. Ekranı okumak

Üç sütun vardır: **Yeni**, **Hazırlanıyor**, **Hazır**; en eski sipariş en üsttedir ve her sütunun başında sipariş sayısı yazar. Ekran 5 saniyede bir kendiliğinden yenilenir; sayfayı yenilemek gerekmez. Bir kartta:

* büyük `#12`: günün sıra numarası (her gün 1'den başlar); altında tam sipariş numarası ve müşterinin adı. Müşterinin telefon numarası bu ekranda yoktur;
* masa numarası;
* geçen süre: 10 dakikadan sonra sarı "Uzadı", 20 dakikadan sonra kırmızı "Geç kaldı";
* kalemler (adet × ürün). Müşterinin ürüne yazdığı not sarı kutuda, ürünün alerjenleri etiket olarak ürünün altındadır; en altta sipariş notu yer alır;
* "Dünden": önceki günden açık kalmış sipariş.

## 4. Dokunuşlar

| Sütun | Düğme | Ne olur |
|---|---|---|
| Yeni | **Hazırlamaya başla** | sipariş Hazırlanıyor sütununa geçer |
| Hazırlanıyor | **Hazır** | Hazır sütununa geçer; müşterinin sayfasında "Hazır" görünür |
| Hazır | **Teslim edildi** | karttan kalkar (Siparişler sayfasında kalır) |
| Yeni, Hazırlanıyor | **İptal** | neden sorulur (aşağıda) |

**İptal:** nedeni seçin: **Ürün tükendi**, **Mutfak yoğun** ya da **Diğer**; sonra onaylayın. Müşteri nedeni sipariş sayfasında görür. Hazır olan sipariş iptal edilemez.

**Yeni sipariş geldiğinde** kart "YENİ" etiketi ve yanıp sönen çerçeveyle belirir. Servis açıksa zil 4 saniyede bir çalar ve **karta dokunana kadar** susmaz (düğmeye basmak da dokunuştur). **Sessiz** zili kapatır; kartlar yine vurgulanır.

İki tablet aynı siparişe dokunursa ikincisi kartın üzerinde sakin bir mesaj görür ve ekran kendini yeniler.

## 5. Sorun olunca

| Ekranda | Anlamı | Ne yapılır |
|---|---|---|
| "Canlı · son güncelleme 14:32:40", saniyeler ilerliyor | her şey yolunda | – |
| "Bağlantı yok · son güncelleme 14:32" şeridi | tablet sunucuya ulaşamıyor; son alınan siparişler görünür, bağlantı gelince ekran kendiliğinden yenilenir | Wi-Fi'ye bakın. Bu sürede gelen siparişleri göremezsiniz |
| saat ilerlemiyor | ekran donmuş | sayfayı yenileyin ve **Servisi başlat**'a yeniden dokunun |
| "Oturumunuz sona erdi", **Yeniden giriş yap** | oturum bitti ya da hesap kapatıldı | giriş yapın; olmuyorsa sahibe haber verin |
| zil çalmıyor | — | **Servisi başlat**'a dokunuldu mu? **Sessiz** açık mı? Tabletin sesi kısık mı? |
| kartta alerjen yok | ürüne alerjen işaretlenmemiş ya da sunucuda alerjen listesi yüklenmemiş | sahip ürünü düzenlesin; ajans §6'daki ilk maddeye baksın |

## 6. Ajans için pilot günü kontrol listesi

* [ ] Sunucuda `manage.py seed_allergens_tags` bir kez çalıştırıldı (alerjen ve diyet etiketi listesi; yoksa ürün formunda alerjen seçilemez, kartlarda görünmez). `docs/DEPLOYMENT.md` §3.1.
* [ ] Müşteri açıldı (`docs/AGENCY_RUNBOOK.md` §2); sahip ürünlerin alerjenlerini işaretledi.
* [ ] Mutfak hesabı eklendi ve tablette giriş yapıldı (§1).
* [ ] Deneme siparişi: telefondan, bir ürüne not yazarak sipariş verildi; kart 5 saniye içinde göründü, zil çalıyor; **Hazırlamaya başla**, **Hazır**, **Teslim edildi** çalışıyor. İkinci bir deneme siparişi iptal edildi ve neden müşterinin sayfasında göründü.
* [ ] Wi-Fi kapatılıp açıldı: "Bağlantı yok" şeridi çıktı ve bağlantı gelince kayboldu.
