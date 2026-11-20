/* FK Sohbet — kalıcı ayarlar (WebView2 profilinde localStorage) */
(function (FK) {
  'use strict';

  const KEY = 'fksohbet.settings.v1';

  const DEFAULTS = Object.freeze({
    // Profil (isim + fotoğraf odadaki arkadaşa gider; kullanıcı adı yalnızca bu cihazda kalır)
    profileName: '',
    profileUsername: '',
    profilePhoto: '',         // data:image/webp;base64,... (256×256)
    // Mikrofon
    micId: '',                // '' = Windows varsayılanı
    micGain: 1,               // 0..2 (%0..%200)
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    // Ses
    outputId: '',             // '' = Windows varsayılanı
    outputVolume: 1,          // 0..1
    // Uygulama (asıl değerleri masaüstü kabuğu tutar, burada yansıtılır)
    autostart: false,
    notifications: true,
    background: true,
    hotkey: true,
    hotkeyDisplay: 'Ctrl + Shift + M',
    hotkeyKey: 'M',
    hotkeyVk: 77,
    hotkeyModifiers: 16390,
    overlay: true,            // oyun içi gösterge (sol üst: PP → İsim → konuşma animasyonu)
    // Sohbet: GIF (Giphy) — ücretsiz API anahtarı, yalnızca bu cihazda saklanır
    giphyKey: '',
    // Bağlantı (gelişmiş)
    turnUrls: '',
    turnUsername: '',
    turnCredential: '',
  });

  /** Masaüstü kabuğuna (Windows tarafına) iletilen ayarlar. */
  const HOST_KEYS = [
    'autostart', 'notifications', 'background', 'hotkey', 'overlay',
    'hotkeyDisplay', 'hotkeyKey', 'hotkeyVk', 'hotkeyModifiers'
  ];

  function load() {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { stored = {}; }
    const data = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach(k => {
      if (k in stored && typeof stored[k] === typeof DEFAULTS[k]) data[k] = stored[k];
    });
    return data;
  }

  let data = load();
  const listeners = new Set();

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* depolama dolu/kapalı */ }
  }

  FK.settings = {
    DEFAULTS,
    HOST_KEYS,
    get(key) { return data[key]; },
    all() { return Object.assign({}, data); },
    /** Değeri kaydeder; değiştiyse true döner. */
    set(key, value) {
      if (!(key in DEFAULTS)) return false;
      if (typeof value !== typeof DEFAULTS[key]) return false;
      if (data[key] === value) return false;
      data[key] = value;
      save();
      listeners.forEach(fn => { try { fn(key, value); } catch (e) { console.error(e); } });
      return true;
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    customTurn() {
      return data.turnUrls ? { urls: data.turnUrls, username: data.turnUsername, credential: data.turnCredential } : null;
    },
  };
})(window.FK = window.FK || {});
