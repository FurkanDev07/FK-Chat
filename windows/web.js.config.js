/* FK Sohbet — sabit ayarlar */
(function (FK) {
  'use strict';

  const config = {
    APP_ID: 'fksohbet',
    PROTOCOL: 1,

    // Kullanıcı yalnızca 5 haneli kodu görür. PeerJS sunucusunda oda sahibinin gerçek
    // Peer ID'si bu önek + koddur (ör. "fksohbet-v1-58321"). Önek, aynı genel sunucuyu
    // kullanan başka uygulamalarla çakışmayı önler.
    PEER_PREFIX: 'fksohbet-v1-',

    // Bağlantı kurma (signaling) için PeerJS'in ücretsiz genel sunucusu.
    // Ses bu sunucudan geçmez; yalnızca iki bilgisayarın birbirini bulması için kullanılır.
    PEER_SERVER: { host: '0.peerjs.com', port: 443, path: '/', secure: true, key: 'peerjs' },

    // NAT geçişi: farklı ev/ağlardaki bilgisayarların doğrudan bağlanması için STUN.
    STUN_SERVERS: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    // TURN: doğrudan bağlantı kurulamadığında (ör. iki tarafta da CGNAT / simetrik NAT) sesi
    // aktaran sunucu. Herkese açık ücretsiz TURN kalmadığı için (PeerJS'in eski sunucuları
    // kapandı, Open Relay artık hesap istiyor) varsayılan yoktur; ölü sunucu koymak yerine
    // Ayarlar > Bağlantı'dan kendi TURN sunucunuzu ekleyip "Test Et" ile doğrulayabilirsiniz.
    DEFAULT_TURN_SERVERS: [],
    // Teşhis/test: true ise ses yalnızca TURN üzerinden akar (doğrudan bağlantı denenmez).
    FORCE_RELAY: false,

    // Görüşme yalnızca 2 kişiliktir: oda sahibi + 1 arkadaş, doğrudan (P2P) bağlantı.
    // Oda doluyken ikinci bir kişi katılmaya çalışırsa "dolu" cevabı alır.
    MAX_MEMBERS: 6,
    LOST_MEMBER_KEEP_MS: 60000,      // kopan arkadaşın kartı bu süre "bağlantı kesildi" olarak kalır

    CREATE_MAX_TRIES: 8,             // dolu kod gelirse yeni kodla tekrar dene
    OPEN_TIMEOUT_MS: 15000,          // PeerJS sunucusuna bağlanma süresi
    JOIN_TIMEOUT_MS: 15000,          // odaya katılma (karşılama mesajı) süresi
    MEDIA_TIMEOUT_MS: 20000,         // ses bağlantısının kurulma süresi
    ICE_DISCONNECT_GRACE_MS: 6000,   // kısa kopmalarda hemen pes etme
    RECONNECT_DELAYS_MS: [1000, 2000, 3000, 5000, 8000],
    SIGNALING_RETRY_MS: [2000, 4000, 8000, 15000, 30000],
    STATS_INTERVAL_MS: 2000,

    // Profil fotoğrafı veri kanalında parçalar halinde gider: PeerJS JSON kanalı 16 300 bayttan
    // büyük tek mesajı reddeder (ve bağlantıda hata olayı tetikler).
    // Sohbette dosya aktarımı: dosya diskten 9 KB'lık dilimler hâlinde okunur
    // (base64 karşılığı 12.000 karakter = PeerJS'in 16 KB mesaj sınırının altında).
    // Tüm dosya belleğe alınmadığı için 1 GB'a kadar gönderim yapılabilir.
    FILE_MAX_BYTES: 1024 * 1024 * 1024,   // tek dosya üst sınırı: 1 GB
    FILE_CHUNK_BYTES: 9000,               // dilim boyu (ham bayt)
    FILE_BIG_BYTES: 200 * 1024 * 1024,    // bu boyuttan sonra arayüz uyarı gösterir
    FILE_PROGRESS_MS: 250,                // ilerleme bildirimi en sık bu aralıkla

    // GIF (Giphy): arama/trending uç noktası ve sonuç sayısı. API anahtarı Ayarlar'da tutulur.
    GIPHY_API: 'https://api.giphy.com/v1/gifs',
    GIPHY_LIMIT: 24,
    GIPHY_RATING: 'pg-13',
    GIPHY_SEARCH_DEBOUNCE_MS: 420,

    PROFILE_CHUNK_CHARS: 12000,
    PROFILE_MAX_PARTS: 8,

    // Uzaktan kontrol: ekran kareleri (JPEG, base64) veri kanalında parçalar halinde akar.
    // Kare başına üst sınır: 48 parça × 12000 karakter ≈ 576 KB base64 (≈ 430 KB JPEG).
    CONTROL_MAX_PARTS: 48,
    CONTROL_TEXT_MAX: 500,           // tek seferde yazdırılacak metin sınırı

    // "Konuşuyor" algılaması: mikrofon seviyesi (0–1, audio.js rmsToLevel) bu değeri aşınca.
    // Görüşme kartındaki konuşma halkası ve oyun içi gösterge AYNI eşiği kullanır.
    SPEAKING_LEVEL: 0.4,
    SPEAKING_HOLD_MS: 300,   // kelime aralarında gösterge titremesin (yalnızca oyun içi gösterge)
    OVERLAY_TICK_MS: 50,     // oyun içi gösterge açıkken ölçüm aralığı (20 Hz)
    OVERLAY_PHOTO_PX: 96,    // göstergeye giden PP (PNG; Windows tarafı WebP açamaz)

    // Opus ses kalitesi: konuşma için 48 kbps (Opus'ta duyulur fark yok), paket kaybına dayanıklı (FEC).
    // Ses yalnızca karşı tarafa gönderilir: konuşurken ≈ 48 kbps yükleme.
    // usedtx: susan kişi neredeyse hiç veri göndermez.
    OPUS_PARAMS: { maxaveragebitrate: 48000, useinbandfec: 1, usedtx: 1, stereo: 0, 'sprop-stereo': 0 },

    iceServers(customTurn) {
      const list = [];
      if (customTurn && customTurn.urls) {
        const urls = String(customTurn.urls).split(/[\s,]+/).filter(u => /^turns?:/i.test(u));
        if (urls.length) {
          list.push({ urls, username: customTurn.username || undefined, credential: customTurn.credential || undefined });
        }
      }
      return list.concat(config.STUN_SERVERS, config.DEFAULT_TURN_SERVERS);
    },
  };

  FK.config = config;
})(window.FK = window.FK || {});
