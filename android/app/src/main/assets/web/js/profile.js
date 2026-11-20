/* FK Sohbet — profil (isim, kullanıcı adı, profil fotoğrafı)
 *
 * Saklama: FK.settings (WebView2 profilindeki localStorage) → profileName, profileUsername, profilePhoto.
 * Görünürlük kuralı:
 *   - Odadaki arkadaş yalnızca İSİM + PROFİL FOTOĞRAFI görür  → publicProfile()
 *   - Kullanıcı adı (@kullaniciadi) yalnızca kullanıcının kendi Ayarlar ekranında görünür;
 *     odaya giden hiçbir mesaja konmaz (publicProfile onu hiç içermez).
 */
(function (FK) {
  'use strict';

  const NAME_MAX = 32;
  const USERNAME_MIN = 3;
  const USERNAME_MAX = 20;
  const PHOTO_SIZE = 256;              // px (kare) — 200% DPI'da 128 px'lik avatar için bile net
  const PHOTO_MAX_CHARS = 60000;       // data URL üst sınırı (~45 KB görüntü)
  const PHOTO_INPUT_MAX_BYTES = 15 * 1024 * 1024;

  // Kontrol karakterleri ve metin yönünü değiştiren (isim sahteciliğinde kullanılan) karakterler
  // eslint-disable-next-line no-control-regex
  const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
  const PHOTO_RE = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

  /** Görünen isim: baş/son boşluk, art arda boşluklar ve güvensiz karakterler temizlenir; en çok 32 karakter. */
  function cleanName(value) {
    if (typeof value !== 'string') return '';
    const s = value.replace(UNSAFE_CHARS, '').replace(/\s+/g, ' ').trim();
    return Array.from(s).slice(0, NAME_MAX).join('').trim();
  }

  /**
   * Kullanıcı adı kuralları: 3–20 karakter; küçük harf (a-z), rakam, alt çizgi, nokta.
   * Nokta başta/sonda olamaz, iki nokta yan yana olamaz. Baştaki "@" yok sayılır.
   * @returns {{ok:boolean, value:string, error?:string}}
   */
  function checkUsername(value) {
    let v = typeof value === 'string' ? value.trim() : '';
    if (v.startsWith('@')) v = v.slice(1);
    v = v.toLocaleLowerCase('tr-TR')
      .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
    if (v === '') return { ok: true, value: '' };
    if (/[^a-z0-9_.]/.test(v)) return { ok: false, value: v, error: 'Yalnızca harf (a-z), rakam, alt çizgi (_) ve nokta (.) kullanılabilir.' };
    if (v.length < USERNAME_MIN) return { ok: false, value: v, error: 'Kullanıcı adı en az ' + USERNAME_MIN + ' karakter olmalı.' };
    if (v.length > USERNAME_MAX) return { ok: false, value: v, error: 'Kullanıcı adı en çok ' + USERNAME_MAX + ' karakter olabilir.' };
    if (v.startsWith('.') || v.endsWith('.') || v.includes('..')) return { ok: false, value: v, error: 'Nokta başta, sonda veya art arda olamaz.' };
    return { ok: true, value: v };
  }

  /** Yalnızca uygulamanın ürettiği türde (base64 webp/jpeg/png, boyut sınırlı) fotoğraflar kabul edilir. */
  function isSafePhoto(value) {
    return typeof value === 'string' && value.length > 30 && value.length <= PHOTO_MAX_CHARS && PHOTO_RE.test(value);
  }

  /** "Furkan Kaya" → "FK", "furkan" → "F", "" → "" */
  function initials(name) {
    const words = cleanName(name).split(' ').filter(Boolean);
    const letters = words.slice(0, 2).map(w => Array.from(w)[0] || '');
    return letters.join('').toLocaleUpperCase('tr-TR');
  }

  /** Odadaki arkadaşa gönderilen profil: SADECE isim ve fotoğraf. Kullanıcı adı asla eklenmez. */
  function publicProfile() {
    const S = FK.settings;
    const photo = S ? S.get('profilePhoto') : '';
    return {
      name: cleanName(S ? S.get('profileName') : ''),
      photo: isSafePhoto(photo) ? photo : '',
    };
  }

  /** Karşı taraftan gelen profili doğrular; geçersiz alanlar boş bırakılır. */
  function sanitizeRemote(name, photo) {
    return { name: cleanName(name), photo: isSafePhoto(photo) ? photo : '' };
  }

  /**
   * Seçilen görüntüyü ortadan kare kırpar, 256×256'ya yüksek kaliteyle küçültür ve sıkıştırır.
   * @param {Blob} file
   * @returns {Promise<string>} data URL
   */
  async function processPhoto(file) {
    if (!file || !/^image\//.test(file.type || '')) throw Object.assign(new Error('not-image'), { code: 'not-image' });
    if (file.size > PHOTO_INPUT_MAX_BYTES) throw Object.assign(new Error('too-large'), { code: 'too-large' });

    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch (e) { throw Object.assign(new Error('decode'), { code: 'decode' }); }
    try {
      const side = Math.min(bmp.width, bmp.height);
      if (!side) throw Object.assign(new Error('decode'), { code: 'decode' });
      const sx = Math.round((bmp.width - side) / 2);
      const sy = Math.round((bmp.height - side) / 2);

      // Büyük görüntülerde tek adımda küçültmek bulanıklaştırır: yarıya yarıya iner.
      let src = bmp, sSide = side, srcX = sx, srcY = sy;
      while (sSide / 2 >= PHOTO_SIZE * 1.5) {
        const half = Math.round(sSide / 2);
        const c = document.createElement('canvas');
        c.width = c.height = half;
        const g = c.getContext('2d');
        g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(src, srcX, srcY, sSide, sSide, 0, 0, half, half);
        src = c; sSide = half; srcX = 0; srcY = 0;
      }
      const out = document.createElement('canvas');
      out.width = out.height = PHOTO_SIZE;
      const ctx = out.getContext('2d');
      ctx.fillStyle = '#202020'; // saydam PNG'lerde koyu zemin
      ctx.fillRect(0, 0, PHOTO_SIZE, PHOTO_SIZE);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, srcX, srcY, sSide, sSide, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

      const webp = out.toDataURL('image/webp', 0.9).startsWith('data:image/webp');
      const type = webp ? 'image/webp' : 'image/jpeg';
      for (const q of [0.9, 0.82, 0.74, 0.65, 0.55, 0.45]) {
        const url = out.toDataURL(type, q);
        if (url.length <= PHOTO_MAX_CHARS && isSafePhoto(url)) return url;
      }
      throw Object.assign(new Error('encode'), { code: 'encode' });
    } finally {
      try { bmp.close(); } catch (e) { /* yok */ }
    }
  }

  /**
   * Avatar öğesini profil bilgisiyle doldurur: fotoğraf → yoksa baş harfler → yoksa varsayılan simge.
   * Yalnızca textContent ve doğrulanmış data URL kullanılır (HTML enjeksiyonu yok).
   */
  function paintAvatar(el, profile) {
    if (!el) return;
    const p = profile || {};
    const img = el.querySelector('.pp-img');
    const ini = el.querySelector('.pp-initials');
    const photo = isSafePhoto(p.photo) ? p.photo : '';
    const letters = photo ? '' : initials(p.name);
    if (img) {
      if (photo) { if (img.getAttribute('src') !== photo) img.src = photo; img.hidden = false; }
      else { img.hidden = true; img.removeAttribute('src'); }
    }
    if (ini) { ini.textContent = letters; ini.hidden = !letters; }
    el.classList.toggle('has-photo', !!photo);
    el.classList.toggle('has-initials', !!letters);
  }

  FK.profile = {
    NAME_MAX, USERNAME_MIN, USERNAME_MAX, PHOTO_SIZE, PHOTO_MAX_CHARS,
    cleanName, checkUsername, isSafePhoto, initials, publicProfile, sanitizeRemote, processPhoto, paintAvatar,
  };
})(window.FK = window.FK || {});
