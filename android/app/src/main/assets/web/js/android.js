/* FK Sohbet — Android'e özgü uyarlamalar (yalnızca APK içinde yüklenir).
 *
 * Masaüstü kabuğu (FK Sohbet.exe) yoktur; bu yüzden:
 *   • Yalnızca Windows'ta anlamlı olan ayarlar (açılışta başlat, tepsi, kısayol, oyun içi
 *     gösterge, program seçici) tamamen gizlenir — devre dışı bırakılmış hâlde gösterilmez.
 *   • Görüşme başlayınca ön plan servisi devreye girer: ekran kapansa da ses sürer.
 *   • Sohbette gelen dosyalar tarayıcı indirmesi yerine sistemin İndirilenler klasörüne yazılır.
 *   • Donanım geri tuşu: önce açık paneli/ekranı kapatır, ana ekranda uygulamayı arka plana alır.
 *
 * ÖNEMLİ: Bu dosya app.js'ten SONRA yüklenir. Buradaki hiçbir kod, hata verse bile
 * arayüzü kilitlememelidir; bu yüzden her adım try/catch içindedir ve DOM'a yazma
 * işlemleri "değiştiyse yaz" biçimindedir. (Eski sürümde #settings üzerindeki
 * MutationObserver kendi yazdığı değişiklikleri yeniden tetikleyip sonsuz döngü
 * oluşturuyor, uygulama açılıyor ama hiçbir düğme çalışmıyordu.)
 */
'use strict';
(function () {
  const N = window.FKNative;
  const FK = window.FK = window.FK || {};
  const doc = document;

  /* ------------------------------------------------------------ yardımcılar */
  function hideEl(el) {
    if (!el) return;
    if (!el.hasAttribute('hidden')) el.setAttribute('hidden', '');
    if (el.style.display !== 'none') el.style.display = 'none';
  }

  // Öğe gerçekten görünür mü? (Yerleşim/offsetParent kullanılmaz: ayarlar kapalıyken
  // tüm çocukların offsetParent'ı null olur ve yanlışlıkla hepsi gizlenirdi.)
  function isShown(el) {
    if (!el) return false;
    if (el.hasAttribute('hidden')) return false;
    if (el.style && el.style.display === 'none') return false;
    if (el.classList && (el.classList.contains('host-only') || el.classList.contains('hotkey-field'))) return false;
    try {
      const cs = getComputedStyle(el);
      if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return false;
    } catch (e) { /* yoksay */ }
    return true;
  }

  /* ------------------------------------------------------------ masaüstüne özgü ayarları gizle */
  const PC_ONLY_IDS = ['host-note', 'hotkey-warn', 'btn-mic-privacy', 'peer-menu-manage'];

  function hidePcOnly() {
    try {
      doc.querySelectorAll('.host-only, .hotkey-field').forEach(hideEl);
      PC_ONLY_IDS.forEach(id => hideEl(doc.getElementById(id)));
      // "Bilgisayarı Yönet" menü öğesi (sağ tık menüsünde)
      doc.querySelectorAll('#peer-menu-manage, [data-manage]').forEach(hideEl);

      const ver = doc.getElementById('app-version');
      if (ver && ver.textContent !== 'Android') ver.textContent = 'Android';

      // Tamamen boşalan ayar bölümlerini (ör. Uygulama) gizle
      doc.querySelectorAll('#settings section.group').forEach(sec => {
        const kids = Array.from(sec.children).filter(el => el.tagName !== 'H3');
        if (!kids.length) return;
        const anyVisible = kids.some(isShown);
        if (!anyVisible) {
          if (!sec.hidden) sec.hidden = true;
        } else if (sec.hidden) {
          sec.hidden = false;          // yanlışlıkla gizlendiyse geri aç
        }
      });
    } catch (e) { /* arayüzü asla kilitleme */ }
  }

  /* ------------------------------------------------------------ görüşme durumu → ön plan servisi */
  let callActive = false;
  function syncCall() {
    try {
      const app = doc.getElementById('app');
      const on = !!app && app.dataset.screen === 'call';     // görüşme ekranı = oda aktif
      if (on === callActive) return;
      callActive = on;
      if (N && N.setCallActive) N.setCallActive(on);
    } catch (e) { }
  }

  /* ------------------------------------------------------------ gelen dosyalar → İndirilenler */
  function bindDownloads() {
    try {
      const origClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        try {
          const href = this.getAttribute('href') || this.href || '';
          const name = this.getAttribute('download') || this.download || '';
          if (name && href.startsWith('data:')) {
            if (N && N.saveFile) N.saveFile(name, href, '');
            return;
          }
          if (name && href.startsWith('blob:') && N && N.saveFile) {
            // blob: → içeriği oku ve köprüye ver (WebView blob indirmeyi desteklemez)
            fetch(href).then(r => r.blob()).then(blob => {
              const fr = new FileReader();
              fr.onloadend = () => { try { N.saveFile(name, String(fr.result || ''), blob.type || ''); } catch (e) { } };
              fr.readAsDataURL(blob);
            }).catch(() => origClick.call(this));
            return;
          }
        } catch (e) { /* aşağıya düş */ }
        return origClick.call(this);
      };
    } catch (e) { }
  }

  /* ------------------------------------------------------------ geri tuşu */
  window.__fkHandleBack = function () {
    try {
      const app = FK.app;
      const st = (app && app.state) || {};
      if (st.settingsOpen && app.closeSettings) { app.closeSettings(); return 'handled'; }
      if (st.chatOpen && app.closeChat) { app.closeChat(); return 'handled'; }
      if (st.session) return 'call';                 // görüşme sırasında uygulamadan çıkma
      if (st.screen && st.screen !== 'home' && app.goHome) { app.goHome(); return 'handled'; }
      return 'root';
    } catch (e) { return 'root'; }
  };

  /* ------------------------------------------------------------ gelen "bilgisayarı yönetme" istekleri */
  // Android'de karşı tarafın bilgisayarını yönetmek anlamsız: istek gelirse otomatik reddet.
  // (Gözlemci YALNIZCA bu modalın hidden özniteliğine bakar; kendi DOM yazımızı tetiklemez.)
  function bindManageReject() {
    try {
      const manage = doc.getElementById('manage-modal');
      if (!manage || !window.MutationObserver) return;
      let busy = false;
      new MutationObserver(() => {
        if (busy || manage.hidden) return;
        const no = doc.getElementById('btn-manage-reject');
        if (!no) return;
        busy = true;
        try { no.click(); } catch (e) { }
        setTimeout(() => { busy = false; }, 300);
      }).observe(manage, { attributes: true, attributeFilter: ['hidden'] });
    } catch (e) { }
  }

  /* ------------------------------------------------------------ tanılama
   * Beklenmedik bir JavaScript hatası olursa ekranın altında kısa süreli bir şerit
   * gösterilir. Böylece "düğmeler çalışmıyor" gibi bir durumda hata metni görünür olur
   * (kullanıcı bana iletebilir). En fazla 3 kez gösterilir, kendiliğinden kaybolur. */
  let diagShown = 0;
  function showBanner(text) {
    try {
      let b = doc.getElementById('fk-diag');
      if (!b) {
        b = doc.createElement('div');
        b.id = 'fk-diag';
        b.setAttribute('style', 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;' +
          'background:#b3261e;color:#fff;font:13px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;' +
          'padding:10px 12px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.45);word-break:break-word');
        doc.body.appendChild(b);
      }
      b.textContent = 'Hata: ' + text;
      b.style.display = 'block';
      clearTimeout(b._t);
      b._t = setTimeout(() => { b.style.display = 'none'; }, 9000);
    } catch (e) { }
  }
  function bindDiagnostics() {
    try {
      window.addEventListener('error', e => {
        if (diagShown >= 3) return;
        diagShown++;
        const msg = (e && (e.message || (e.error && e.error.message))) || 'bilinmeyen hata';
        const src = String((e && e.filename) || '').split('/').pop();
        showBanner(msg + (src ? '  (' + src + ':' + (e.lineno || 0) + ')' : ''));
      });
    } catch (e) { }
  }

  /* ------------------------------------------------------------ başlat */
  function boot() {
    bindDiagnostics();
    hidePcOnly();
    syncCall();
    bindDownloads();
    bindManageReject();

    // Görüşme ekranı değişince ön plan servisini aç/kapat
    try {
      const app = doc.getElementById('app');
      if (app && window.MutationObserver) {
        new MutationObserver(syncCall).observe(app, { attributes: true, attributeFilter: ['data-screen'] });
      }
    } catch (e) { }

    // Ayarlar açıldığında gizleme bir kez daha uygulanır.
    // NOT: #settings üzerinde MutationObserver KULLANILMAZ (sonsuz döngü yapıyordu).
    try {
      doc.querySelectorAll('[data-action="settings"], #btn-settings').forEach(btn => {
        btn.addEventListener('click', () => setTimeout(hidePcOnly, 0), true);
      });
      const app = FK.app;
      if (app && typeof app.openSettings === 'function' && !app.openSettings.__androidWrapped) {
        const orig = app.openSettings;
        const wrapped = function () {
          const r = orig.apply(this, arguments);
          setTimeout(hidePcOnly, 0);
          return r;
        };
        wrapped.__androidWrapped = true;
        app.openSettings = wrapped;
      }
      // Menü/klavye ile açılabilecek durumlar için tek seferlik gecikmeli kontrol
      setTimeout(hidePcOnly, 400);
    } catch (e) { }
  }

  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => setTimeout(boot, 0));
  else setTimeout(boot, 0);
})();
