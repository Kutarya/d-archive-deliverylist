# Invoice Atelier geliştirme ve test günlüğü

## Güncel durum

1.5.2 Android paketi tamamlandı: `release/android/Invoice-Atelier-1.5.2.apk`. Son kabul raporu `release/verification-android-1.5.2.json` içinde `success: true`. Dört kayıt/yeniden deneme hatası giderildi; 80 birim, 8 Android yerel testi ve altı aşamalı çevrimdışı emülatör kabulü geçti. El yazısında belge numarası ve para birimi hâlâ elle kontrol edilmeli. Windows paketi 1.4.1 olarak kaldı; Firebase admin paneli ertelendi. Kullanıcının son isteğiyle ek araştırma durdurulup paketleme tamamlandı. Bu dosya sonraki çalışmada başlangıç noktasıdır.

## Çalışma yöntemi

- Her bulgu için önce tekrar üretme adımı ve beklenen davranış yazılır.
- Mevcut arşivler, kaynak fotoğraflar, kayıt kimlikleri ve Android imzası korunur.
- Küçük düzeltme → ilgili otomatik test → Android emülatöründe gerçek akış → paket doğrulaması sırası izlenir.
- Başarılı ve başarısız sonuçlar ayrı kaydedilir; eski sürümün kanıtı yeni sürüme taşınmaz.
- İngilizce, Çekçe ve Türkçe arayüz/çıktı tercihleri bağımsızdır; varsayılan İngilizcedir.
- Firebase admin paneli kullanıcının önceki isteğiyle ertelendi.

## 21 Ekim 2026 — sistemli inceleme

Başlangıç: Android 1.5.0, sürüm kodu 11. Proje Git deposu değil; değişikliklerden önce kaynak kopyası alınacak.

Doğrulanmış başlangıç raporu: `release/verification-android-1.5.0.json`. Bu rapor yalnızca 1.5.0 paketini kapsar: 65 birim, 8 Android yerel testi; tek Excel sekmesi, dil birleşimleri, dosya penceresinde ekran kurtarma ve veriyi koruyan yükseltme.

### İnceleme sırası ve kabul ölçütleri

| Alan | Araştırılacak durum | Kabul ölçütü | Durum |
| --- | --- | --- | --- |
| Fotoğraf okuma | Bir satır okununca eksik veya tutarsız belgeyi tamamlanmış sayma | Bütün bulunan ürünler geçerli olmalı; yazılı toplam tutmuyorsa iyileştirme denenmeli | Düzeltildi; birim + gerçek OCR tekrar denemesi geçti |
| İşlem sırası | İptal, sıraya yeni fotoğraf ekleme, yeniden başlatma | Sonraki belge ilerlemeli; özgün fotoğraflar kaybolmamalı; aynı anda tek ağır okuma | Düzeltildi; kapanma, PDF, bozuk dosya ve iptal geçti |
| Kayıt güvenilirliği | Okuma sürerken alan düzenleme, başarısız okuma, arşiv güncelleme | Kullanıcının girdiği değerler sessizce kaybolmamalı | Okunan belge düzenlemeye kapalı; sabitleri uygulama, Excel geri alma ve imzalı yükseltmede kaynaklar korundu |
| Excel | Tek sekme, çok belge, farklı para birimleri, yeniden içe alma | Hesaplar ve kimlikler korunmalı; geçersiz veri arşivi değiştirmemeli | Tek sekme, gerçek yerel yazım, 3 dil formülü ve eski dosya/yedek kontrolleri geçti |
| Telefon arayüzü | Dar ekran, hata açıklamaları, durdur/yeniden oku | İşlem durumu ve sonraki adım görünür ve kullanılabilir olmalı | Emülatörde ve kaynak dil testinde geçti; fiziksel cihaz doğrulanmadı |

### Açık sınırlar

- Fiziksel telefon bağlı değil; emülatör kanıtı fiziksel cihaz kabulü sayılmaz.
- Zor el yazısında tam okuma garanti edilmez; örnek sonuçları alan alan karşılaştırılacak.
- Tek sayfa Excel yazdırma ayarı, bağımsız bir yazdırma motorunun sayfa sayımıyla aynı kanıt değildir.

### Oturum durumu

- Mevcut kod ve 1.5.0 kabul raporu okundu.
- İlk aday bulgu: `hasCompleteReading` yalnızca tek geçerli ürün satırı arıyor; diğer satırların eksikliği ve belge toplamıyla uyuşmazlık erken bitişi önlemiyor. Önce testle doğrulanacak.
- Henüz bu oturum için yeni sürüm kabulü veya fiziksel cihaz başarısı iddia edilmedi.

### Tur 1 — erken bitiş ve toplam satırı ayrımı

- Kaynak yedeği: `artifacts/source-before-system-review-1.5.1-20261021/`.
- Erken bitiş için dört yeni test eski kodda başarısız oldu (`artifacts/1.5.1/quality-before.log`). Tüm bulunan satırların doğrulanması ve yazılı toplamın karşılaştırılması eklendi. Kullanılabilir satırlarla uyumlu toplam, ek sayısal gürültüden daha yüksek puan alıyor.
- İkinci tekrar üretilebilir hata: genel toplamın ardından gelen `Total VAT` / `Total discount` satırları belge toplamını değiştirebiliyordu. İki yeni test eski kodda başarısız oldu (`total-label-before.log`). Vergi/indirim/net özetleri ayrıldı; açık ödenecek toplam genel `Total` etiketinden önce seçiliyor. İngilizce, Çekçe ve Türkçe örnekler kapsanıyor.
- Yeni çalışma sürümü: 1.5.1 / Android kodu 12. 71/71 birim testi ve TypeScript/Vite/Capacitor derlemesi geçti. Bu aşamada APK kabulü henüz tamamlanmadı.
- [Google ML Kit Android kılavuzu](https://developers.google.com/ml-kit/vision/text-recognition/v2/android): çözünürlük, odak ve yön bilgisi okuma kalitesini etkiliyor. Araştırmadan çıkarım: tek bir dolu satır, bütün belgenin doğru okunduğunun kanıtı olamaz. Bu nedenle mevcut yerel okuyucu korunup tamamlanma ölçütü iyileştirildi; kütüphane sürümü gelişigüzel yükseltilmedi.

### Tur 2 — çoklu fotoğrafın kalıcı kuyruğu

- Emülatörde hata tekrar üretildi: üç fotoğraf seçildi, ilk fotoğrafın gerçek yerel okuma sonucuna test amaçlı gecikme eklendi, uygulama işlemi kapatılıp yeniden açıldı. Kalıcı arşivde yalnızca ilk fotoğraf vardı; diğer iki seçim geri gelmedi. Kanıt: `artifacts/1.5.1/batch-before.json`, `batch-before-batch-fix.png`.
- Neden: Android içe alma döngüsü, sonraki fotoğrafı kaydetmeden önce önceki fotoğrafın bütün okumasını bekliyordu. Seçimin kalan kısmı yalnızca JavaScript belleğindeydi.
- Düzeltme: seçilen grubun fotoğrafları önce tek tek kalıcı bekleyen belgelere çevriliyor; ardından okuma sırası başlıyor. Yeni bir seçim gelirse okuyucu mevcut işini bitirdikten sonra hazırlama işine sıra veriyor. Ağır resim hazırlama ve okuma aynı seri işlem kuyruğunu kullanmaya devam ediyor.
- Kabul: ilk yerel OCR çağrısından önce seçilen üç kaynak da diskte olmalı; işlem kapanınca üçü de sırayla yeniden okunmalı. Son APK'da bu kabul geçti (`batch-restart.json`).

### Tur 3 — gerçek el yazısı ve tekrar çalıştırılabilir kabul

- İlk düzeltilmiş APK'da kapanma kabulü geçti: üç kaynak da diskteydi ve yeniden açılışta EN-26001, CZ-26002, TR-26003 sırasıyla döndü.
- Genişletilmiş gerçek OCR testinde sekiz basılı kaynak (EN/CS/TR, indirim/KDV, tam tutar, 90° dönüş, düşük kontrast, sonradan gelen vergi özeti), iki sayfalı PDF, tekrar seçim, bozuk dosya, durdurma ve sonraki belgeye geçme doğrulandı. Bir native miktar sonucuna kontrollü hata eklenince ikinci gerçek okuma doğru miktarı geri getirdi. Bu, OCR başarısı ile hata enjeksiyonunun ayrı kaydıdır.
- Verilen gerçek el yazılı fotoğraf ilk turda başarısızdı: numara `6. 1024`, para birimi TRY, ürün değerleri boş. Tam sonuç `system-ocr-before-layout.json` içinde; başarı diye kaydedilmedi.
- Kök nedenlerden biri: geliştirilmiş okuyucu `Množství` başlığını `Mnostv`, belge başlığını `DODACI LST is:` okuyunca mevcut dar başlık eşlemesi tabloyu/numara alanını bulamıyordu. Bu iki harf kaybı için iki test eski kodda başarısız oldu. Başlık tanıma düzeltildi; birleşik `2003,00600` sözcüğünden değer uydurmak yerine hücrelerin ayrı resim kırpımlarının okunması korunuyor.
- 73/73 birim testi geçti. Yeni başlık düzeltmesinin yeni APK'da ölçülen sonuçları aşağıda.
- Test hazırlığına ilişkin düzeltmeler: test verisi uygulama kapalıyken yerleştirilmeli (otomatik kayıt eski belleği geri yazabilir); tamamlanma kontrolü diskteki durum ile ekrandaki kuyruğu birlikte beklemeli; Türkçe ı/i karşılaştırması yalnızca test karşılaştırmasında normalize edilir, kaynak içerik değiştirilmez.
- Tek sıralı giriş noktası: `npm run test:android:system`. Yalnızca özel `-read-only` emülatörde çalışır; kurulu APK özeti `tested-debug.apk` ile aynı olmalı. Kilit dosyası aynı emülatörün eşzamanlı iki test tarafından kullanılmasını engeller. `-- --resume`, sadece aynı APK baytlarına ait başarılı raporları yeniden kullanır.

### Tekrar çalıştırma sırası

1. `npm test`, `npm run sync:android`, mevcut imzayı kullanan Gradle QA/üretim derlemesi.
2. Özel Android emülatörünü ağ kapalı aç; yeni debug APK'yı kur; test APK'sının kopyasını `artifacts/<sürüm>/tested-debug.apk` olarak sakla.
3. `npm run test:android:system`: kapanma, OCR, ayarlar/diller/Excel, dosya penceresinde ekran kurtarma, Android yerel testleri. Aynı cihazda başka kabul betiği çalıştırma.
4. İmzalı önceki sürümden yeni APK'ya yükseltme ve gerçek yedek dışa aktarma.
5. Masaüstü kaynakta 9 dil birleşimi ve eski dosya/yedek akışları; bağımsız Excel formül hesaplamaları.
6. `node scripts/verify-single-sheet-release.cjs`: sürüm, bütün raporlar, APK baytları, imza ve tek Excel sekmesini birlikte doğrular.

### Gerçek el yazılı kaynakta ölçülen değişim

| Alan | Başlık düzeltmesinden önce | Son APK'da | Referans / sonuç |
| --- | --- | --- | --- |
| Ürün | Boş | WOLL SOCKS | Doğru okundu |
| Miktar | Boş | 200 | Doğru okundu |
| Birim fiyat | Boş | 3.00 | Doğru okundu |
| Belge numarası | 6. 1024 | 16.10.20 | 16.10.26 olmalı; elle düzeltme gerekli |
| Para birimi | TRY | TRY | EUR olmalı; elle düzeltme gerekli |

Bu nedenle el yazılı belgenin tam okuma kabulü **başarısız/kısmi** tutuldu (`handwriting.matchesReference: false`). Formülden veya bilinen örnekten belge numarası/para birimi uydurulmadı. Kaynak fotoğraf korundu.

### Son Android turu

- `artifacts/1.5.1/mobile-system.json`: beş aşama başarılı; önceki APK'nın raporları kullanılmadan tamamı yeni APK'da çalıştı.
- Debug APK SHA-256: `2792a8d2fd6c467c5bffc29b900982749c240e51878f02f93bfff559950d3222`.
- 8/8 Android yerel testi, üç fotoğrafın kapanma sonrası korunması, 8 basılı OCR örneği, PDF/iptal/bozuk dosya, 9 ayar dili birleşimi, tek sekmeli gerçek dosya dışa aktarma ve dosya penceresinde zorla ekran sonlandırma/kurtarma geçti.
- Excel dosyasının SHA-256 değeri bekleyen yerel aktarımın baytlarıyla eşleştiriliyor; eski indirme dosyasının yanlışlıkla başarı kanıtı sayılması önlendi.
- İmzalı 1.5.0 → 1.5.1 yükseltme ve gerçek yedek aktarımı geçti; 2 arşiv belgesi ve 2 bekleyen belge, kaynaklar, kimlikler, dil tercihleri ve sabitler korundu. Uygulama işlemi çökmesi: 0.
- Masaüstü kaynakta 9 arayüz/çıktı dil birleşimi ve 6 eski Excel/yedek kontrolü geçti. Üç dilde bağımsız hesap: miktar 3 → 6 olduğunda satır/belge/para birimi toplamı 410.01 → 820.02; geri alınca ilk toplam döndü.
- Son paket doğrulaması başarılı: 73 birim, 8 yerel test; raporların sürümü ve APK özetleri; paket içindeki bütün web varlıkları; aynı Android sertifikası; uygulama kimliği; kod 12 / sürüm 1.5.1; üretimde debug kapalı; gerçek tek Excel sekmesi ve yazdırma ayarı.
- Bağımsız resim önizleyici tarih hücresini seri sayı olarak gösterebildi. XLSX'te tarih tipi ve `dd.mm.yyyy` biçimi ile uygulama önizlemesi doğrulandı; bağımsız Excel/LibreOffice ekran/baskı kabulü yapılmadı. Bu önizleyici sınırı ürünün gerçek Excel render başarısı sayılmadı.

### Sonraki çalışma için açık işler

- Öncelik: el yazısındaki 0/6 ayrımı ve kaybolan EUR harfleri. Yeni örneklerle doğrulanmadan dar bir fotoğrafa özel sayı/para birimi düzeltmesi ekleme.
- Fiziksel Android telefonda kendi kamerasından çekim, uzun fotoğraf grubu ve ekran kapatıp açma kabulü.
- Excel/LibreOffice bulunursa gerçek yazdırma motoruyla tek sayfa ve yerel tarih/sayı görünümü kabulü.
- Android dışındaki 1.4.1 Windows paketi henüz bu kaynak değişiklikleriyle yenilenmedi.
- Son emülatör düzgün kapatıldı; test arşivleri ve kaynak yedeği silinmedi.

## 21 Ekim 2026 — 1.5.2 kayıt hatası incelemesi

- Kullanıcının devam isteğiyle 1.5.1 üzerinden yeni tur başlatıldı. Kaynak yedeği: `artifacts/source-before-save-recovery-1.5.2-20261021/`.
- Öncelik bu turda kayıt başarısızlığı: sabit ayarlar, arşiv düzenleme, onaylayıp arşivleme ve yeniden okuma.
- Kod incelemesindeki aday hatalar: ayarlar diske yazılmadan bellekte değiştiği için başarısız kayıttan sonra yeniden deneme düğmesi kapanabilir; arşiv düzenlemesinin sürüm damgası kaydetme hatasında değişip sonraki denemeyle çakışabilir; yeniden okuma isteği kaydedilemezse belge okuma listesinde takılı kalabilir.
- Başlangıçta bu adayların emülatörde tekrar üretilmesi planlandı. Aşağıdaki sonuçlarda yerel kayıt çağrısı kontrollü olarak reddedildi; gerçek disk dolumu veya kullanıcının dosyaları üzerinde hata oluşturulmadı.

### Hataların tekrar üretimi ve onarım

- `artifacts/1.5.2/storage-before.json`: önceki 1.5.1 APK'sında dört adayın dördü tekrar üretildi. Bu dosyanın sürümü bilerek 1.5.1'dir; yeni sürüm kabulü değildir. Yeniden okumada yakalanmamış kayıt hatası da görüldü.
- Ortak `store-transaction.ts`: başarısız açık kayıt işleminin dokunduğu kayıtları geri alır; bu sırada başka belgede veya dil tercihinde yapılan daha yeni işi korur. Geri alınmış durum, sırada önceden bekleyen otomatik kayıtların arkasına yazılır. Arşivleme/düzenleme, sabitler, Excel/yedek içe alma, yeniden adlandırma ve arşiv silme bu mekanizmayı kullanır.
- Sabit bilgi formu kayıt başarısızlığında yazılmış ama kaydedilmemiş alanları sıfırlamaz; yeniden deneme düğmesi kullanılabilir kalır.
- Yeniden okuma, ancak bekleyen durum diske yazıldıktan sonra okuma kuyruğuna girer. Kayıt hatası arayüzde yakalanır; belge sahte bir okuma durumunda kilitlenmez.
- Yeni fotoğraf yakalama/ekleme ve normal alan düzenlemelerinin mevcut otomatik kayıt davranışı korundu. Kaydedilemeyen yeni bir kamera fotoğrafını bellekten geri alıp kaybetmemek için bu akışlar arşiv işlemi gibi silinmedi.
- Yedi yeni birim testi; eşzamanlı başka fotoğraf ekleme, daha yeni kayıt değişikliği, geri alma yazısının da reddedilmesi, kaynak koruma, sıralama ve geçersiz işlem durumlarını kapsıyor. Toplam 80/80 birim testi geçti. Yeni APK'nın tamamlanan emülatör kabulü aşağıda.

## 22 Ekim 2026 — 1.5.2 son kabul ve teslim

- Kullanıcının “kalan işini bitir ve build al artık” isteğiyle yeni özellik/araştırma eklenmeden kalan kabul ve Android paketleme tamamlandı. `npm run sync:android`, TypeScript/Vite, imzalı üretim APK'sı, QA APK'sı ve Android test APK'sı derlendi.
- `artifacts/1.5.2/storage-before.json`: önceki 1.5.1 APK'sında dört hata tekrar üretildi. `storage-recovery.json`: son 1.5.2 APK'sında sabit bilgi kaydı, arşiv düzenleme, onaylama ve yeniden okuma hatalarının dördü de düzeldi; başarısız kayıttan sonra aynı işlem yeniden denenebildi. Kaynak fotoğraflar ve kimlikler korundu; yakalanmamış JavaScript hatası yok.
- İlk sistem denemesi, emülatör açılışında mobil veri yeniden etkinleştiği için çevrimdışı önkoşulda durdu. Hazırlık betiği Wi-Fi ve mobil veriyi açıkça kapatıp her aşamada doğrulayacak şekilde düzeltildi. Son altı aşamanın tamamı son APK'da yeniden çalıştırıldı; eski kabul raporları kullanılmadı (`reusedExactApk: false`).
- `mobile-system.json`: kayıt kurtarma → fotoğraf grubunun kapanma sonrası devamı → gerçek OCR → sabitler/diller/Excel → yerel dosya aktarımı sırasında ekran kurtarma → Android yerel testleri; altı aşama başarılı ve çevrimdışı.
- Üç kaynak fotoğraf ilk okumadan önce saklandı, zorla kapatıp açınca sıra korundu. Sekiz basılı fotoğraf, iki sayfalı PDF, iptal/bozuk dosya sonrası ilerleme ve yanlış miktarın ikinci gerçek okumayla düzelmesi geçti. Ağır OCR aynı anda tek iş çalıştırdı; bitişte aktif okuyucu kalmadı.
- 80/80 birim ve 8/8 Android yerel testi geçti. Arayüz/çıktı dillerinin dokuz birleşimi, altı eski Excel/yedek akışı, gerçek Android dosya aktarımı ve üç dilde bağımsız formül hesapları geçti. Miktar 3 → 6 değişince satır/belge/para birimi toplamları 410.01 → 820.02 oldu; eski miktara dönünce toplamlar geri döndü.
- İmzalı 1.5.1 → 1.5.2 yükseltme geçti: iki arşiv belgesi, iki bekleyen belge, fotoğraflar, kimlikler, düzenlemeler, sabitler ve bağımsız dil ayarları gerçek Android yedek dışa aktarımıyla birebir eşleşti. Üretim APK'sında galeri açma/iptal geçti; uygulama işlemi çökmesi 0.
- Son paket doğrulaması: `release/verification-android-1.5.2.json`, `success: true`. 38 web varlığı iki APK ile eşleşti; eski Android imzası ve uygulama kimliği korundu; kod 13 / sürüm 1.5.2; üretimde debug kapalı. Gerçek dışa aktarılan Excel tek sekmeli ve yazdırma genişlik/yükseklik ayarı 1/1.
- Üretim APK'sı: `release/android/Invoice-Atelier-1.5.2.apk`, 116873817 bayt. SHA-256: `6d3c3dfb2bfa87d1725dfc6eae22526dbc639f0d2927c203c12c977e6adf4026`. Test debug APK SHA-256: `d51bcdbb5c9a64cb27a94eb8f81670c7cc6d9ae49d1999a089aaa174942a18e6`.
- Gerçek el yazılı kaynak bu sürümde de kısmi: WOLL SOCKS / 200 / 3.00 doğru; belge numarası 16.10.20 (referans 16.10.26), para birimi TRY (referans EUR). Tam okuma kabulü verilmedi. Fiziksel telefon kamerası ve bağımsız Excel/LibreOffice baskı motoru test edilmedi; uzun arşiv tek basılı sayfaya sığarken küçülür.
- Özel salt okunur emülatör düzgün kapatıldı; test kanıtları, kaynak yedeği, eski paketler ve imza anahtarları korundu. Yeni fotoğraf/alan otomatik kaydının davranışı korundu; diske yazılamayan yeni fotoğraf bellekten silinmez. Windows 1.4.1 ve ertelenen Firebase admin paneli bu teslimin dışında kaldı.
