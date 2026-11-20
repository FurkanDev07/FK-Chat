# FK Sohbet — kurtarma ve test raporu

**Tarih:** 20 Kasım 2026
**Sonuç:** Kısmi kurtarma ve deneysel derleme; yayın için hazır değil.

## Son güncelleme: arayüz metinlerinin sadeleştirilmesi

Ana ekran ve ayarlardaki bazı açıklamalar kısaltıldı; sohbet gizlilik bilgisi ve hata/güvenlik uyarıları korundu. Türkçe metinlerin değişen bölümleri için İngilizce önizleme karşılıkları eklendi. Ekran görüntüleri tarayıcı önizlemesinden yeniden alındı; cihaz testi değildir. Android debug APK ve Windows EXE yeniden derlendi. `npm test` ile **6 sınırlı test geçti**; bunlardan biri yeni metinler ile gizlilik açıklamalarının iki dildeki temel davranışını kontrol eder. Uygulamanın gerçek cihazda çalışması ve eksiksiz İngilizce desteği hâlâ doğrulanmadı.

Güncel deneme dosyaları SHA-256:

- Android APK: `08dfe2b58b54239fcfef0dfffa6e9dff5336e6aad3ab8aba3c06b00f358d2a06`
- Windows EXE: `fbfb13c022b74d1ea142b7afff0bcd7b4398db61662618b30596890bcc32d2d6`

Aşağıdaki orijinal rapordaki derleme dosyası hash'leri ve beş test sonucu **önceki derlemeye aittir**.

## Kaynaklar ve yaklaşım

Google Drive'daki Android ve PC kaynak ZIP'leri kullanıldı. Orijinal projeler değil, büyük ölçüde geri çıkarılmış kaynaklar içeriyorlar. Bu çalışma mevcut kodu temel alır; uygulama sıfırdan yazılmadı. Özgün proje ve işlevler ile birebir eşdeğerlik henüz doğrulanamadı.

## Somut değişiklikler

- Android için Gradle 8.7 / Android Gradle Plugin 8.5.2 proje yapısı oluşturuldu; mevcut manifest, kaynaklar ve Java/web dosyaları kullanıldı.
- `CallService.startCall()` için kaynak arşivinde bırakılmış decompiler komut dökümüne dayanılarak kod yeniden kuruldu. Derleme geçiyor, ama mikrofon foreground service davranışı ve orijinal sürümle eşdeğerliği gerçek cihazda test edilmedi.
- Android Java kaynaklarındaki sentetik callback başvuruları ve derlenemeyen yakalama değişkenleri düzeltildi.
- Windows projesine WebView2 DLL referans yolları ve .NET Framework 4.8 referans paketi eklendi; derleyicinin kabul etmediği bir enum karşılaştırması sayısal tipe dönüştürüldü.
- Ortak arayüze deneysel dil seçicisi ve 143 statik çeviri girdisi eklendi; tercih tarayıcı depolamasında saklanıyor. Dinamik JS mesajları, yerel Android bildirimleri ve Windows menü/hataları kapsamlı şekilde çevrilmedi. Bazı dinamik arayüz güncellemeleri statik çevirileri değiştirebilir. Bu nedenle **İngilizce desteği tamamlanmış değildir**.
- Sınırlı otomatik testler, İngilizce README, CHANGELOG, yapılandırma envanteri ve `.gitignore` eklendi. Özgün proje lisansı tespit edilemediğinden yeni lisans seçilmedi.

## Ek bulgu: Drive'daki eski Android APK

Drive'daki mevcut `FK Sohbet.apk` indirildi ve `classes.dex` üzerinde statik `dexdump` incelemesi yapıldı. Bu APK'nın `CallService.startCall()` yöntemi de doğrudan `UnsupportedOperationException` fırlatan yer tutucuyu içeriyor. Bu, yalnızca kaynak ZIP'teki bir görüntüleme sorunu değil; incelenen eski APK'da da mevcut. Gerçek cihazda tetiklenmesi ve kullanıcıya etkisi test edilmedi. Uygulama paketlerinin diğer bölümlerinde de geri çıkarma kaynaklı hatalar olabilir.

Ayrıca Android köprüsündeki `readUri` yöntemi geri çıkarılmış kaynakta normal akışı güvenilir biçimde okumuyor. Web JS içinde bu yöntemin çağrısı bu incelemede bulunmadı; kullanılmadığı veya güvenli olduğu kesinleşmiş değildir. Onarımı ve cihaz üzerinde dosya akışı testi sonraya bırakıldı.

## Derleme sonuçları

| Platform | İşlem | Sonuç |
|---|---|---|
| Android | JDK 17, Android SDK 34, `./gradlew assembleDebug` | **Başarılı.** Debug imzalı APK oluşturuldu. Java deprecated/unchecked uyarıları var. |
| Windows | .NET SDK 10 ile `dotnet build -c Release -p:EnableWindowsTargeting=true` | **Başarılı.** net48 EXE ve yapılandırma dosyası oluşturuldu; 7 adet CS0649 uyarısı var. |
| Android imzası | `apksigner verify --print-certs` | APK imzası doğrulandı, ancak Android Debug sertifikası kullanıldı. Orijinal APK sertifikasından farklıdır. |
| Paket içeriği | APK dosya listesi ve Windows EXE kaynak adı incelemesi | İki derlemede deneysel `i18n-preview.js` bulundu; APK içindeki dosya hash'i kaynak ile aynı. |

**APK mevcut uygulamanın üstüne güncelleme olarak kurulamaz** çünkü imza farklı. Eskisini kaldırmak yerel verileri silebilir; bu nedenle yedekleme yapılmadan denenmemeli. Debug APK dağıtım veya gerçek kullanım için uygun değildir. Windows çıktısı da .NET Framework 4.8 ve WebView2 Runtime gerektirir; self-contained değildir.

### Deneysel dosyaların SHA-256 değerleri

- `artifacts/FK-Chat-Android-DEBUG-UNTESTED.apk`: `c97f07dec8dd32333a65e7e3ae994695f77c5a4f7f4b1d6b628818a04aa6d045`
- `artifacts/windows/FK Sohbet.exe`: `e9430cf0f3631f596e689cb983963e72ab53b030f8f0fe0e82fe8f167f70d7f1`

## Test sonuçları

- Node.js/jsdom: **5 test başarılı.** Varsayılan Türkçe, seçili statik etiketlerin İngilizceye çevrilmesi ve geri alınması, tercihin localStorage'a yazılması ve yeni DOM ortamında okunması, dinamik içeriğin doğrudan değiştirilmemesi, iki platformun çeviri betiklerinin eşitliği ve Android web betiklerinin jsdom'da temel açılışı sınandı.
- JavaScript sözdizimi: uygulamanın incelenen vendor-dışı JS dosyaları `node --check` kontrolünden geçti.
- `adb devices -l` sonucu: bağlı Android cihaz yok. APK kurulumu, mikrofon, foreground service, ses ve sohbet test edilmedi.
- Windows ortamı mevcut değil. EXE açılışı, WebView2, ses, tepsi, overlay ve uzaktan kontrol test edilmedi.
- İki cihaz arasında bağlantı, dosya aktarımı, TURN/Giphy veya canlı servis testleri yapılmadı.
- Dil tercihi sadece jsdom/localStorage simülasyonunda test edildi; gerçek Android/Windows uygulamasının yeniden başlatılmasında doğrulanmadı. Tüm Türkçe metinlerin korunması veya tüm İngilizce çevirilerin tamamlanması doğrulanmış değil.

## Gizli bilgiler ve yayın

İmzalama anahtar deposu ve şifreleri alınmadı ve bu çalışma paketine eklenmedi. Kaynaklarda sınırlı örüntü taraması (özel anahtar, AWS erişim anahtarı, GitHub token ve Google API anahtarı örüntüleri) eşleşme bulmadı; bu **kapsamlı gizli bilgi veya güvenlik denetimi değildir**. İstemci ayarlarında Giphy ve TURN kimlik bilgileri localStorage'da tutuluyor; OS korumalı şifreli saklama doğrulanmadı.

GitHub bağlayıcısı bu ortamda desteklenmedi. GitHub deposu, Actions ve Releases oluşturulmadı; hiçbir dosya GitHub'a yüklenmedi. Kullanıcıya sunulan çalışma yalnızca yerel deneme paketidir. Açık yayın öncesi kaynak hakları/lisans, sırlar, üçüncü taraf lisansları ve eksik testler değerlendirilmelidir.

## Öncelikli kalan işler

1. Özgün proje veya güvenilir eski sürüm temin etmek; decompiler hatalarını sistematik incelemek ve Android servis/URI akışını cihazda doğrulamak.
2. Dinamik JS metinlerini ve tüm yerel platform metinlerini anahtarlı yerelleştirmeye taşımak; dil değişiminde mevcut arayüzü doğru yenilemek, sohbet/kullanıcı verilerini çevirmemek.
3. Android ve Windows cihazlarda Türkçe/İngilizce tercihini, sesli görüşmeyi, bağlantıları, dosya aktarımını, bildirimleri ve platform özelliklerini test etmek.
4. Giphy/TURN yapılandırmasının ve istemcideki kimlik bilgilerinin güvenliğini incelemek; release imzasını güvenli ortamda kurmak.
5. Hak sahibi/lisans ve GitHub hedefini doğrulamak, güvenlik taraması yapmak; ancak testleri geçen sürümleri GitHub Releases'e koymak.
