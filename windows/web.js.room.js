/* FK Sohbet — 5 haneli sayısal oda kodu kuralları
 *
 * KESİN KURAL: oda kodu her zaman tam 5 rakamdır ("00000" … "99999") ve her yerde
 * STRING olarak tutulur (baştaki sıfırlar kaybolmasın diye asla sayıya çevrilmez).
 */
(function (FK) {
  'use strict';

  const CODE_LENGTH = 5;
  const CODE_SPACE = 100000;                 // 10^5
  const CODE_RE = /^[0-9]{5}$/;              // yalnızca ASCII 0-9 (\d yerine açıkça)

  function isValidRoomCode(value) {
    return typeof value === 'string' && CODE_RE.test(value);
  }

  /** Kriptografik rastgele, eşit dağılımlı 5 haneli kod (ör. "00482"). */
  function generateRoomCode() {
    const buf = new Uint32Array(1);
    // Reddetme örneklemesi: 2^32 sayısı 100000'e tam bölünmediği için modülo yanlılığını önler.
    const limit = Math.floor(0x100000000 / CODE_SPACE) * CODE_SPACE;
    let x;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return String(x % CODE_SPACE).padStart(CODE_LENGTH, '0');
  }

  /** Klavyeden yazılanı temizler: rakam dışı her şeyi atar, en fazla 5 karakter. */
  function sanitizeTyped(value) {
    return String(value == null ? '' : value).replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
  }

  /**
   * Yapıştırılan metni doğrular. Yalnızca baş/sondaki boşluklar (kopyalarken gelen satır sonu
   * gibi) yok sayılır; içerik tam olarak 5 rakam değilse null döner ("58-21", "12 45",
   * "123456", "MC123" reddedilir).
   */
  function parsePasted(text) {
    const t = String(text == null ? '' : text).trim();
    return CODE_RE.test(t) ? t : null;
  }

  /** Kullanıcıya hiç gösterilmeyen dahili PeerJS kimliği. */
  function peerIdForCode(code) {
    if (!isValidRoomCode(code)) throw new Error('Geçersiz oda kodu');
    return FK.config.PEER_PREFIX + code;
  }

  FK.room = { CODE_LENGTH, isValidRoomCode, generateRoomCode, sanitizeTyped, parsePasted, peerIdForCode };
})(window.FK = window.FK || {});
