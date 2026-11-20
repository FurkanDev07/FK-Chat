/* FK Sohbet — masaüstü kabuğu (FK Sohbet.exe) ile iletişim
 *
 * Sayfa → kabuk:  settings, notify (action: 'manage-request' gibi tıklama hedefi taşıyabilir), state,
 *                 open-mic-privacy, ready, shutdown-ready,
 *                 overlay-profile, overlay-members, overlay-voice (oyun içi gösterge, bkz. overlay.js),
 *                 list-programs, overlay-target (göstergenin hedef programı, bkz. programs.js),
 *                 control-open / control-close (kontrol penceresi), control-frame (gelen ekran karesi),
 *                 control-host-start / control-host-stop (bu bilgisayar kontrol edilirken ekran yakalama),
 *                 control-input / control-launch / control-text (karşıda uygulanacak girdi)
 * Kabuk → sayfa:  init, window, toggle-mute, hotkey-status, shutdown-request, overlay,
 *                 programs (açık programlar), overlay-target (seçili program ve durumu),
 *                 notification-click (masaüstü bildirimi tıklandı; action alanı tık hedefini söyler),
 *                 control-capture (yakalanan ekran karesi), control-input / control-launch /
 *                 control-text (kontrol penceresinden gelenler), control-closed (pencere kapatıldı)
 *
 * Tarayıcıda (test) çalışırken kabuk yoktur; çağrılar sessizce yok sayılır.
 */
(function (FK) {
  'use strict';

  const wv = window.chrome && window.chrome.webview;
  const handlers = Object.create(null);

  if (wv) {
    wv.addEventListener('message', e => {
      const msg = e.data;
      if (!msg || typeof msg !== 'object' || typeof msg.evt !== 'string') return;
      (handlers[msg.evt] || []).forEach(fn => { try { fn(msg); } catch (err) { console.error(err); } });
    });
  }

  FK.host = {
    available: !!wv,
    send(cmd, payload) {
      if (!wv) return;
      try { wv.postMessage(Object.assign({ cmd }, payload || {})); } catch (e) { /* yok */ }
    },
    on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
  };
})(window.FK = window.FK || {});
