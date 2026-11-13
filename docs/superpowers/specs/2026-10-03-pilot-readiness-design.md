# QR Menü — Pilot Kullanıma Hazırlık Tasarımı (Spec)

Tarih: 2026-10-03 (güncelleme 2026-10-05) · Durum: **tasarım ve spec onaylandı; Dilim 1 yürütüldü (PR #6, açık); Dilim 2 yürütüldü (PR #7, açık, Dilim 1'in üstüne yığılı); Dilim 3 yürütüldü (PR açık, Dilim 2'nin üstüne yığılı)** (`PLAN_DILIM1_TEMEL_2026-10-05.md`, `PLAN_DILIM2_AJANS_2026-10-05.md`, `PLAN_DILIM3_MUTFAK_2026-10-05.md`; plan aşamasında bulunan sapmalar bu belgeye işlendi) · Sabit sürüm: `origin/main` `05b3c12`
Kanıt belgesi: `READINESS_AUDIT_2026-10-03.md` (bulgular ve `path:line` kanıtları burada). Bu belge **ne yapılacağını** söyler, nedenini oradan okuyun.

## 1. Amaç ve karar günlüğü

İstek: işletme paneli, mutfak ekranı ve ajans paneli "kullanıcı kullanımına hazır" olsun.

| # | Karar (sahibin cevabı) |
|---|---|
| K1 | "Hazır" çıtası = **ilk pilot müşteriler**: kurulumu ajans yapar, işletme sahibi + 1-2 personel kullanır. Herkese açık kayıt kapalı, abonelik/ödeme yok. |
| K2 | Ajans paneli = **mevcut Django admin güçlendirilir** (kullanıcılar: sahip + teknik ekip). Özel `/platform` paneli bu işe girmez. |
| K3 | Yaklaşım **B (pilot günü senaryosu)**: tek uçtan uca test "bitti" tanımıdır; senaryo dışı P1/P2 yapılmaz, listelenir. |
| K4 | Kapsam dışı varsayımlar kabul: herkese açık kayıt, abonelik/ödeme, e-posta gönderimi, AI/PDF/çeviri (pilotta kapalı), çok şube, fiş yazıcısı, canlıya alma altyapısı (sunucu/alan adı sahibin). |
| K5 | Rol tablosu (§3.1) olduğu gibi onaylandı. |
| K6 | Ajans paneli kapsamı onaylandı; **ertelenen:** "kullanıcı olarak gör" ve 2FA. |
| K7 | Mutfak tasarımı onaylandı: mutfak "Hazırlamaya başla" (Onaylandı + Hazırlanıyor tek dokunuş), "Hazır" ve "Teslim edildi"yi yapar; personel aynı panodan yapabilir. |
| K8 | Teslim: **4 yığılı PR** (temel → ajans → mutfak → cila); hiçbiri sahibin açık "merge et"i olmadan birleştirilmez; çalışma ayrı çalışma ağacında, sahibin `agency-qr-menu` klasörüne dokunulmaz; commit mesajlarında Co-Authored-By yok. |

## 2. Pilot günü senaryosu ("bitti" tanımı)

Playwright: `apps/web/e2e/pilot-day.spec.ts`. Bütün düzeltmeler bu testi geçirmek için yapılır.

1. Ajans `python3 manage.py create_tenant --name "Pilot Kafe" --slug pilot-kafe --owner-email owner@pilot.test --plan pro --modules orders --json` ile müşteri açar (test kurulumu; `orders` modülü mutfak ekranını da açar).
2. Sahip geçici şifreyle girer, **zorunlu şifre değiştirme** ekranından geçer, panele düşer.
3. Sahip menüde kategori + ürün (alerjenli) oluşturur, **Ekip** sayfasında bir mutfak kullanıcısı ekler (geçici şifre bir kez gösterilir).
4. Müşteri `/m/<slug>` menüsünden ürünü **not yazarak** sepete ekler, masa numarasıyla sipariş verir; onay sayfası "Beklemede" gösterir.
5. Mutfak kullanıcısı (ayrı oturum) geçici şifreyle girer, şifresini değiştirir ve doğrudan mutfak panosuna düşer, "Servisi başlat" der; sipariş **5 sn içinde** kartta belirir (not + alerjen görünür) → "Hazırlamaya başla" → "Hazır" → "Teslim edildi".
6. Müşteri sayfası "Teslim edildi" gösterir.
7. Sahip Siparişler sayfasında siparişi görür; Dashboard sipariş olaylarıyla birlikte hatasız açılır.
8. Olumsuz kontroller: mutfak kullanıcısı `/admin/menus` açınca "Bu sayfaya yetkiniz yok" görür; personel hesabı menü silemez (403); başka işletmenin ürün kimliğiyle sipariş reddedilir; bağlantı kesilince mutfak panosu son veriyi + "Bağlantı yok" şeridini gösterir.

Ek kapılar: yol × rol tablo testi (§3.2), `seed_demo` üretim ayarında reddedilir testi, `scripts/release_gate.sh` yeşil. **Her düzeltme önce başarısız test yazılarak başlar**; yeni testin eski kodda kırmızı olduğu gösterilir (negatif kontrol).

## 3. Dilim 1 — Ortak temel (≈ 5-6 gün)

### 3.1 Roller ve yetki tablosu

`MembershipRole`'e `KITCHEN = "kitchen"` eklenir (yalnız seçenek listesi; etiketler Sahip / Yönetici / Personel / Mutfak). Kiracı içinde yetkiler:

| | Sahip | Yönetici | Personel | Mutfak |
|---|:-:|:-:|:-:|:-:|
| Menü, kategori, ürün, QR, medya, tema düzenleme | ✓ | ✓ | yalnız ürün "tükendi/mevcut" | ✗ |
| Menü/ürün/QR/kategori görme | ✓ | ✓ | ✓ (salt okunur) | ✗ |
| Siparişler (liste, detay, durum) | ✓ | ✓ | ✓ | ✗ |
| Mutfak panosu + sipariş durum geçişi | ✓ | ✓ | ✓ | ✓ |
| Müşteriler, sadakat, analitik | ✓ | ✓ | ✗ | ✗ |
| İşletme ayarları, ödeme anahtarları, Ekip, plan sayfası, silme | ✓ | ✗ | ✗ | ✗ |
| `/me`, çıkış, şifre değiştirme, işletme adı/logosu (GET) | ✓ | ✓ | ✓ | ✓ |

Ajans (platform yöneticisi: `role=admin`, `is_superuser`) hepsini tüm işletmelerde yapar.

### 3.2 Zorlama mekanizması

- **Tek kural tablosu + tek kapı** (plan aşamasında, ~20 görünüm dosyasına dağıtmak yerine bu mekanizma seçildi; davranış aynı): yeni `apps/accounts/roles.py` içindeki `RULES` tablosu "hangi rol hangi yol × yöntemi çağırabilir" sorusunun tek kaynağıdır; ilk eşleşen kural karar verir. `apps/accounts/middleware.py` içindeki `RoleGateMiddleware` (`AuthenticationMiddleware`'den sonra) korumalı yollarda (`/api/v1/admin/`, `/api/v1/account/admin/`, `/api/v1/payment/admin/`, `/api/v1/onboarding/`, `/api/v1/qr-codes/`) her isteği görünümden **önce** denetler; yalnız **aktif** üyeliği ve **aktif** işletmeyi sayar (aksi `auth.no_membership` / `tenant.suspended`, 403). **Tabloda olmayan korumalı yol varsayılan olarak yalnız sahip + yönetici** kabul eder (yeni uç personel/mutfağa kapalı doğar). Platform yöneticisi kapıyı her zaman geçer; `agency_admin` üyelik sahip gibi davranır. Görünümlerin kendi izin sınıfları (kiracı izolasyonu) aynen kalır.
- Personelin ürün "tükendi/mevcut" işaretlemesi için ayrı uç: `POST /api/v1/admin/menu-items/<id>/availability` (gövde `{"is_available": bool}`); genel `PATCH` personele kapalı. Arayüzde personel için menü/QR salt-okunur sayfaları yerine tek **"Ürün durumu"** sayfası (`/admin/availability`) vardır.
- Mutfak rolü yalnız şu uçlara girer: `GET /api/v1/admin/kitchen/board` ve `/tickets`, `POST /api/v1/admin/orders/<id>/status`, `/me`, çıkış, şifre değiştirme, işletme adı/logosu (GET). Başka her uç 403 döner.
- Silme uçları (`DELETE` menü/kategori/ürün/şube/QR) yalnız sahip; **menü, aktif QR kodu olan bir menü silinemez** (409, Türkçe mesaj: önce QR'ları kaldırın); her silme denetim olayı yazar. Yumuşak silme altyapısı kapsam dışıdır.
- **Tablo testi:** `/api/v1/admin/` altındaki her yol × yöntem × rol (4 rol + ajans + anonim) beklenen durum koduyla bir tabloda (`ROLE_MATRIX`) listelenir; test tüm URL kayıtlarını dolaşır, tabloda olmayan uç testi **kırar**.
- Arayüz: `ADMIN_NAV_GROUPS` (`AdminNav.tsx`) role göre süzülür (`/api/v1/me` ve giriş yanıtına `membership_role` ve `must_change_password` **eklenir**; bugün dönmüyor); yetkisiz sayfa 403 yerine Türkçe "Bu sayfaya yetkiniz yok" bileşenini gösterir.

### 3.3 Üyelik yaşam döngüsü ve Ekip

- Modeller (eklemeli migrasyon): `Membership.is_active` (varsayılan `True`), `User.must_change_password` (varsayılan `False`). `Organization.for_user`, `is_member`, `membership_for` ve "ilk üyelik" çözümleyicilerinin 6 kopyası tek `accounts.services.get_active_membership(user)` yardımcısına toplanır (yalnız aktif üyelik, `id` sıralı).
- API (yalnız sahip): `GET/POST /api/v1/admin/team/`, `PATCH /api/v1/admin/team/<membership_id>/` (rol, `is_active`), `POST /api/v1/admin/team/<membership_id>/reset-password/`. Oluşturma: `full_name`, `email`, `role ∈ {manager, staff, kitchen}`; sistem 10 karakterlik geçici şifre üretir (okurken karışan 0/O ve 1/l/I karakterleri hariç), **yanıtta bir kez** döner, `must_change_password=True`. Kurallar: API ile `owner` oluşturulamaz; son aktif sahip pasifleştirilemez; kimse kendi rolünü/aktifliğini değiştiremez; e-posta başka bir hesapta kullanılıyorsa 409 ("Bu e-posta başka bir hesapta kullanılıyor"). Pasifleştirilen üyenin API erişimi anında kesilir (her istekte aktif üyelik kontrol edilir). Şifre sıfırlamada kullanıcının diğer oturumları sonlandırılır.
- `POST /api/v1/auth/password/change/` (`current_password`, `new_password`; Django şifre doğrulayıcıları; mevcut oturum korunur, `must_change_password` temizlenir). Giriş/`/me` yanıtı `must_change_password` döner; admin layout `true` iken kullanıcıyı `/admin/account/password` ("Şifre değiştir") sayfasına yönlendirir (yalnız arayüz zorlar).
- Arayüz: `/admin/team` (yalnız sahip; Hesap grubunda "Ekip"): tablo, ekle/rol/pasifleştir/şifre sıfırla pencereleri, geçici şifre penceresi (kopyala düğmesi, "bir daha gösterilmez"), "Mutfak tableti ekle" kısayolu (rol=mutfak önseçili).
- Oturum: `SESSION_SAVE_EVERY_REQUEST=True` (kayan süre); girişte `set_expiry`: mutfak/personel 30 gün, sahip/yönetici 14 gün.
- Askıya alma: giriş sırasında kullanıcının tüm aktif üyelikleri pasif (`is_active=False`) işletmelere aitse 403 `code=tenant_suspended` ("Hesabınız askıya alındı, ajansınızla iletişime geçin"); açık oturumlar izin sınıfında aynı kodla durur. Platform yöneticisi etkilenmez.

### 3.4 İşletme profili (F-30)

`IsOrganizationMember` nesne izni `Organization` nesnesinin kendisini kuruluş olarak çözer. Profil `PATCH` yalnız sahip; `OrganizationSerializer` yalnız ajans için `slug`, `is_active` yazılabilir kılar; `DELETE` yalnız platform yöneticisi. GET (kenar çubuğu için) tüm rollere açık.

### 3.5 Güvenlik kapıları

- `seed_demo`: `settings.DEBUG` kapalıysa `CommandError` ile reddeder (`--allow-non-debug` yoksa); DEBUG kapalı + izin bayrağıyla çalışırsa `DEMO_ADMIN_PASSWORD` ortam değişkeni zorunlu (varsayılan yok). Yerel davranış değişmez (varsayılanlar ve "Demo hesabı" kutusu kalır). `docs/DEPLOYMENT.md`'deki `seed_demo` adımları (satır 259 ve 702-706) üretim için kaldırılır; yerine `create_tenant` + `createsuperuser` yazılır. `scripts/validate_prod_env.sh`: `DEMO_ADMIN_PASSWORD` varsayılana eşitse veya `NEXT_PUBLIC_ADMIN_DEMO_HINT` tanımlıysa **başarısız** olur.
- Kayıt kapalı: `SIGNUP_ENABLED` (varsayılan `False`); `SignupView` ve `SlugAvailabilityView` kapalıyken 404; `/signup` sayfası (sunucu bileşeni, istek anında) "Kayıt şu an kapalı, ajansınızla iletişime geçin" gösterir.
- Sipariş oluşturma: `calculate_total_from_items(items_data, organization)` ürünü yalnız `menu__organization=organization` içinde arar (aksi "Ürün bulunamadı"); en fazla 50 kalem, kalem başına en fazla 99 adet.
- Hata sınırları (Türkçe, "Tekrar dene" + "Ana sayfaya dön"): `(admin)/error.tsx` (layout hatası dahil, tam sayfa), `(admin)/admin/error.tsx` (sayfa hatası, kabuğun içinde), `(admin)/admin/not-found.tsx` ve uygulama kökünde `global-error.tsx` (Next kuralı gereği kökte olmak zorunda); `(admin)/admin/page.tsx` rolün açılış sayfasına yönlendirir (sahip/yönetici: dashboard, personel: siparişler, mutfak: mutfak panosu; yol kırıntısı 404'ü kapanır).
- Giriş çerezi öznitelikleri (ANALYSIS_1 F-35): giriş eylemi Django'nun `Set-Cookie` özniteliklerini (`HttpOnly`, `Secure`, `SameSite`, `Max-Age`) tarayıcıya aynen taşır; mutfak tableti tarayıcı yeniden başlayınca oturumu kaybetmesin.
- Saat dilimi: Next imajında `TZ=Europe/Istanbul`; tek `formatDateTime()` yardımcısı `Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul" })` kullanır; Django `TIME_ZONE` zaten `Europe/Istanbul` (`USE_TZ` açık); gün sınırları (sipariş numarası, "bugün", `is_stale`) `timezone.localdate()` ile hesaplanır, bugün UTC gününü kullanan yerler düzeltilir.
- Plan/deneme: `get_plan_settings()` satırı olmayan kiracıda `BILLING_DEFAULT_PLAN` (BASIC) kullanır (bugün OPS); `expire_trial_if_due` plan okunurken tembel olarak ve `manage.py expire_trials` (cron ile günlük) komutuyla çağrılır; `PlanSettings` her kiracı oluşturulurken kesin oluşturulur (`seed_demo` demo için OPS satırı oluşturur); açık bir plan kararı (API'de `update_plan_settings(active_plan=...)` veya Django admin'de plan seçmek) deneme tarihlerini siler. Sunucu tarafı bayrak denetimi **zaten vardır** (herkese açık sipariş oluşturma `orders_enabled`, PDF içe aktarma/çeviri ilgili `ai_*_enabled`); 402/403 yanıtları mevcut `billing.limit_exceeded` / `billing.feature_disabled` kodlarıyla döner (yeni kod icat edilmez). Mutfak ve sipariş **admin** uçlarının `orders_enabled` istemesi, menüde kapalı modülleri gizlemeyle birlikte **Dilim 4**'e aittir (aksi halde tek başına birleşen Dilim 1'de BASIC planlı işletmeler "Mutfak"ta ham hata görürdü).

## 4. Dilim 2 — Ajans paneli = güçlendirilmiş Django admin (≈ 4-5 gün)

**4.1 `provision_tenant` servisi** (yeni `apps/onboarding/provisioning.py`; `start_trial` ve `generate_first_qr` ile aynı uygulamada): tek `transaction.atomic` içinde: slug doğrulama (regex + **tek kaynaklı rezerve liste** `reserved.py`: `modern-cafe, demo, m, account, login, health, docs, auth, api, admin, signup, django-admin, media, static, _next`) ve benzersizlik; kullanıcı (rol owner, geçici şifre, `must_change_password=True`; `/signup` açıksa kullanıcının kendi şifresi); `Organization`; `Membership(OWNER)`; `PlanSettings` (`default_features(plan)` + modül geçersiz kılmaları; `payments_enabled` hiçbir pakette açılmaz; deneme yalnız `trial_days` verilirse ve **yalnız `basic` paket + modülsüz müşteriye**, çünkü deneme bitince müşteri `basic`'e düşer); varsayılan `ThemeConfig`; "Merkez" şubesi; boş "Ana Menü"; ilk QR; `tenant_created` denetim olayı (aktör = ajans kullanıcısı). `SignupView` bu servise taşınır (mevcut signup testleri yeşil kalır; sihirbaz menüyü ve QR'ı kendisi yaptığından `starter_content=False`, eski deneme davranışı için `open_payments=True` verir). Ajans müşterisi tek dillidir (`supported_locales=[dil]`). Kayıt sihirbazı 5. adımındaki hata (`onboarding/views.py` `qr.slug`; `QRCode`'da `slug` yok) bu işte yanıttaki `slug` işletmenin slug'ı yapılarak (`id` ve `target_url` zaten dönüyor) düzeltilir ve test eklenir.

**4.2 `manage.py create_tenant`:** `--name --slug --owner-email [--owner-name] [--plan basic|pro|orders|ops] [--modules orders,loyalty,ai_pdf,ai_translate,analytics] [--trial-days N] [--locale tr] [--currency TRY] [--json]`. Modül → bayrak eşlemesi: `orders` → `cart_enabled` + `orders_enabled` (mutfak ekranı dahil), `loyalty` → `loyalty_enabled` + `customer_accounts_enabled`, `ai_pdf` → `ai_pdf_import_enabled`, `ai_translate` → `ai_translate_enabled`, `analytics` → `advanced_analytics_enabled`; `payments_enabled` bu işte hiçbir komutla, **hiçbir pakette (ops dahil)** açılmaz. Sonuç kartı: yönetim giriş linki (`PUBLIC_BASE_URL`), e-posta, geçici şifre (bir kez), menü linki.

**4.3 Django admin:**
- Başlık "QR Menü — Ajans Paneli"; tüm `verbose_name`/uygulama etiketleri Türkçe (örn. "Payment settingss" → "Ödeme ayarları"); sol menü grupları: Müşteriler, Siparişler, Plan & Kullanım, Destek.
- `OrganizationAdmin` "Müşteriler" listesi: kolonlar işletme, plan, deneme bitişi (kalan gün), sahip e-postası, durum (aktif/askıda), son 30 gün sipariş sayısı, ürün sayısı, son etkinlik (son sipariş); filtreler plan, askıda, "deneme ≤ 7 gün", modül açık; arama ad/slug/sahip e-postası. Detay sayfası: üyelikler (rol, `is_active`) ve şubeler satır içi; plan + modül bayrakları + deneme tarihleri **salt okunur özet olarak, plan sayfasına bağlantıyla** (düzenleme tek yerde ve denetimli: Plan Ayarları); `locales` ham JSON yerine dil seçimi; kullanım özeti salt okunur. Sertleştirmeler: boş "Ekle" formu kapalı (müşteri yalnız "Yeni müşteri aç" ile açılır), kayıtlı müşterinin `slug`'ı salt okunur, toplu silme yok, plan satırı silinemez.
- **"Yeni müşteri aç"** özel admin görünümü (`OrganizationAdmin.get_urls`): form alanları işletme adı, slug, sahip adı + e-posta, plan, modüller, deneme günü, dil/para birimi → `provision_tenant`; sonuç kartı §4.2 ile aynı (geçici şifre yalnız bir kez ekranda).
- Eylemler: Askıya al / Yeniden etkinleştir (`is_active`, §3.3 sonuçlarıyla; **askıya alma herkese açık menüyü de kapatır**, onay sorulur), Denemeyi 7 / 14 / 30 gün uzat (yalnız `basic`; diğer paketlerde "paketi değiştirin"), Sahibin şifresini sıfırla (onay sorulur; geçici şifre bir kez), plan değişimi (`PlanSettings` kaydı `update_plan_settings` servisinden geçer: bayraklar plana eşitlenir + denetim olayı).
- Salt okunur kayıtlar: `AuditEvent`, `MediaAsset`, `MenuViewEvent`. `AuditEvent.organization` `null=True, on_delete=SET_NULL` + `organization_label` (ad + slug anlık görüntüsü; mevcut satırlar veri göçüyle doldurulur) — işletme silinse de ajans eylemleri kalır (**not:** işletme silme bu iş öncesinde `FOREIGN KEY constraint failed` ile çöküyordu; onarıldı ve işletmenin çocukları tek tek olay yazmaz). Ajans eylemleri `record_event` ile aktör = `request.user` yazar.
- Ajans personeli hesabı: `manage.py createsuperuser` (süper kullanıcı = platform yöneticisi; Django admin'e girer ve tüm işletmeleri görür).
- `docs/AGENCY_RUNBOOK.md` (Türkçe): müşteri açma, askıya alma, deneme uzatma, şifre sıfırlama, günlük `expire_trials` cron'u, `/django-admin/` için Caddy IP izni veya ek parola örneği, yedekleme kontrol listesi.

**4.4 Plan aşamasında bulunan sapmalar ve eklemeler (2026-10-05, ayrıntı: `PLAN_DILIM2_AJANS_2026-10-05.md`)**

1. `--plan` dört paket (`orders` dahil); deneme yalnız `basic` ve modülsüz müşteriye; `payments_enabled` ops'ta bile kapalı.
2. `provision_tenant` ek parametreleri: `starter_content`, `open_payments`, `source`.
3. Türkçe etiketler: model adları dört etiket-yalnız migrasyonla (`AlterModelOptions`), gruplar `AgencyAdminSite` ile; ana ekranların (Müşteriler, Plan Ayarları, Üyelikler, Kullanıcılar, Denetim olayları, Medya, Menü görüntülenmeleri, Kullanım sayaçları) liste başlıkları, süzgeçleri, salt okunur etiketleri ve denetim kaydının sözcükleri `TurkishLabelsMixin` ile Türkçe (alan başına migrasyon gerekmez); eski sprintlerin ekranları Django varsayılanında kalır. İşletmelerin müşteri hesapları "Müşteri hesapları" olur (ajansın "Müşteriler" grubuyla karışmasın).
4. `/me` `access_state` (`ok | suspended | no_membership`) ve askıdaki / işletmesiz hesap için çıkış düğmeli ekran (Dilim 1'deki "işletmeye bağlı değil" ekranındaki çıkışsız döngüyü de kapatır).
5. Yolda bulunan gerçek hatalar: işletme silme çökmesi (T2), kayıt sihirbazı 5. adım 500'ü (T4), eski oturum çerezinde `/login` ↔ `/admin` sonsuz yönlendirme (T14; ajansın sıfırladığı şifre bunu tetikler).
6. Sertleştirmeler: boş "Ekle" formu kapalı, `slug` salt okunur, toplu silme yok, plan satırı silinemez. Müşteri panelden silinebilir (salt okunur kayıtların koruması yalnız müşterinin silme sayfasında kalkar); **siparişi olan müşteri silinemez** (`Order.organization` PROTECT), askıya alınır. Canlı denemede bulundu ve düzeltildi (PR açıldıktan sonra eklenen T15-T16).

## 5. Dilim 3 — Mutfak ekranı (≈ 7-9 gün)

**5.1 Pano:** üç sütun **Yeni** (`pending`) · **Hazırlanıyor** (`confirmed` + `preparing`) · **Hazır** (`ready`). Teslim edilen/iptal edilenler panodan çıkar (geçmiş Siparişler sayfasında). Yeni uç `GET /api/v1/admin/kitchen/board` (`urls_kitchen.py`; mevcut `GET /api/v1/admin/kitchen/tickets` ve testleri kalır, panodan artık çağrılmaz): kuruluş süzgeçli, en fazla 100 kart, `placed_at` artan; yanıt `columns`, `counts`, `server_time`; yerel gün öncesi açık siparişlere `is_stale=true` ("dünden" etiketi). Kart yükü: `id`, `order_number`, `daily_seq`, `status`, `table_number`, `customer_name`, `order_notes`, `age_seconds`, `items[{name, quantity, notes, allergens}]`; **müşteri telefonu panoda yok**.

**5.2 Dokunuşlar** (mevcut `POST /api/v1/admin/orders/<id>/status`, gövde `{"status": "<hedef durum>"}`, genişler; hedef `preparing|ready|delivered|cancelled`, iptalde ek `cancel_reason`): Yeni → "Hazırlamaya başla" (`pending → confirmed → preparing` tek çağrıda, iki denetim olayı); Hazırlanıyor → "Hazır"; Hazır → "Teslim edildi"; Yeni/Hazırlanıyor → "İptal" (onay penceresi + `cancel_reason ∈ {out_of_stock, kitchen_busy, other}`; `Order.cancel_reason` eklenir ve müşteri onay sayfasında Türkçe etiketle görünür). Geçişler `select_for_update()` ile satır kilitli; hedef durum zaten aktüel durumsa **idempotent 200**; geçersiz geçiş 409 ve Türkçe mesaj (Python liste metni yok). Düğmeler istek sürerken pasif.

**5.3 Kart ve veri:** ürün başına isteğe bağlı not (sepet satırına ≤ 120 karakterlik alan; `updateNotes` bağlanır); `OrderItem.allergens` (JSON, sipariş anında üründen kopyalanan alerjen adları; eklemeli migrasyon); büyük masa no, kısa sipariş no (`#daily_seq`), canlı geçen süre (10 dk sarı, 20 dk kırmızı), sipariş notu, ürün notları, alerjen etiketleri.

**5.4 Numaralandırma:** `order_number` biçimi (`XX-YYYYMMDD-NNN`) ve **küresel benzersizliği** korunur; `NNN`, tek `OrderCounter(scope, key, day, last_value)` tablosundan kilitli satırla (`select_for_update`) alınır: `scope="prefix"`, `key=<XX>`, `day=<yerel gün>`; bugünkü `count()+1` ve atomik blok içi yeniden deneme kalkar. `Order.daily_seq` aynı tablodan `scope="org"`, `key=<kuruluş id>` ile gelir (kuruluş + yerel gün bazında 1, 2, 3…). Gün = `Europe/Istanbul` yerel günü.

**5.5 İstemci (`KitchenBoard`):** `router.refresh` yerine istemci tarafı `fetch` ile 5 sn yoklama (`useBoardPolling`: 8 sn zaman aşımı, art arda hatada seyrelen deneme, `online`/`visibilitychange`'de anında yenileme); hatada **son iyi veri kalır**, üstte "Bağlantı yok · son güncelleme SS:DD" şeridi; "Servisi başlat" tek dokunuşta tekrarlayan yeni sipariş sesi (Web Audio ile üretilen kısa zil; karta dokunana kadar), `navigator.wakeLock` ve tam ekran; "Sessiz" düğmesi; yalnız yeni kartlar vurgulanır; kapsamlı koyu yüksek kontrast palet yalnız mutfak kökünde (`.kitchen-dark` CSS değişkenleri, küresel koyu mod yok); dokunma hedefleri ≥ 48 px, yazı ≥ 16 px; "anlık bildirim" metni kalkar.

**5.6 Mutfak rolü:** `kitchen` kullanıcısı girişte doğrudan `/admin/kitchen`'e düşer; admin layout rolü görünce yan menüsüz `KitchenShell` (işletme adı, saat, bağlantı durumu, Çıkış) çizer; yalnız pano + durum uçları açıktır (§3.1). Her tablet kendi hesabını kullanır; denetim olayında gerçek aktör görünür.

**5.7 Testler:** backend: durum makinesi (kilit, idempotency, çift geçiş, iptal nedeni), pano sorgusu (yalnız aktif, sınır, `is_stale`, kuruluş izolasyonu, telefon yok), sayaçlar (eşzamanlı üretim), alerjen kopyası; frontend: `useBoardPolling` ve yaş rengi birim testleri; Playwright: §2'nin 5-6 ve 8. adımları (çevrimdışı simülasyonu dahil).

**5.8 Plan aşamasında bulunan sapmalar ve eklemeler (2026-10-05, ayrıntı: `PLAN_DILIM3_MUTFAK_2026-10-05.md`)**

1. `confirmed` doğrudan hâlâ geçerli (sipariş sayfasındaki "Onayla"); "Hazırlamaya başla" `preparing` ister, sunucu `confirmed` üzerinden iki adımı tek çağrıda yapar. Geçersiz geçiş 409 + Türkçe cümle; hedef zaten mevcutsa sessiz 200.
2. **İptal nedeni her yerde zorunlu:** mutfak ekranı ve sahibin sipariş ayrıntı sayfası aynı iptal penceresini kullanır (sipariş sayfasının nedensiz iptali kayıt sonunda bulunan bir gerilemeydi, T13). Sipariş sayfası nedeni gösterir.
3. Sayaç satırı bir gün için ilk kez oluşurken o günkü en yüksek eski sonekten başlar (sayaçtan önceki siparişlerle çakışma yok); eski siparişlerde `daily_seq` boş, pano tam numarayı gösterir.
4. **Bağlantı durumu panoda:** başlıkta "Canlı · son güncelleme SS:DD:SS" satırı ve bağlantı kopunca üstte şerit (donmuş ekran ile sakin mutfak ayırt edilir); `KitchenShell` işletme adı, saat ve "Çıkış yap" taşır. Kabuk yalnız `kitchen` rolüne verilir; sahip ve personel mutfak sayfasını normal kabukta koyu panel olarak görür.
5. Eklemeler: "Servisi bitir"; oturum bitti (401/403) şeridi ve "Yeniden giriş yap"; ürün notu sayacı (≥ 100 karakter). `useBoardPolling` = çerçeve bağımsız `BoardPoller` (birim testli) + ince React kancası.
6. Eski `GET /api/v1/admin/kitchen/tickets` ve testleri kalır; ön yüzdeki kullanılmayan istemcisi kaldırıldı.
7. **Kurulum eksiği:** `seed_demo` alerjen referans tablosu boşsa alerjenleri sessizce atlıyor ve `seed_allergens_tags` komutunu hiçbir belge söylemiyordu; tarayıcı düzeneği komutu önce çalıştırır, `DEPLOYMENT.md` §3.1 ve `docs/KITCHEN_GUIDE.md` adımı içerir.
8. "Yüksek kontrast" sayıya bağlandı: metin renklerinin hepsi AAA (7:1), `kitchen-theme.test.ts` gerçek stil dosyasını okur. Dokunma hedefi ≥ 48 px ve yazı ≥ 16 px sınıf düzeyinde testle zorlanır.
9. Müşteri onay sayfası yalnız iptal nedenini ekler ("Neden: ..."); sepet satırında ≤ 120 karakterlik not alanı (`CartLineNote`).
10. Yolda bulunan gerçek hatalar: sipariş sayfasının nedensiz iptali (T13), uzun masa adının sipariş numarasını sıkıştırması (tarayıcı akışı), ürün notu sayacının alan adına karışması (birim testi).
11. **Gece yarısına duyarlı iki test:** plan 00:00'dan sonra yürütülürken tabandaki `test_overview_daily_aggregation` (UTC tarihi ile yerel gün karışıyordu; depodan gelen test hatası, ürün doğru) ve benim `is_stale` testlerim (gece yarısından sonraki ilk dakikalarda yanlış) kırmızıydı. İlki ayrı bir test commit'i (`T0`), ikincisi T4'ün testleri (saat öğlene sabitlendi).

## 6. Dilim 4 — İşletme paneli cilası (≈ 2 gün)

- Kayıt kapalı bildirimi (§3.5 ile) ve sihirbazın bilinen kusurlarının (F-36: adım 2 dil/para birimi gönderilmez, adım 5 CSRF başlığı, `onboarding/complete` idempotent değil) **ertelendiğinin** `docs/` altına yazılması.
- `AdminApiError` `extra`/`code` alanını korur; ortak `UpgradeNotice` 402/403'ü Türkçe gösterir ("Bu özellik planınıza dahil değil, açtırmak için ajansınıza yazın"); yan menü planda kapalı modülleri gizler (PDF Import, Sadakat, Mutfak, Siparişler bayraklara göre); sunucu tarafında mutfak ve sipariş **admin** uçları `orders_enabled` ister (403 `billing.feature_disabled`) - Dilim 1'den buraya taşındı.
- Hijyen: admin ürün listesinde tek "Yeni ürün" düğmesi; destek adresi `SUPPORT_EMAIL` ortam değişkeninden (bugünkü `support@qr-menu.local` kalkar); admin ekranlarının taranıp bulunan İngilizce kalıntılarının Türkçeleştirilmesi (yeni özellik yok).

## 7. Kapsam dışı (bilerek yapılmayanlar)

Herkese açık kayıt ve sihirbaz düzeltmeleri · abonelik/ödeme · e-posta gönderimi (şifre sıfırlama elle) · AI/PDF/çeviri (pilotta müşteri bazında kapalı; F-11 kota/zaman aşımı çözülmeden açılmaz) · sadakat (pilotta kapalı; açmadan önce F-10 `loyalty-adjust` sızıntısı ve F-41 puan harcama hatası) · çok şubeli mutfak/istasyon yönlendirme (`Order.branch` bu işte doldurulmaz) · fiş yazıcısı, ürün seçenekleri/ekstralar, gün sayacı, sipariş düzenleme, iade, tahmini süre/SMS · "kullanıcı olarak gör", 2FA · yumuşak silme altyapısı · KVKK paneli · canlıya alma altyapısı (sunucu, alan adı, TLS, yedekleme kurulumu: sahibin; bu işte yalnız rehber + doğrulama betiği).

## 8. Teslim ve riskler

- **Sıra ve bağımlılık:** 1 → 2 → 3 → 4 (2, 1'in geçici şifre/şifre değiştirme/askıya alma işine; 3, 1'in mutfak rolü/rol politikasına ve 2'nin `create_tenant`ine dayanır). Toplam ≈ 18-22 geliştirme günü.
- **Planlama:** her dilim için ayrı uygulama planı yazılır (`writing-plans`); bir dilim merge edildikten sonra sonraki dilimin planı güncel `main`'e göre yeniden doğrulanır.
- **Yol sözleşmesi:** her yeni uç mevcut frontend↔backend yol-sözleşmesi testine eklenir; sondaki `/` uyuşmazlığı (F-02) sınıfı hata geri gelmesin.
- **Çalışma düzeni:** ayrı çalışma ağacı (`git worktree`), dilim başına bir dal (yığılı), PR gövdesi Türkçe özet + test kanıtı + ekran görüntüleri; her dilim sonunda ayrı port'ta çalışan demo ve "nasıl test edersin" notu.
- **Veritabanı:** tüm migrasyonlar eklemeli (`Membership.is_active`, `User.must_change_password`, `OrderItem.allergens`, `Order.cancel_reason`, `Order.daily_seq`, `OrderCounter`, `AuditEvent.organization` nullable + `organization_label`; rol seçeneği yalnız `choices`). Mevcut veri taşınmaz (denetim etiketi geri doldurma hariç).
- **Sahibin yerel Docker yığını:** `git pull` bugün zaten engelli (izlenmeyen boş `backend/apps/payment/migrations/__init__.py` önce silinmeli); çekimden sonra `migrate` + `qrmenu-backend` ve `qrmenu-frontend-dev` yeniden başlatma gerekir (tailwind yapılandırması değişirse dev sunucu yeniden başlar).
- **Risk — plan varsayılanı:** `get_plan_settings()` varsayılanının OPS'tan BASIC'e dönmesi `PlanSettings` satırı olmayan mevcut kiracıları kısıtlar; `seed_demo` demo için OPS satırı oluşturacak şekilde güncellenir, test kurulumları aynı.
- **Risk — doğrulanmamış bulgular:** `READINESS_AUDIT` içindeki [R]/[A] etiketli maddeler her dilimin ilk işinde başarısız test yazılarak yeniden doğrulanır; yanlış çıkan madde yapılmaz, listeden düşülür.
