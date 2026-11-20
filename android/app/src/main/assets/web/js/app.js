/* FK Sohbet — arayüz denetleyicisi */
(function (FK) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const S = FK.settings;
  const A = FK.audio;

  const SESSION_ERRORS = {
    'invalid-code': 'Geçersiz oda kodu',
    'not-found': 'Oda bulunamadı',
    'full': 'Oda dolu',
    'timeout': 'Bağlantı zaman aşımına uğradı. Oda kodunu kontrol edip tekrar deneyin.',
    'closed': 'Bağlantı kesildi',
    'peerjs-failed': 'PeerJS bağlantısı başarısız. İnternet bağlantınızı kontrol edin.',
    'webrtc-unsupported': 'Bu sistemde WebRTC desteklenmiyor',
    'create-failed': 'Boş oda kodu bulunamadı. Tekrar deneyin.',
  };
  const MIC_ERRORS = {
    'denied': 'Mikrofon erişimi reddedildi',
    'not-found': 'Mikrofon bulunamadı',
    'busy': 'Mikrofon başka bir uygulama tarafından kullanılıyor',
    'unsupported': 'Mikrofon bu sistemde desteklenmiyor',
    'failed': 'Mikrofon açılamadı',
  };
  const FAIL_REASONS = {
    'reconnect-failed': 'Bağlantı kesildi. Yeniden bağlanılamadı.',
    'room-closed': 'Bağlantı kesildi. Oda bulunamadı (oda kapatılmış olabilir).',
    'host-left': 'Bağlantı kesildi. Oda sahibi odayı kapattı.',
    'signaling': 'PeerJS bağlantısı başarısız. İnternet bağlantınızı kontrol edin.',
  };

  const state = {
    screen: 'home',
    session: null,
    settingsOpen: false,
    chatOpen: false,
    background: false,         // pencere küçültüldü/gizlendi → arayüz döngüleri durur
    micError: null,
    hostInfo: null,
    lastCode: null,
  };

  // ================================================================== yardımcılar
  const t = (text) => window.FK.i18n.translate(text);
  let toastTimer = 0;
  function toast(text, kind) {
    const el = $('#toast');
    el.textContent = text;
    el.className = 'toast' + (kind ? ' ' + kind : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
  }

  function setStatus(el, text, kind) {
    el.hidden = false;
    el.dataset.kind = kind || 'busy';
    $('.status-text', el).textContent = text;
  }

  function showScreen(name) {
    state.screen = name;
    $('#app').dataset.screen = name;
    updateLoop();
    reportHostState();
  }

  function notifyDesktop(body) {
    FK.host.send('notify', { title: 'FK Sohbet', body });
  }

  function reportHostState() {
    const s = state.session;
    FK.host.send('state', {
      inCall: !!s && (s.state === 'connected' || s.state === 'unstable'),
      inRoom: !!s,
      muted: A.muted,
      status: s ? s.state : 'idle',
    });
  }

  // ================================================================== mikrofon
  async function ensureMic() {
    if (A.hasMic) return true;
    applyAudioSettings();
    try {
      await A.setMicrophone(S.get('micId'));
      setMicError(null);
      await refreshDevices();
      updateLoop();
      return true;
    } catch (e) {
      setMicError(e.code || 'failed');
      await refreshDevices().catch(() => {});
      return false;
    }
  }

  function setMicError(code) {
    state.micError = code;
    const text = code ? MIC_ERRORS[code] || MIC_ERRORS.failed : '';
    $$('.mic-error').forEach(el => {
      el.textContent = code ? text + (code === 'denied' ? '. Windows Ayarlar › Gizlilik › Mikrofon bölümünden izin verin.' : '.') : '';
      el.hidden = !code;
    });
    $$('.mic-error-box').forEach(el => { el.hidden = !code; });
    $('#btn-mic-privacy').hidden = !(code === 'denied' && FK.host.available);
    updateMuteUI();
    if (state.session) state.session.sendState();
  }

  function applyAudioSettings() {
    A.processing.echoCancellation = S.get('echoCancellation');
    A.processing.noiseSuppression = S.get('noiseSuppression');
    A.processing.autoGainControl = S.get('autoGainControl');
    A.setMicGain(S.get('micGain'));
    A.setOutputVolume(S.get('outputVolume'));
    A.setOutputDevice(S.get('outputId')).catch(() => {});
  }

  async function switchMic(deviceId) {
    if (!A.hasMic) { await ensureMic(); return; }
    try {
      await A.setMicrophone(deviceId);
      setMicError(null);
      const d = FK.devices.inputs.find(x => x.id === deviceId);
      if (state.session) toast('Mikrofon değiştirildi' + (d ? ': ' + d.label : ''), 'ok');
    } catch (e) {
      setMicError(e.code || 'failed');
    }
    syncBindings();
  }

  function releaseMicIfIdle() {
    if (!state.session && !state.settingsOpen && state.screen === 'home') {
      A.releaseMicrophone();
      $('#monitor-toggle').checked = false;
      updateLoop();
    }
  }

  // ================================================================== cihaz listeleri
  async function refreshDevices() {
    await FK.devices.refresh();
    fillDeviceSelects();
  }

  function fillSelect(sel, devices, current, emptyLabel) {
    const value = current || '';
    sel.textContent = '';
    if (!devices.length) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = emptyLabel;
      sel.appendChild(o);
      return;
    }
    // '' (ayar) = Windows varsayılanı → listede "default" varsa onu seç
    devices.forEach(d => {
      const o = document.createElement('option');
      o.value = d.isDefault ? '' : d.id;
      o.textContent = d.label;
      sel.appendChild(o);
    });
    if (!devices.some(d => d.isDefault)) {
      const o = document.createElement('option');
      o.value = ''; o.textContent = 'Varsayılan';
      sel.insertBefore(o, sel.firstChild);
    }
    sel.value = value;
    if (sel.value !== value) sel.value = '';
  }

  function fillDeviceSelects() {
    $$('select[data-bind="micId"]').forEach(sel => fillSelect(sel, FK.devices.inputs, S.get('micId'), 'Mikrofon bulunamadı'));
    const outSupported = FK.devices.outputSelectionSupported();
    $$('select[data-bind="outputId"]').forEach(sel => {
      fillSelect(sel, FK.devices.outputs, S.get('outputId'), 'Varsayılan ses çıkışı');
      sel.disabled = !outSupported;
      if (!outSupported) sel.title = 'Bu sistemde çıkış cihazı seçimi desteklenmiyor; Windows varsayılanı kullanılır.';
    });
  }

  // ================================================================== ayar bağlantıları
  const SCALE = { micGain: 100, outputVolume: 100 };

  function syncBindings() {
    $$('[data-bind]').forEach(el => {
      const key = el.dataset.bind;
      const v = S.get(key);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'range') { el.value = Math.round(v * (SCALE[key] || 1)); paintRange(el); }
      else if (el.tagName === 'SELECT') { if (el.value !== v) { el.value = v; if (el.value !== v) el.value = ''; } }
      else if (document.activeElement !== el) el.value = v;
    });
    $$('[data-out]').forEach(el => {
      const key = el.dataset.out;
      el.textContent = Math.round(S.get(key) * (SCALE[key] || 1)) + '%';
    });
    if (FK.programs) FK.programs.sync();   // "Program Seç" yalnızca gösterge açıkken görünür
  }

  function paintRange(el) {
    const pct = (el.value - el.min) / (el.max - el.min) * 100;
    el.style.setProperty('--fill', pct + '%');
  }

  function applySetting(key, value) {
    if (!S.set(key, value)) { syncBindings(); return; }
    switch (key) {
      case 'micId': switchMic(value); break;
      case 'micGain': A.setMicGain(value); break;
      case 'outputId': A.setOutputDevice(value).catch(() => {}); break;
      case 'outputVolume': A.setOutputVolume(value); break;
      case 'echoCancellation': case 'noiseSuppression': case 'autoGainControl':
        A.setProcessing({ [key]: value }).catch(e => setMicError(e.code || 'failed'));
        break;
      case 'autostart': case 'notifications': case 'background': case 'hotkey': case 'overlay':
        FK.host.send('settings', { [key]: value });
        if (key === 'hotkey') updateHotkeyUI();
        break;
      case 'hotkeyDisplay': case 'hotkeyKey': case 'hotkeyVk': case 'hotkeyModifiers':
        updateHotkeyUI();
        break;
      case 'giphyKey':
        gifCache.clear();
        gifItems = [];
        gifError = '';
        gifLoading = false;
        if (emojiPanelOpen() && panelMode === 'gif') loadGifs(gifQuery);
        break;
      default: break; // TURN alanları: bir sonraki bağlantıda kullanılır
    }
    syncBindings();
  }

  function bindSettings() {
    $$('[data-bind]').forEach(el => {
      const key = el.dataset.bind;
      if (el.type === 'checkbox') {
        el.addEventListener('change', () => applySetting(key, el.checked));
      } else if (el.type === 'range') {
        el.addEventListener('input', () => { paintRange(el); applySetting(key, Number(el.value) / (SCALE[key] || 1)); });
      } else if (el.tagName === 'SELECT') {
        el.addEventListener('change', () => applySetting(key, el.value));
      } else {
        el.addEventListener('change', () => applySetting(key, el.value.trim()));
      }
    });
  }

  // ================================================================== mikrofon kısayolu
  let hotkeyRecording = false;

  function updateHotkeyUI() {
    const enabled = S.get('hotkey') !== false;
    const display = S.get('hotkeyDisplay') || 'Ctrl + Shift + M';
    const tag = $('#hotkey-status-tag');
    const recBtn = $('#btn-hotkey-record');
    const displayEl = $('#hotkey-display');
    const switchLabel = $('#hotkey-switch-label');
    const muteBtn = $('#btn-mute');

    if (displayEl && !hotkeyRecording) {
      displayEl.textContent = enabled ? display : 'Kısayol Devre Dışı';
    }
    if (tag) {
      tag.className = 'vis-tag ' + (enabled ? 'active public' : 'private');
      tag.innerHTML = enabled
        ? '<svg><use href="#i-app"/></svg>Arka planda çalışır'
        : '<svg><use href="#i-close"/></svg>Kapalı';
    }
    if (recBtn && !hotkeyRecording) {
      recBtn.title = enabled ? `Kısayolu değiştirmek için tıklayın (Şu an: ${display})` : 'Kısayol atamak için tıklayın';
    }
    if (switchLabel) {
      switchLabel.innerHTML = enabled && display && display !== 'Atanmadı'
        ? `<strong>${display}</strong> ile mikrofonu aç/kapat <span class="muted small">(oyundayken de çalışır)</span>`
        : `Kısayol tuşu ile mikrofonu aç/kapat <span class="muted small">(oyundayken de çalışır)</span>`;
    }
    if (muteBtn) {
      muteBtn.title = enabled && display && display !== 'Atanmadı'
        ? `Mikrofonu aç/kapat (${display})`
        : `Mikrofonu aç/kapat`;
    }
  }

  function formatKeyName(e) {
    if (/^F\d+$/i.test(e.key)) return e.key.toUpperCase();
    if (/^Digit\d$/.test(e.code)) return e.code.replace('Digit', '');
    if (/^Numpad\d$/.test(e.code)) return 'Num ' + e.code.replace('Numpad', '');
    switch (e.code) {
      case 'Space': return 'Space';
      case 'Enter': return 'Enter';
      case 'Tab': return 'Tab';
      case 'Backspace': return 'Backspace';
      case 'CapsLock': return 'CapsLock';
      case 'Pause': return 'Pause';
      case 'ScrollLock': return 'ScrollLock';
      case 'Insert': return 'Insert';
      case 'Delete': return 'Delete';
      case 'Home': return 'Home';
      case 'End': return 'End';
      case 'PageUp': return 'PageUp';
      case 'PageDown': return 'PageDown';
      case 'ArrowUp': return 'Yukarı Ok';
      case 'ArrowDown': return 'Aşağı Ok';
      case 'ArrowLeft': return 'Sol Ok';
      case 'ArrowRight': return 'Sağ Ok';
      case 'NumpadAdd': return 'Num +';
      case 'NumpadSubtract': return 'Num -';
      case 'NumpadMultiply': return 'Num *';
      case 'NumpadDivide': return 'Num /';
      case 'NumpadDecimal': return 'Num .';
      default:
        if (e.key && e.key.length === 1) return e.key.toUpperCase();
        return e.key || e.code;
    }
  }

  function stopHotkeyRecording(cancelled) {
    if (!hotkeyRecording) return;
    hotkeyRecording = false;
    window.removeEventListener('keydown', onHotkeyRecordKeyDown, true);
    window.removeEventListener('keyup', onHotkeyRecordKeyUp, true);
    document.removeEventListener('pointerdown', onHotkeyDocPointerDown, true);
    const recBtn = $('#btn-hotkey-record');
    if (recBtn) recBtn.classList.remove('recording');
    updateHotkeyUI();
    if (cancelled) toast('Kısayol tuşu seçimi iptal edildi', 'warn');
  }

  function onHotkeyDocPointerDown(e) {
    if (!hotkeyRecording) return;
    const recBtn = $('#btn-hotkey-record');
    if (recBtn && !recBtn.contains(e.target)) {
      stopHotkeyRecording(true);
    }
  }

  function onHotkeyRecordKeyUp(e) {
    if (!hotkeyRecording) return;
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.shiftKey) parts.push('Shift');
    if (e.altKey) parts.push('Alt');
    if (e.metaKey) parts.push('Win');
    const displayEl = $('#hotkey-display');
    if (displayEl) {
      displayEl.textContent = parts.length ? parts.join(' + ') + ' + ...' : 'Bir tuşa basın... (İptal: Esc)';
    }
  }

  function onHotkeyRecordKeyDown(e) {
    if (!hotkeyRecording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      stopHotkeyRecording(true);
      return;
    }

    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Win');
      const displayEl = $('#hotkey-display');
      if (displayEl) displayEl.textContent = parts.join(' + ') + ' + ...';
      return;
    }

    const keyName = formatKeyName(e);
    const vk = e.keyCode || e.which;

    let mod = 0x4000; // MOD_NOREPEAT
    const parts = [];
    if (e.ctrlKey) { mod |= 0x0002; parts.push('Ctrl'); }
    if (e.shiftKey) { mod |= 0x0004; parts.push('Shift'); }
    if (e.altKey) { mod |= 0x0001; parts.push('Alt'); }
    if (e.metaKey) { mod |= 0x0008; parts.push('Win'); }

    const display = parts.length ? parts.join(' + ') + ' + ' + keyName : keyName;

    stopHotkeyRecording(false);

    S.set('hotkeyDisplay', display);
    S.set('hotkeyKey', keyName);
    S.set('hotkeyVk', vk);
    S.set('hotkeyModifiers', mod);
    S.set('hotkey', true);

    FK.host.send('settings', {
      hotkey: true,
      hotkeyDisplay: display,
      hotkeyKey: keyName,
      hotkeyVk: vk,
      hotkeyModifiers: mod
    });

    updateHotkeyUI();
    toast('Mikrofon kısayolu atandı: ' + display, 'ok');
  }

  function startHotkeyRecording() {
    if (hotkeyRecording) {
      stopHotkeyRecording(true);
      return;
    }
    hotkeyRecording = true;
    const recBtn = $('#btn-hotkey-record');
    const displayEl = $('#hotkey-display');
    if (recBtn) recBtn.classList.add('recording');
    if (displayEl) displayEl.textContent = 'Bir tuşa basın... (İptal: Esc)';

    window.addEventListener('keydown', onHotkeyRecordKeyDown, true);
    window.addEventListener('keyup', onHotkeyRecordKeyUp, true);
    setTimeout(() => {
      document.addEventListener('pointerdown', onHotkeyDocPointerDown, true);
    }, 10);
  }

  function bindHotkeyUI() {
    const recBtn = $('#btn-hotkey-record');
    const resetBtn = $('#btn-hotkey-reset');
    const clearBtn = $('#btn-hotkey-clear');

    if (recBtn) {
      recBtn.addEventListener('click', startHotkeyRecording);
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        stopHotkeyRecording(false);
        const display = 'Ctrl + Shift + M';
        const keyName = 'M';
        const vk = 77;
        const mod = 16390;

        S.set('hotkeyDisplay', display);
        S.set('hotkeyKey', keyName);
        S.set('hotkeyVk', vk);
        S.set('hotkeyModifiers', mod);
        S.set('hotkey', true);

        FK.host.send('settings', {
          hotkey: true,
          hotkeyDisplay: display,
          hotkeyKey: keyName,
          hotkeyVk: vk,
          hotkeyModifiers: mod
        });

        updateHotkeyUI();
        toast('Kısayol varsayılana sıfırlandı: ' + display, 'ok');
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        stopHotkeyRecording(false);
        S.set('hotkeyDisplay', 'Atanmadı');
        S.set('hotkeyKey', '');
        S.set('hotkeyVk', 0);
        S.set('hotkeyModifiers', 0);
        S.set('hotkey', false);

        FK.host.send('settings', {
          hotkey: false,
          hotkeyDisplay: 'Atanmadı',
          hotkeyKey: '',
          hotkeyVk: 0,
          hotkeyModifiers: 0
        });

        updateHotkeyUI();
        toast('Mikrofon kısayolu kaldırıldı', 'info');
      });
    }

    updateHotkeyUI();
  }

  // ================================================================== oda oluştur
  async function createRoom(preferredCode) {
    await disposeSession();
    showScreen('create');
    setCode(null);
    $('#create-alert').hidden = true;
    setStatus($('#create-status'), 'Bağlanıyor...', 'busy');

    await ensureMic(); // mikrofon yoksa/izin yoksa yine de oda açılır (yalnızca dinleme)
    const session = newSession();
    try {
      const code = await session.create(preferredCode);
      if (state.session !== session) return;
      setCode(code);
      setStatus($('#create-status'), 'Bağlantı bekleniyor...', 'busy');
    } catch (e) {
      if (state.session !== session) return;
      await disposeSession();
      setStatus($('#create-status'), 'Oda oluşturulamadı', 'error');
      $('.alert-text', $('#create-alert')).textContent = SESSION_ERRORS[e.code] || SESSION_ERRORS['peerjs-failed'];
      $('#create-alert').hidden = false;
    }
  }

  function setCode(code) {
    const box = $('#room-code');
    const spans = $$('span', box);
    const valid = FK.room.isValidRoomCode(code);
    spans.forEach((s, i) => { s.textContent = valid ? code[i] : ''; });
    box.classList.toggle('ready', valid);
    box.dataset.code = valid ? code : '';
    $('#btn-copy').disabled = !valid;
    $('#call-code').textContent = valid ? code : '-----';
    if (valid) state.lastCode = code;
  }

  async function copyCode(ev) {
    const code = $('#room-code').dataset.code;
    const inCall = !!(ev && ev.currentTarget && ev.currentTarget.id === 'call-copy');
    if (!FK.room.isValidRoomCode(code)) return;
    let ok = false;
    try { await navigator.clipboard.writeText(code); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = code; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (inCall) {
      const cb = $('#call-copy');
      cb.classList.toggle('copied', ok);
      $('use', cb).setAttribute('href', ok ? '#i-check' : '#i-copy');
      toast(ok ? 'Oda kodu kopyalandı: ' + code : 'Kopyalanamadı', ok ? 'ok' : 'error');
      setTimeout(() => { cb.classList.remove('copied'); $('use', cb).setAttribute('href', '#i-copy'); }, 1600);
      return;
    }
    const btn = $('#btn-copy');
    $('span', btn).textContent = ok ? 'Kopyalandı' : 'Kopyalanamadı';
    $('use', btn).setAttribute('href', ok ? '#i-check' : '#i-copy');
    btn.classList.toggle('copied', ok);
    setTimeout(() => {
      $('span', btn).textContent = 'Kodu Kopyala';
      $('use', btn).setAttribute('href', '#i-copy');
      btn.classList.remove('copied');
    }, 1600);
  }

  // ================================================================== odaya katıl
  const joinInput = () => $('#join-code');

  function setJoinError(text) {
    $('#join-error').textContent = text || '';
    joinInput().setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  function updateJoinButton() {
    $('#btn-connect').disabled = !FK.room.isValidRoomCode(joinInput().value) || !!state.session;
  }

  function bindJoinInput() {
    const input = joinInput();
    // Rakam dışındaki karakterler hiç yazılamaz.
    input.addEventListener('beforeinput', e => {
      if (e.inputType === 'insertText' || e.inputType === 'insertCompositionText') {
        if (e.data && /[^0-9]/.test(e.data)) {
          e.preventDefault();
          setJoinError('Oda kodu yalnızca rakamlardan oluşur.');
        }
      } else if (e.inputType === 'insertFromDrop') {
        e.preventDefault();
      }
    });
    // Her durumda (IME, otomatik doldurma vb.) son temizlik: yalnızca rakam, en fazla 5.
    input.addEventListener('input', () => {
      const clean = FK.room.sanitizeTyped(input.value);
      if (input.value !== clean) input.value = clean;
      if (FK.room.isValidRoomCode(clean) || clean.length === 0) setJoinError('');
      else if ($('#join-error').textContent && !/rakam/.test($('#join-error').textContent)) setJoinError('');
      updateJoinButton();
    });
    // Yapıştırılan içerik doğrulanır: tam 5 rakam değilse kabul edilmez.
    input.addEventListener('paste', e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text');
      const code = FK.room.parsePasted(text);
      if (code) {
        input.value = code;
        setJoinError('');
      } else {
        setJoinError('Geçerli bir 5 haneli oda kodu girin.');
      }
      updateJoinButton();
    });
    $('#join-form').addEventListener('submit', e => { e.preventDefault(); joinRoom(input.value); });
  }

  async function joinRoom(code) {
    if (state.session) return;
    if (!FK.room.isValidRoomCode(code)) {
      setJoinError('Geçerli bir 5 haneli oda kodu girin.');
      return;
    }
    setJoinError('');
    joinInput().disabled = true;
    updateJoinButton();
    $('#btn-connect').disabled = true;
    setStatus($('#join-status'), 'Bağlanıyor...', 'busy');

    await ensureMic();
    const session = newSession();
    setCode(code);
    try {
      await session.join(code);
      // Karşılandı; ses bağlantısı kurulunca 'connected' durumu görüşme ekranına geçirir.
    } catch (e) {
      if (state.session !== session) return;
      await disposeSession();
      $('#join-status').hidden = true;
      setJoinError(SESSION_ERRORS[e.code] || SESSION_ERRORS['peerjs-failed']);
      joinInput().disabled = false;
      updateJoinButton();
    }
  }

  function openJoin() {
    disposeSession();
    showScreen('join');
    const input = joinInput();
    input.disabled = false;
    input.value = '';
    setJoinError('');
    $('#join-status').hidden = true;
    updateJoinButton();
    setTimeout(() => input.focus(), 30);
    ensureMic();
  }

  // ================================================================== oturum
  function newSession() {
    const s = new FK.Session(A, () => S.customTurn());
    state.session = s;
    s.addEventListener('state', e => onSessionState(s, e.detail));
    s.addEventListener('notify', e => onSessionNotify(s, e.detail));
    s.addEventListener('members', () => { if (state.session === s) { renderPeople(); FK.overlay.sendMembers(); updateChatPartnerUI(); } });
    s.addEventListener('remote-muted', () => { if (state.session === s) renderPeople(); });
    s.addEventListener('remote-profile', () => { if (state.session === s) { renderPeople(); FK.overlay.sendMembers(); updateChatPartnerUI(); } });
    s.addEventListener('manage-request', e => onManageRequest(s, e.detail));
    s.addEventListener('manage-response', e => onManageResponse(s, e.detail));
    s.addEventListener('control-start', e => onControlStart(s, e.detail));
    s.addEventListener('control-stop', e => onControlStop(s, e.detail));
    s.addEventListener('control-frame', e => onControlFrame(s, e.detail));
    s.addEventListener('control-input', e => onControlInput(s, e.detail));
    s.addEventListener('control-launch', e => onControlLaunch(s, e.detail));
    s.addEventListener('control-text', e => onControlText(s, e.detail));
    s.addEventListener('chat-message', e => onChatMessage(s, e.detail));
    s.addEventListener('chat-file-incoming', e => onIncomingFile(s, e.detail));
    s.addEventListener('chat-file-progress', e => {
      if (state.session !== s) return;
      const m = chatMessages.find(x => x.id === e.detail.id);
      if (!m) return;
      m.progress = e.detail.ratio;
      updateChatProgress(m);
    });
    s.addEventListener('chat-file-ack', e => {
      if (state.session !== s) return;
      const m = chatMessages.find(x => x.id === e.detail.id);
      if (!m || m.state === 'delivered') return;
      m.state = 'delivered';
      upsertChatMessage(m);
    });
    s.addEventListener('chat-file-failed', e => {
      if (state.session !== s) return;
      const m = chatMessages.find(x => x.id === e.detail.id);
      if (!m) return;
      m.state = 'failed';
      upsertChatMessage(m);
      toast('Dosya karşı tarafa ulaşmadı', 'error');
    });
    s.addEventListener('chat-typing', e => onChatTyping(s, e.detail));
    s.addEventListener('stats', e => { if (state.session === s) showStats(e.detail); });
    s.statsPaused = state.background;
    return s;
  }

  async function disposeSession() {
    const s = state.session;
    state.session = null;
    clearManageIncoming();
    clearManageOutgoing();
    endControl(false);
    closePeerMenu();
    resetChat();
    if (s) await s.leave();
    A.setMuted(false);
    updateMuteUI();
    updatePeerProfileUI();
    FK.overlay.sendMembers();
    reportHostState();
  }

  function onSessionState(s, info) {
    if (state.session !== s) return;
    const st = info.state;
    const banner = $('#call-banner');
    const showBanner = (text, kind, actions) => {
      banner.hidden = false;
      banner.classList.toggle('error', kind === 'error');
      $('#banner-text').textContent = text;
      $('#banner-actions').hidden = !actions;
    };

    switch (st) {
      case 'waiting':
        if (state.screen === 'call') showScreen('create');
        setStatus($('#create-status'), t('Bağlantı bekleniyor...'), 'busy');
        break;
      case 'connecting':
        if (s.role === 'host') setStatus($('#create-status'), t('Karşı taraf bağlanıyor...'), 'busy');
        else setStatus($('#join-status'), t('Bağlanıyor...'), 'busy');
        break;
      case 'connected':
        banner.hidden = true;
        setPill(t('Bağlandı'), 'ok');
        showScreen('call');
        break;
      case 'unstable':
        setPill(t('Bağlantı zayıf'), 'warn');
        showBanner(t('Bağlantı zayıfladı, ses kesilebilir. Bağlantı korunmaya çalışılıyor...'), 'warn', false);
        break;
      case 'reconnecting':
        setPill(t('Yeniden bağlanıyor'), 'warn');
        showBanner(t('Bağlantı kesildi. Yeniden bağlanılıyor...') + ' (' + info.attempt + '/' + info.max + ')', 'warn', false);
        if (state.screen !== 'call') showScreen('call');
        break;
      case 'partner-lost':
        setPill(t('Bağlantı kesildi'), 'error');
        showBanner(t('Bağlantı kesildi. Arkadaşının yeniden bağlanması bekleniyor...') + ' (' + t('Oda') + ' ' + s.code + ')', 'warn', false);
        $('#banner-actions').hidden = false;
        $('#btn-retry').hidden = true;
        break;
      case 'partner-left':
        showScreen('create');
        setStatus($('#create-status'), t('Arkadaşın ayrıldı · Bağlantı bekleniyor...'), 'busy');
        break;
      case 'failed':
        setPill(t('Bağlantı kesildi'), 'error');
        if (state.screen === 'call') {
          showBanner(FAIL_REASONS[info.reason] || t('Bağlantı kesildi.'), 'error', true);
          $('#btn-retry').hidden = info.reason === 'host-left';
        } else {
          setStatus($('#create-status'), FAIL_REASONS[info.reason] || t('Bağlantı kesildi'), 'error');
          $('.alert-text', $('#create-alert')).textContent = FAIL_REASONS[info.reason] || t('Bağlantı kesildi.');
          $('#create-alert').hidden = false;
        }
        break;
      default: break;
    }
    if (st !== 'partner-lost') $('#btn-retry').hidden = st === 'failed' && info.reason === 'host-left';
    updatePeopleUI();
    reportHostState();
  }

  function onSessionNotify(s, info) {
    if (state.session !== s) return;
    const n = info.name || '';
    switch (info.kind) {
      case 'peer-joined':
        toast(n ? n + ' ' + t('bağlandı') : t('Karşı taraf bağlandı'), 'ok');
        notifyDesktop(n ? n + ' ' + t('bağlandı.') : t('Arkadaşın bağlandı.'));
        break;
      case 'reconnected':
        toast(n ? n + ' ' + t('yeniden bağlandı') : t('Bağlantı yeniden kuruldu'), 'ok');
        notifyDesktop(n ? n + ' ' + t('yeniden bağlandı.') : t('Bağlantı yeniden kuruldu.'));
        break;
      case 'connection-lost':
        toast(n ? n + ': ' + t('Bağlantı kesildi') : t('Bağlantı kesildi'), 'error');
        notifyDesktop(n ? n + ' ' + t('ile bağlantı kesildi.') : t('Bağlantı kesildi.'));
        break;
      case 'peer-left':
        cancelManageWith(info.id, false);
        toast((n || t('Arkadaşın')) + ' ' + t('ayrıldı'), 'error');
        notifyDesktop((n || t('Arkadaşın')) + ' ' + t('odadan ayrıldı.'));
        break;
      case 'host-left': cancelManageWith(s.hostPeerId, true); toast(t('Oda sahibi odayı kapattı'), 'error'); notifyDesktop(t('Oda sahibi odayı kapattı.')); break;
      default: break;
    }
  }

  // ================================================================== bilgisayarı yönet
  // Sağ tık menüsü → istek → karşı tarafta onayla/reddet penceresi.
  // Uygulama arka plandayken ayrıca masaüstü bildirimi gider; bildirime tıklanınca
  // kabuk 'notification-click' olayı gönderir ve bekleyen pencere öne getirilir.
  // Kabul edilince uzaktan kontrol başlar (aşağıdaki 'uzaktan kontrol' bölümü).
  const MANAGE_TIMEOUT_MS = 60000;   // yanıtsız istek iki tarafta da düşer
  let manageIncoming = null;         // { id, peerId, name, timer } — bize gelen, onay bekleyen
  let manageOutgoing = null;         // { id, peerId, name, timer } — bizim gönderdiğimiz
  let manageMenuPeerId = null;

  function manageMember(peerId) {
    const s = state.session;
    return s ? (s.members().find(m => m.id === peerId) || null) : null;
  }
  function manageLive(m) { return !!m && (m.status === 'connected' || m.status === 'unstable'); }

  function clearManageIncoming() {
    if (manageIncoming) clearTimeout(manageIncoming.timer);
    manageIncoming = null;
    $('#manage-modal').hidden = true;
  }
  function clearManageOutgoing() {
    if (manageOutgoing) clearTimeout(manageOutgoing.timer);
    manageOutgoing = null;
  }
  function cancelManageWith(peerId, silent) {
    if (!peerId) return;
    if (manageIncoming && manageIncoming.peerId === peerId) {
      clearManageIncoming();
      if (!silent) toast('Arkadaşın ayrıldığı için yönetim isteği iptal oldu.', 'error');
    }
    if (manageOutgoing && manageOutgoing.peerId === peerId) clearManageOutgoing();
    if (control && control.peerId === peerId) endControl(false);
  }

  // ------------------------------------------------ sağ tık menüsü
  function openPeerMenu(peerId, x, y) {
    const menu = $('#peer-menu');
    const item = $('#peer-menu-manage');
    manageMenuPeerId = peerId;
    const pending = !!manageOutgoing && manageOutgoing.peerId === peerId;
    item.disabled = pending || !manageLive(manageMember(peerId));
    $('span', item).textContent = pending ? 'İstek gönderildi, yanıt bekleniyor…' : 'Bilgisayarı Yönet';
    item.title = item.disabled && !pending ? 'Yönetim isteği için arkadaşının bağlı olması gerekir.' : '';
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
    if (!item.disabled) item.focus();
  }
  function closePeerMenu() {
    $('#peer-menu').hidden = true;
    manageMenuPeerId = null;
  }

  // ------------------------------------------------ isteği gönderme
  function sendManageRequest(peerId) {
    const s = state.session;
    const m = manageMember(peerId);
    if (!s || !manageLive(m)) { toast('Arkadaşın bağlı değil; istek gönderilemedi.', 'error'); return; }
    if (control) { toast('Zaten bir kontrol oturumu sürüyor.', 'error'); return; }
    if (manageOutgoing) { toast('Zaten yanıt bekleyen bir yönetim isteğin var.', 'error'); return; }
    const id = s.requestManagement(peerId);
    if (!id) { toast('İstek gönderilemedi. Bağlantıyı kontrol edip tekrar dene.', 'error'); return; }
    const name = m.name || 'Arkadaşın';
    manageOutgoing = { id, peerId, name, timer: 0 };
    manageOutgoing.timer = setTimeout(() => {
      if (manageOutgoing && manageOutgoing.id === id) {
        manageOutgoing = null;
        toast('Yönetim isteğine yanıt gelmedi (zaman aşımı).', 'error');
      }
    }, MANAGE_TIMEOUT_MS);
    toast(name + ' kişisine bilgisayarı yönetme isteği gönderildi.', 'ok');
  }

  // ------------------------------------------------ gelen istek + onay penceresi
  function onManageRequest(s, d) {
    if (state.session !== s || !d) return;
    if (control) return;            // kontrol sürerken ikinci istek gösterilmez
    if (manageIncoming) return;   // aynı anda tek istek gösterilir; yinelenenler yoksayılır
    const m = manageMember(d.peerId);
    const name = (m && m.name) || d.name || 'Arkadaşın';
    manageIncoming = { id: d.id, peerId: d.peerId, name, timer: 0 };
    manageIncoming.timer = setTimeout(() => {
      if (manageIncoming && manageIncoming.id === d.id) {
        clearManageIncoming();
        toast('Bilgisayarı yönetme isteği zaman aşımına uğradı.', 'error');
      }
    }, MANAGE_TIMEOUT_MS);
    showManageModal();
    // Uygulama arka planda / tepside / başka pencerenin arkasındaysa masaüstü bildirimi de göster.
    // Bildirime tıklanınca kabuk pencereyi öne getirip 'notification-click' olayı yollar.
    if (state.background || document.hidden || !document.hasFocus()) {
      FK.host.send('notify', {
        title: 'FK Sohbet',
        body: name + ' bilgisayarını yönetmek istiyor. Onaylamak için bildirime tıklayın.',
        action: 'manage-request',
      });
    }
  }

  function showManageModal() {
    if (!manageIncoming) return;
    const m = manageMember(manageIncoming.peerId);
    $('#manage-name').textContent = manageIncoming.name;
    P.paintAvatar($('#manage-avatar'), m || { name: manageIncoming.name, photo: '' });
    $('#manage-modal').hidden = false;
    $('#btn-manage-accept').focus();
  }

  function respondManage(accepted) {
    const req = manageIncoming;
    if (!req) return;
    const s = state.session;
    const sent = s ? s.respondManagement(req.peerId, req.id, accepted) : false;
    clearManageIncoming();
    if (!sent) { toast('Yanıt gönderilemedi: bağlantı koptu.', 'error'); return; }
    if (accepted) startControlled(req.peerId, req.name);
    else toast('Yönetim isteği reddedildi.');
  }

  // ------------------------------------------------ isteğimize gelen yanıt
  function onManageResponse(s, d) {
    if (state.session !== s || !d) return;
    if (!manageOutgoing || manageOutgoing.id !== d.id || manageOutgoing.peerId !== d.peerId) return;
    const name = manageOutgoing.name || d.name || 'Arkadaşın';
    clearManageOutgoing();
    if (d.accepted) startController(d.peerId, name);
    else toast(name + ' yönetim isteğini reddetti.', 'error');
  }

  // ================================================================== uzaktan kontrol
  // Kabul anında: kontrol edende "FK Sohbet - {İsim}'s PC" penceresi açılır (kabuk tarafı).
  // Ekran, kabuğun yakaladığı JPEG kareleriyle gelir; fare/klavye/kısayol/uygulama açma
  // komutları aynı veri kanalından geri akar ve karşı tarafta yerel olarak uygulanır.
  // Kontrol edilen tarafta üstte 'Kontrolü Durdur' göstergesi belirir; iki taraf da
  // oturumu istediği an bitirebilir. Bütün girdiler yalnızca aktif oturumda ve yalnızca
  // isteği kabul eden arkadaşla eşleşirse işlenir; kabuk tarafı da ayrıca kapı tutar.
  let control = null;   // { peerId, name, role: 'controller' | 'controlled' }

  function startController(peerId, name) {
    if (!FK.host.available) { toast('Uzaktan kontrol yalnızca FK Sohbet masaüstü uygulamasında çalışır.', 'error'); return; }
    if (control) endControl(false);
    control = { peerId, name: name || 'Arkadaşın', role: 'controller' };
    FK.host.send('control-open', { name: control.name });
    toast(control.name + ' isteği kabul etti; kontrol penceresi açılıyor.', 'ok');
  }

  function startControlled(peerId, name) {
    if (control) endControl(false);
    control = { peerId, name: name || 'Arkadaşın', role: 'controlled' };
    $('#control-text').textContent = control.name + ' bilgisayarını kontrol ediyor.';
    $('#control-banner').hidden = false;
    const s = state.session;
    if (s) s.startControl(peerId);   // karşı tarafa 'ekran geliyor' haberi
    FK.host.send('control-host-start', { name: control.name });   // kabuk ekranı yakalamaya başlar
    notifyDesktop(control.name + ' bilgisayarını kontrol ediyor. Durdurmak için FK Sohbet penceresindeki düğmeyi kullanın.');
    toast('Kontrol başladı: ' + control.name + ' bilgisayarını kontrol ediyor.', 'ok');
  }

  /** Kontrolü bitirir. notifyPeer: karşı tarafa da 'control-stop' gider. */
  function endControl(notifyPeer, message) {
    if (!control) return;
    const c = control;
    control = null;
    const s = state.session;
    if (notifyPeer && s) s.stopControl(c.peerId);
    if (c.role === 'controller') FK.host.send('control-close');       // kontrol penceresi kapanır
    else {
      FK.host.send('control-host-stop');                              // ekran yakalama durur
      $('#control-banner').hidden = true;
    }
    if (message) toast(message);
  }

  function controlWith(peerId, role) {
    return !!control && control.peerId === peerId && (!role || control.role === role);
  }

  // ------------------------------------------------ karşıdan gelenler (oturum olayları)
  function onControlStart(s, d) {
    if (state.session !== s || !d) return;
    if (controlWith(d.peerId, 'controller')) toast(control.name + ' ekranını paylaşmaya başladı.', 'ok');
  }

  function onControlStop(s, d) {
    if (state.session !== s || !d) return;
    if (!controlWith(d.peerId)) return;
    const name = control.name, wasControlled = control.role === 'controlled';
    endControl(false);
    toast(wasControlled ? name + ' kontrolü bitirdi.' : 'Kontrol oturumu karşı taraftan sona erdi.');
  }

  function onControlFrame(s, d) {
    if (state.session !== s || !d) return;
    if (!controlWith(d.peerId, 'controller')) return;
    FK.host.send('control-frame', { seq: d.seq, w: d.w, h: d.h, data: d.data });
  }

  function onControlInput(s, d) {
    if (state.session !== s || !d) return;
    if (!controlWith(d.peerId, 'controlled')) return;   // yalnızca kontrol edilen uygular
    FK.host.send('control-input', d.input);
  }

  function onControlLaunch(s, d) {
    if (state.session !== s || !d) return;
    if (!controlWith(d.peerId, 'controlled')) return;
    FK.host.send('control-launch', { app: d.app });
  }

  function onControlText(s, d) {
    if (state.session !== s || !d) return;
    if (!controlWith(d.peerId, 'controlled')) return;
    FK.host.send('control-text', { text: d.text });
  }

  // ------------------------------------------------ kabuktan gelenler
  function bindControlHost() {
    // Kontrol edilen: kabuğun yakaladığı kareyi arkadaşa gönder
    FK.host.on('control-capture', m => {
      if (!control || control.role !== 'controlled' || !state.session) return;
      state.session.sendControlFrame(control.peerId, { seq: m.seq, w: m.w, h: m.h, data: m.data });
    });
    // Kontrol eden: pencereden gelen girdileri arkadaşa gönder
    FK.host.on('control-input', m => {
      if (!control || control.role !== 'controller' || !state.session) return;
      state.session.sendControlInput(control.peerId, m);
    });
    FK.host.on('control-launch', m => {
      if (!control || control.role !== 'controller' || !state.session) return;
      state.session.sendControlLaunch(control.peerId, m.app);
    });
    FK.host.on('control-text', m => {
      if (!control || control.role !== 'controller' || !state.session) return;
      state.session.sendControlText(control.peerId, m.text);
    });
    // Kontrol penceresi kullanıcı tarafından kapatıldı → oturumu iki tarafta da bitir
    FK.host.on('control-closed', () => {
      if (control && control.role === 'controller') endControl(true, 'Kontrol penceresi kapatıldı; oturum sona erdi.');
    });
  }

  // ================================================================== sohbet & dosya paylaşımı
  let chatMessages = [];
  let unreadChatCount = 0;
  let typingTimer = null;
  let myTypingTimeout = null;
  let activePreviewFile = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function getFileCategory(name, mime) {
    const ext = (name || '').split('.').pop().toLowerCase();
    if (/^(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(ext) || (mime && mime.startsWith('image/'))) return 'img';
    if (ext === 'pdf' || (mime && mime.includes('pdf'))) return 'pdf';
    if (/^(zip|rar|7z|tar|gz|bz2)$/i.test(ext)) return 'zip';
    if (/^(js|json|css|html|cs|py|txt|md|cpp|c|h|java|sql|xml|sh|bat|ts|jsx|tsx)$/i.test(ext) || (mime && (mime.startsWith('text/') || mime.includes('json') || mime.includes('javascript')))) return 'code';
    return 'generic';
  }

  function formatTime(timestamp) {
    const d = timestamp ? new Date(timestamp) : new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function updateChatBadge() {
    const badge = $('#chat-unread-badge');
    if (!badge) return;
    if (unreadChatCount > 0) {
      badge.hidden = false;
      badge.textContent = unreadChatCount > 99 ? '99+' : unreadChatCount;
    } else {
      badge.hidden = true;
    }
  }

  function updateChatPartnerUI() {
    const s = state.session;
    const m = s ? (s.members()[0] || null) : null;
    const titleEl = $('#chat-title');
    const avatarCharEl = $('#chat-avatar-char');
    const avatarEl = $('#chat-partner-avatar');
    const statusEl = $('#chat-partner-status');
    if (!titleEl) return;
    const name = (m && m.name) ? m.name : 'Arkadaşın';
    titleEl.textContent = name;
    if (avatarCharEl) avatarCharEl.textContent = name.charAt(0).toUpperCase() || 'A';
    if (avatarEl) {
      if (m && m.photo) {
        avatarEl.style.backgroundImage = 'url(' + m.photo + ')';
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.style.backgroundPosition = 'center';
        if (avatarCharEl) avatarCharEl.hidden = true;
      } else {
        avatarEl.style.backgroundImage = 'none';
        if (avatarCharEl) avatarCharEl.hidden = false;
      }
    }
    if (statusEl && !statusEl.classList.contains('typing')) {
      statusEl.textContent = (m && m.connected) ? 'çevrimiçi' : (s ? 'bağlanıyor...' : 'çevrimdışı');
    }
  }

  function openChat() {
    state.chatOpen = true;
    const modal = $('#chat-modal');
    const btn = $('#btn-chat');
    if (modal) modal.hidden = false;
    if (btn) btn.classList.add('active');
    unreadChatCount = 0;
    updateChatBadge();
    updateChatPartnerUI();
    const body = $('#chat-messages-container');
    if (body) body.scrollTop = body.scrollHeight;
    const input = $('#chat-input');
    if (input) setTimeout(() => input.focus(), 50);
  }

  function closeChat() {
    state.chatOpen = false;
    dragDepth = 0;
    setDropZone(false);
    closeEmojiPanel();
    const modal = $('#chat-modal');
    const btn = $('#btn-chat');
    if (modal) modal.hidden = true;
    if (btn) btn.classList.remove('active');
  }

  function toggleChat() {
    if (state.chatOpen) closeChat();
    else openChat();
  }

  function resetChat() {
    // bellekte kalan dosya URL'lerini serbest bırak
    chatMessages.forEach(m => {
      const u = m.file && m.file.url;
      if (u && u.indexOf('blob:') === 0) { try { URL.revokeObjectURL(u); } catch (e) { /* yok */ } }
      const p = m._previewUrl;
      if (p && p.indexOf('blob:') === 0) { try { URL.revokeObjectURL(p); } catch (e) { /* yok */ } }
    });
    chatMessages = [];
    unreadChatCount = 0;
    updateChatBadge();
    closeChat();
    closeFilePreview();
    const list = $('#chat-messages-container');
    if (list) {
      const fixed = list.querySelectorAll('.chat-p2p-notice, .chat-date-pill');
      list.innerHTML = '';
      fixed.forEach(n => list.appendChild(n));
    }
  }

  /** CSS seçicide güvenli kimlik. */
  function cssId(id) {
    const v = String(id == null ? '' : id);
    return (window.CSS && CSS.escape) ? CSS.escape(v) : v.replace(/["\\\]]/g, '\\$&');
  }

  function chatStatusMeta(msg) {
    const meta = document.createElement('div');
    meta.className = 'chat-bubble-meta';
    const time = document.createElement('span');
    time.textContent = formatTime(msg.time);
    meta.appendChild(time);
    if (msg.sender !== 'me') return meta;

    meta.appendChild(document.createTextNode(' '));
    const st = document.createElement('span');
    if (msg.file && msg.state === 'sending') {
      st.className = 'chat-status wait';
      st.textContent = 'Gönderiliyor…';
    } else if (msg.file && msg.state === 'failed') {
      st.className = 'chat-status err';
      st.textContent = 'Gönderilemedi';
    } else if (msg.state === 'delivered') {
      st.className = 'chat-status ok';
      st.textContent = '✓✓';
    } else if (msg.file) {
      st.className = 'chat-status ok';
      st.textContent = '✓';
    } else {
      st.className = 'chat-ticks';
      st.textContent = '✓✓';
    }
    meta.appendChild(st);
    return meta;
  }

  /** WhatsApp benzeri dairesel ilerleme göstergesi. */
  function chatProgressBlock(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'cf-progress';
    wrap.innerHTML =
      '<svg class="cf-ring" viewBox="0 0 36 36" aria-hidden="true">' +
        '<circle class="cf-ring-bg" cx="18" cy="18" r="15.5"></circle>' +
        '<circle class="cf-ring-bar" cx="18" cy="18" r="15.5"></circle>' +
      '</svg>' +
      '<div class="cf-progress-text">' +
        '<strong class="cf-pct">%0</strong>' +
        '<span class="cf-label">' + (msg.state === 'receiving' ? 'Alınıyor…' : 'Gönderiliyor…') + '</span>' +
      '</div>';
    return wrap;
  }

  /** WhatsApp tarzı GIF balonu: görsel + gönderim halkası. */
  function buildGifBubble(msg) {
    const busy = msg.state === 'sending' || msg.state === 'receiving';
    const failed = msg.state === 'failed';
    const src = (msg.file && msg.file.url) || msg._previewUrl || '';
    const box = document.createElement('div');
    box.className = 'chat-gif' + (busy ? ' busy' : '') + (failed ? ' failed' : '');

    if (src) {
      const img = document.createElement('img');
      img.className = 'chat-gif-img';
      img.src = src;
      img.alt = 'GIF';
      img.draggable = false;
      img.addEventListener('click', () => openFilePreview(msg.file));
      box.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'chat-gif-ph';
      ph.textContent = 'GIF';
      box.appendChild(ph);
    }

    if (busy) {
      const ov = document.createElement('div');
      ov.className = 'chat-gif-prog';
      // inline style niteliği CSP tarafından engellenir; halka ölçüleri CSS'ten gelir,
      // güncellemeler updateChatProgress içinde CSSOM ile yapılır.
      ov.innerHTML =
        '<svg class="cf-ring" viewBox="0 0 36 36" aria-hidden="true">' +
          '<circle class="cf-ring-bg" cx="18" cy="18" r="15.5"></circle>' +
          '<circle class="cf-ring-bar" cx="18" cy="18" r="15.5"></circle>' +
        '</svg>' +
        '<span class="cf-pct">%0</span>';
      box.appendChild(ov);
    } else if (failed) {
      const ov = document.createElement('div');
      ov.className = 'chat-gif-failed';
      const txt = document.createElement('span');
      txt.textContent = 'Gönderilemedi';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-file-btn cf-retry';
      btn.textContent = 'Tekrar dene';
      btn.addEventListener('click', () => retryChatSend(msg));
      ov.appendChild(txt);
      ov.appendChild(btn);
      box.appendChild(ov);
    }
    return box;
  }

  function buildChatMessageNode(msg) {
    const row = document.createElement('div');
    row.className = 'chat-msg ' + (msg.sender === 'me' ? 'out' : 'in');
    if (msg.id) row.dataset.id = msg.id;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';

    if (msg.file && isGifFile(msg.file)) {
      bubble.classList.add('gif-bubble');
      bubble.appendChild(buildGifBubble(msg));
    } else if (msg.file) {
      const cat = getFileCategory(msg.file.name, msg.file.mime);
      const src = msg.file.url || msg.file.data || '';
      const busy = msg.state === 'sending' || msg.state === 'receiving';
      const card = document.createElement('div');
      card.className = 'chat-file-card' + (busy ? ' busy' : '') + (msg.state === 'failed' ? ' failed' : '');

      if (cat === 'img' && src && !busy) {
        const thumb = document.createElement('img');
        thumb.className = 'chat-file-thumb';
        thumb.src = src;
        thumb.alt = msg.file.name;
        thumb.addEventListener('click', () => openFilePreview(msg.file));
        // bozuk/okunamayan görselde kırık simge yerine dosya kartı kalsın
        thumb.addEventListener('error', () => { thumb.remove(); });
        card.appendChild(thumb);
      }

      const info = document.createElement('div');
      info.className = 'chat-file-info';

      const icon = document.createElement('div');
      icon.className = 'chat-file-icon ' + cat;
      const ext = (msg.file.name || 'file').split('.').pop().toUpperCase();
      icon.textContent = ext.slice(0, 4);

      const textWrap = document.createElement('div');
      textWrap.className = 'chat-file-text';

      const name = document.createElement('div');
      name.className = 'chat-file-name';
      name.textContent = msg.file.name;
      name.title = msg.file.name;

      const size = document.createElement('div');
      size.className = 'chat-file-size';
      size.textContent = formatBytes(msg.file.size);

      textWrap.appendChild(name);
      textWrap.appendChild(size);
      info.appendChild(icon);
      info.appendChild(textWrap);
      card.appendChild(info);

      if (busy) {
        card.appendChild(chatProgressBlock(msg));
      } else if (msg.state === 'failed') {
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'chat-file-btn cf-retry';
        retry.innerHTML = '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 4v6h6M20 20v-6h-6"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M20 9a8 8 0 0 0-14-3M4 15a8 8 0 0 0 14 3"/></svg> Tekrar dene';
        retry.addEventListener('click', () => retryChatSend(msg));
        card.appendChild(retry);
      } else {
        const actions = document.createElement('div');
        actions.className = 'chat-file-actions';

        const prevBtn = document.createElement('button');
        prevBtn.className = 'chat-file-btn btn-prev';
        prevBtn.type = 'button';
        prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg> Önizle';
        prevBtn.addEventListener('click', () => openFilePreview(msg.file));

        const dlBtn = document.createElement('button');
        dlBtn.className = 'chat-file-btn';
        dlBtn.type = 'button';
        dlBtn.innerHTML = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> İndir';
        dlBtn.addEventListener('click', () => downloadFile(msg.file));

        actions.appendChild(prevBtn);
        actions.appendChild(dlBtn);
        card.appendChild(actions);
      }

      bubble.appendChild(card);
    }

    if (msg.text) {
      const textNode = document.createElement('div');
      textNode.className = 'chat-bubble-text';
      textNode.textContent = msg.text;
      if (!msg.file && isEmojiOnly(msg.text)) bubble.classList.add('emoji-only');
      bubble.appendChild(textNode);
    }

    bubble.appendChild(chatStatusMeta(msg));
    row.appendChild(bubble);
    return row;
  }

  /** İlerleme çubuğunu yeniden çizmeden günceller (binlerce parça için). */
  function updateChatProgress(msg) {
    const row = document.querySelector('#chat-messages-container .chat-msg[data-id="' + cssId(msg.id) + '"]');
    if (!row) return;
    const ratio = Math.max(0, Math.min(1, msg.progress || 0));
    const len = 2 * Math.PI * 15.5;
    const bar = row.querySelector('.cf-ring-bar');
    if (bar) {
      bar.style.strokeDasharray = String(len);
      bar.style.strokeDashoffset = String(len * (1 - ratio));
    }
    const pct = row.querySelector('.cf-pct');
    if (pct) pct.textContent = '%' + Math.round(ratio * 100);
  }

  /** Aynı kimlikli balon varsa yerine koyar, yoksa ekler. */
  function upsertChatMessage(msg) {
    const list = $('#chat-messages-container');
    if (!list) return;
    const node = buildChatMessageNode(msg);
    const old = msg.id ? list.querySelector('.chat-msg[data-id="' + cssId(msg.id) + '"]') : null;
    if (old) {
      old.replaceWith(node);
    } else {
      list.appendChild(node);
      list.scrollTop = list.scrollHeight;
    }
    if (msg.state === 'sending' || msg.state === 'receiving') updateChatProgress(msg);
  }

  function renderChatMessage(msg) { upsertChatMessage(msg); }

  /** Karşı taraftan dosya gelmeye başladı: anında "Alınıyor…" balonu açılır. */
  function onIncomingFile(s, d) {
    if (state.session !== s) return;
    if (chatMessages.some(m => m.id === d.id)) return;
    const msg = {
      id: d.id,
      sender: 'partner',
      senderName: d.senderName,
      state: 'receiving',
      progress: 0,
      text: '',
      time: d.time || Date.now(),
      file: { name: d.file.name, size: d.file.size, mime: d.file.mime }
    };
    chatMessages.push(msg);
    upsertChatMessage(msg);
  }

  function onChatMessage(s, detail) {
    if (state.session !== s) return;
    const known = chatMessages.find(m => m.id === detail.id);
    if (known) {
      Object.assign(known, detail);
      upsertChatMessage(known);
    } else {
      chatMessages.push(detail);
      renderChatMessage(detail);
    }

    if (!state.chatOpen) {
      unreadChatCount++;
      updateChatBadge();
    }

    // Masaüstü bildirimi: uygulama arka planda veya simge durumundayken (veya sohbet kapalıyken)
    const isBackground = state.background || document.hidden || !document.hasFocus();
    if (isBackground || !state.chatOpen) {
      let bodyText = '';
      if (detail.file) {
        bodyText = '📎 ' + detail.file.name + (detail.text ? ('\n' + detail.text) : '');
      } else {
        bodyText = detail.text || '';
      }
      const title = detail.senderName || 'FK Sohbet';
      FK.host.send('notify', {
        title: title,
        body: bodyText,
        action: 'chat',
        force: isBackground
      });
      if (!FK.host.available && window.Notification && Notification.permission === 'granted' && isBackground) {
        try { new Notification(title, { body: bodyText }); } catch (e) { /* yok */ }
      }
    }
  }

  function onChatTyping(s, detail) {
    if (state.session !== s) return;
    const statusEl = $('#chat-partner-status');
    if (!statusEl) return;
    if (detail.typing) {
      statusEl.textContent = 'yazıyor...';
      statusEl.classList.add('typing');
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        statusEl.classList.remove('typing');
        updateChatPartnerUI();
      }, 3000);
    } else {
      statusEl.classList.remove('typing');
      updateChatPartnerUI();
    }
  }

  function sendCurrentChatMessage() {
    const input = $('#chat-input');
    if (!input || !state.session) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';

    const msg = state.session.sendChatMessage(text);
    if (msg) {
      chatMessages.push(msg);
      renderChatMessage(msg);
    }
    state.session.sendChatTyping(false);
  }


  // ------------------------------------------------ emoji seçici (WhatsApp tarzı)
  // Her öğe "emoji|arama sözcükleri" biçiminde; arama Türkçe harfleri sadeleştirir.
  const EMOJI_CATS = [
    { id: 'smile', icon: '😀', label: 'Gülüş', keys: 'gülen yüz ifade ruh hali mutlu üzgün kızgın komik',
      items: ['😀|gülen mutlu', '😃|gülen mutlu ağız açık', '😄|gülen neşeli', '😁|sırıtkan gülen', '😆|gülmekten kırılmak', '😅|ter gülümseme rahatlama', '🤣|kahkaha yerde yuvarlanmak', '😂|kahkaha gözyaşı', '🙂|hafif gülümseme', '🙃|ters yüz', '😉|göz kırpma', '😊|utangaç gülümseme', '😇|melek masum', '🥰|aşık sevgi kalpler', '😍|aşık gözler kalp', '🤩|yıldız şaşkın heyecan', '😘|öpücük kalp', '😋|lezzetli nefis', '😛|dil çıkarmak', '😜|dil göz kırpma şaka', '🤪|çılgın deli', '😝|dil kapalı göz', '🤗|sarılmak kucak', '🤭|el ağız gülme utanma', '🤫|sessiz şşş sır', '🤔|düşünen düşünmek', '😐|nötr ifadesiz', '😑|ifadesiz', '😶|sessiz yüz', '🙄|göz devirme', '😬|diş sıkma gergin', '😮|şaşkın ağız açık', '😲|şaşırmış', '😴|uyuyan uyku', '🤤|salya iştah', '😷|maske hasta', '🤒|ateş hasta', '🤢|mide bulantısı', '🤮|kusmuk', '🥵|sıcak terleme', '🥶|soğuk donma', '😵|baygın baş dönmesi', '🤯|kafa patladı şok', '🤠|kovboy', '🥳|parti kutlama', '😎|havalı güneş gözlük', '🤓|inek gözlük', '🧐|inceleyen mercek', '😕|kafası karışık', '😟|endişeli', '🙁|üzgün', '😳|utanmış şaşkın', '🥺|yalvaran üzgün', '😨|korkmuş', '😢|ağlayan', '😭|hıçkırarak ağlamak', '😱|çığlık korku', '😖|sıkıntı', '😞|hayal kırıklığı', '😩|bitkin', '🥱|esneyen', '😤|öfkeli nefes', '😡|öfkeli kızgın', '😠|kızgın', '🤬|küfür öfke', '😈|şeytan', '💀|kafatası ölüm', '💩|kaka', '🤡|palyaço', '👻|hayalet', '👽|uzaylı', '🤖|robot'] },
    { id: 'el', icon: '👋', label: 'El', keys: 'el işaret parmak jest',
      items: ['👋|el sallama merhaba', '🤚|el kaldır', '🖐️|beş parmak el', '✋|dur el', '🖖|spock', '👌|tamam', '🤌|italyan el', '🤏|azıcık', '✌️|zafer iki parmak', '🤞|şans parmak', '🤟|seni seviyorum işaret', '🤘|rock', '🤙|ara beni', '👈|sol işaret', '👉|sağ işaret', '👆|yukarı işaret', '👇|aşağı işaret', '☝️|işaret parmağı', '👍|beğen başparmak', '👎|beğenme', '✊|yumruk', '👊|yumruk', '🤛|yumruk', '🤜|yumruk', '👏|alkış', '🙌|kutlama eller', '👐|açık eller', '🤲|dua açık el', '🤝|tokalaşma anlaşma', '🙏|dua teşekkür', '💪|pazı güçlü', '✍️|yazı yazma', '💅|oje tırnak'] },
    { id: 'kalp', icon: '❤️', label: 'Kalp', keys: 'kalp aşk sevgi duygu',
      items: ['❤️|kırmızı kalp aşk', '🧡|turuncu kalp', '💛|sarı kalp', '💚|yeşil kalp', '💙|mavi kalp', '💜|mor kalp', '🖤|siyah kalp', '🤍|beyaz kalp', '🤎|kahverengi kalp', '💔|kırık kalp', '💕|iki kalp', '💞|dönen kalp', '💓|atan kalp', '💗|büyüyen kalp', '💖|parlayan kalp', '💘|ok kalp', '💝|kurdeleli kalp', '💋|öpücük dudak', '💌|aşk mektubu'] },
    { id: 'hayvan', icon: '🐶', label: 'Hayvan', keys: 'hayvan doğa',
      items: ['🐶|köpek', '🐱|kedi', '🐭|fare', '🐹|hamster', '🐰|tavşan', '🦊|tilki', '🐻|ayı', '🐼|panda', '🐨|koala', '🐯|kaplan', '🦁|aslan', '🐮|inek', '🐷|domuz', '🐸|kurbağa', '🐵|maymun', '🐔|tavuk', '🐧|penguen', '🐦|kuş', '🦅|kartal', '🦉|baykuş', '🐺|kurt', '🐴|at', '🦄|tek boynuzlu at', '🐝|arı', '🦋|kelebek', '🐢|kaplumbağa', '🐍|yılan', '🐙|ahtapot', '🦀|yengeç', '🐬|yunus', '🐳|balina', '🦒|zürafa', '🐘|fil', '🦍|goril', '🐞|uğur böceği', '🐟|balık'] },
    { id: 'yemek', icon: '🍔', label: 'Yemek', keys: 'yiyecek içecek yemek meyve',
      items: ['🍎|elma', '🍌|muz', '🍉|karpuz', '🍇|üzüm', '🍓|çilek', '🍒|kiraz', '🍑|şeftali', '🍍|ananas', '🥝|kivi', '🍅|domates', '🥑|avokado', '🥕|havuç', '🌽|mısır', '🍞|ekmek', '🧀|peynir', '🍳|yumurta', '🥞|krep', '🥓|pastırma', '🍔|hamburger', '🍟|patates kızartması', '🍕|pizza', '🌭|sosisli', '🥪|sandviç', '🌮|taco', '🍜|erişte', '🍝|makarna', '🍣|suşi', '🍚|pirinç pilav', '🍦|dondurma', '🍰|pasta dilimi', '🎂|doğum günü pastası', '🍫|çikolata', '🍬|şeker', '🍭|lolipop', '☕|kahve', '🍵|çay', '🍺|bira', '🍻|kadeh bira', '🥂|kadeh kutlama', '🍷|şarap'] },
    { id: 'aktivite', icon: '⚽', label: 'Aktivite', keys: 'spor oyun aktivite müzik',
      items: ['⚽|futbol topu', '🏀|basketbol', '🏈|amerikan futbolu', '⚾|beyzbol', '🎾|tenis', '🏐|voleybol', '🎱|bilardo', '🏓|masa tenisi', '🏸|badminton', '🥊|boks', '🎯|hedef ok', '🎮|oyun kolu', '🕹️|joystick', '🎲|zar', '🎳|bovling', '🏆|kupa', '🥇|altın madalya', '🥈|gümüş madalya', '🥉|bronz madalya', '🎸|gitar', '🎹|piyano', '🎺|trompet', '🎧|kulaklık', '🎤|mikrofon', '🎬|klaket film', '📸|fotoğraf makinesi', '🎨|palet sanat', '🎭|tiyatro maske'] },
    { id: 'seyahat', icon: '✈️', label: 'Seyahat', keys: 'seyahat araç taşıt yol tatil',
      items: ['🚗|araba', '🚕|taksi', '🚌|otobüs', '🚑|ambulans', '🚒|itfaiye', '🚓|polis', '🏎️|yarış arabası', '🚲|bisiklet', '🛴|scooter', '🏍️|motosiklet', '🚂|tren', '🚄|hızlı tren', '✈️|uçak', '🚀|roket', '🛸|ufo', '🚁|helikopter', '⛵|yelkenli', '🚢|gemi', '🗺️|harita', '🏔️|dağ', '🏕️|kamp', '🏖️|plaj', '🌊|dalga deniz', '🎡|dönme dolap', '🏙️|şehir', '🌍|dünya', '🌙|ay', '⭐|yıldız'] },
    { id: 'nesne', icon: '💡', label: 'Nesne', keys: 'nesne eşya alet',
      items: ['⌚|saat', '📱|telefon', '💻|laptop', '⌨️|klavye', '🖥️|monitör bilgisayar', '🖨️|yazıcı', '🖱️|fare mouse', '💾|disket kaydet', '💿|cd', '📷|fotoğraf kamera', '🎥|video kamera', '📺|televizyon', '📻|radyo', '💡|ampul fikir', '🔦|el feneri', '🔑|anahtar', '🔒|kilit', '🔨|çekiç', '🔧|ingiliz anahtarı', '🧲|mıknatıs', '💰|para', '💳|kart', '💎|elmas', '🎁|hediye', '🎈|balon', '📦|kutu paket', '📎|ataç', '✂️|makas', '📝|not', '✏️|kalem', '📚|kitaplar', '📖|kitap', '📅|takvim', '📌|raptiye'] },
    { id: 'sembol', icon: '✅', label: 'Sembol', keys: 'sembol işaret ok uyarı',
      items: ['✅|onay tik', '❌|çarpı hayır', '⭕|daire', '❗|ünlem', '❓|soru', '💯|yüz puan mükemmel', '🔥|ateş', '✨|ışıltı', '⚡|şimşek enerji', '💥|patlama', '💦|su damla', '💨|rüzgar', '🎉|parti konfeti kutlama', '🎊|konfeti', '🏁|bayrak bitiş', '🚫|yasak', '⚠️|uyarı', '♻️|geri dönüşüm', '🔴|kırmızı daire', '🟢|yeşil daire', '🔵|mavi daire', '🟣|mor daire', '⚫|siyah daire', '⚪|beyaz daire', '🆗|tamam', '🆒|havalı', '💤|uyku', '🎵|nota müzik', '🎶|notalar', '➡️|sağ ok', '⬅️|sol ok', '⬆️|yukarı ok', '⬇️|aşağı ok'] }
  ];

  // ------------------------------------------------ GIF (Giphy) — emoji panelinin sekmesi
  const GIPHY_API = (FK.config && FK.config.GIPHY_API) || 'https://api.giphy.com/v1/gifs';
  const GIPHY_LIMIT = (FK.config && FK.config.GIPHY_LIMIT) || 24;
  const GIPHY_RATING = (FK.config && FK.config.GIPHY_RATING) || 'pg-13';
  const GIPHY_DEBOUNCE = (FK.config && FK.config.GIPHY_SEARCH_DEBOUNCE_MS) || 420;

  let gifItems = [];
  let gifQuery = '';
  let gifLoading = false;
  let gifError = '';
  let gifSeq = 0;
  let gifTimer = null;
  const gifCache = new Map();

  function giphyKey() {
    const k = S.get('giphyKey');
    return String(k || '').trim();
  }

  function isGifFile(file) {
    if (!file) return false;
    const mime = String(file.mime || '').toLowerCase();
    const name = String(file.name || '').toLowerCase();
    return mime === 'image/gif' || /\.gif$/.test(name);
  }

  function toGifItem(g) {
    if (!g || !g.images) return null;
    const orig = g.images.original || {};
    const prev = g.images.fixed_width || g.images.downsized || orig;
    const prevUrl = prev && prev.url;
    if (!prevUrl) return null;
    return {
      id: String(g.id || '').slice(0, 48) || ('g' + Math.random().toString(36).slice(2, 10)),
      title: String(g.title || 'GIF').slice(0, 90),
      preview: prevUrl,
      url: orig.url || prevUrl
    };
  }

  async function loadGifs(term, force) {
    const q = String(term || '').trim();
    const key = giphyKey();
    gifQuery = q;
    if (!key) { gifItems = []; gifError = ''; gifLoading = false; renderGifPanel(); return; }

    const cacheKey = q ? 'q:' + q.toLowerCase() : '__trending__';
    if (!force && gifCache.has(cacheKey)) {
      gifItems = gifCache.get(cacheKey);
      gifError = '';
      gifLoading = false;
      renderGifPanel();
      return;
    }

    const seq = ++gifSeq;
    gifLoading = true;
    gifError = '';
    renderGifPanel();
    try {
      const base = q ? GIPHY_API + '/search' : GIPHY_API + '/trending';
      const url = base
        + '?api_key=' + encodeURIComponent(key)
        + '&limit=' + GIPHY_LIMIT
        + '&rating=' + encodeURIComponent(GIPHY_RATING)
        + (q ? '&q=' + encodeURIComponent(q) : '');
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(res.status === 401 || res.status === 403 ? 'Anahtar reddedildi' : 'Giphy: HTTP ' + res.status);
      }
      const json = await res.json();
      if (seq !== gifSeq) return;
      const list = ((json && json.data) || []).map(toGifItem).filter(Boolean);
      gifCache.set(cacheKey, list);
      gifItems = list;
      gifLoading = false;
      gifError = '';
      renderGifPanel();
    } catch (e) {
      if (seq !== gifSeq) return;
      gifLoading = false;
      gifItems = [];
      gifError = (e && e.message) || "GIF'lere ulaşılamadı";
      renderGifPanel();
    }
  }

  function gifNote(title, detail, spin) {
    const box = document.createElement('div');
    box.className = 'ep-gif-note';
    if (spin) {
      const sp = document.createElement('div');
      sp.className = 'ep-gif-spin';
      box.appendChild(sp);
    }
    if (title) {
      const t = document.createElement('strong');
      t.textContent = title;
      box.appendChild(t);
    }
    if (detail) {
      const d = document.createElement('span');
      d.textContent = detail;
      box.appendChild(d);
    }
    return box;
  }

  function gifKeyPrompt() {
    const box = gifNote('Giphy anahtarı gerekli', 'Ücretsiz anahtar: developers.giphy.com → Create an App. Anahtarı buraya yapıştır; yalnızca bu bilgisayarda saklanır.');

    const row = document.createElement('div');
    row.className = 'ep-gif-key';

    const input = document.createElement('input');
    input.className = 'ep-input';
    input.type = 'password';
    input.placeholder = 'Giphy API anahtarı';
    input.setAttribute('aria-label', 'Giphy API anahtarı');
    input.spellcheck = false;
    input.autocomplete = 'off';

    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'btn btn-primary btn-sm';
    save.textContent = 'Kaydet';

    const commit = () => {
      const v = input.value.trim();
      if (!v) { input.focus(); return; }
      S.set('giphyKey', v);        // set() değişikliği yayar → gifCache temizlenir
      syncBindings();              // Ayarlar > GIF alanı da güncellensin
      gifCache.clear();
      loadGifs(gifQuery);
    };
    save.addEventListener('click', commit);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.stopPropagation(); closeEmojiPanel(); }
    });

    row.appendChild(input);
    row.appendChild(save);
    box.appendChild(row);

    const hint = document.createElement('span');
    hint.className = 'ep-gif-hint';
    hint.textContent = 'Anahtarı sonradan Ayarlar → GIF bölümünden de değiştirebilirsin.';
    box.appendChild(hint);
    return box;
  }

  function renderGifPanel() {
    const box = $('#chat-gif-grid');
    if (!box) return;
    setPanelMode(true);
    box.innerHTML = '';

    if (!giphyKey()) { box.appendChild(gifKeyPrompt()); return; }
    if (gifLoading) { box.appendChild(gifNote("GIF'ler yükleniyor…", '', true)); return; }
    if (gifError) {
      const err = gifNote("GIF'ler alınamadı", gifError);
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.className = 'btn btn-secondary btn-sm';
      retry.textContent = 'Tekrar dene';
      retry.addEventListener('click', () => {
        if (!navigator.onLine) { toast('İnternet bağlantısı yok', 'warn'); return; }
        loadGifs(gifQuery, true);
      });
      err.appendChild(retry);
      box.appendChild(err);
      return;
    }
    if (!gifItems.length) {
      box.appendChild(gifQuery
        ? gifNote('Sonuç yok', 'Başka bir şey dene: “kutlama”, “kahkaha”, “kedi”…')
        : gifNote('GIF bulunamadı', 'Yukarıdaki arama kutusuna bir şey yaz.'));
      return;
    }

    const head = document.createElement('div');
    head.className = 'ep-gif-head';
    head.textContent = gifQuery ? 'Sonuçlar' : 'Öne çıkanlar';
    box.appendChild(head);

    const grid = document.createElement('div');
    grid.className = 'ep-gif-grid';
    gifItems.forEach(it => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ep-gif-item';
      b.title = it.title;
      b.setAttribute('aria-label', it.title);
      const img = document.createElement('img');
      img.src = it.preview;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      b.appendChild(img);
      b.addEventListener('click', () => sendGif(it, b));
      grid.appendChild(b);
    });
    box.appendChild(grid);
  }

  /** GIF'i Giphy'den indirip sohbete dosya olarak (P2P) gönderir. */
  async function sendGif(item, btn) {
    if (!item || item._busy) return;
    if (!state.session) { toast('GIF göndermek için bir odada olmalısın', 'warn'); return; }
    item._busy = true;
    if (btn) btn.classList.add('is-loading');
    try {
      const res = await fetch(item.url, { cache: 'force-cache' });
      if (!res.ok) throw new Error('GIF indirilemedi (HTTP ' + res.status + ')');
      const blob = await res.blob();
      if (!blob.size) throw new Error('GIF boş geldi');
      if (blob.size > FILE_MAX_BYTES) throw new Error('GIF 1 GB sınırını aşıyor');
      const type = /gif/i.test(blob.type || '') ? 'image/gif' : 'image/gif';
      const file = new File([blob], 'giphy-' + item.id + '.gif', { type });
      queueFiles([file]);
      closeEmojiPanel();
    } catch (e) {
      toast((e && e.message) || 'GIF gönderilemedi', 'error');
    } finally {
      item._busy = false;
      if (btn) btn.classList.remove('is-loading');
    }
  }

  /** Panel emoji mi GIF mi gösteriyor? */
  function setPanelMode(isGif) {
    const grid = $('#chat-emoji-grid');
    const gifs = $('#chat-gif-grid');
    const search = $('#chat-emoji-search');
    const tabs = $('#chat-emoji-tabs');
    const bEmoji = $('#chat-mode-emoji');
    const bGif = $('#chat-mode-gif');
    if (grid) grid.hidden = !!isGif;
    if (gifs) gifs.hidden = !isGif;
    if (tabs) tabs.hidden = !!isGif;
    if (bEmoji) { bEmoji.classList.toggle('on', !isGif); bEmoji.setAttribute('aria-selected', isGif ? 'false' : 'true'); }
    if (bGif) { bGif.classList.toggle('on', !!isGif); bGif.setAttribute('aria-selected', isGif ? 'true' : 'false'); }
    if (search) {
      const label = isGif ? 'GIF ara' : 'Emoji ara';
      search.placeholder = label;
      search.setAttribute('aria-label', label);
    }
  }

  /** Üstteki arama kutusu açık mı? */
  function searchRowOpen() {
    const row = $('#chat-emoji-searchrow');
    return !!(row && !row.hidden);
  }

  function syncSearchRow() {
    const btn = $('#chat-emoji-searchbtn');
    if (btn) btn.setAttribute('aria-expanded', searchRowOpen() ? 'true' : 'false');
  }

  function openSearchRow() {
    const row = $('#chat-emoji-searchrow');
    if (!row || !row.hidden) return;
    row.hidden = false;
    syncSearchRow();
    const inp = $('#chat-emoji-search');
    if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 30); }
  }

  function closeSearchRow() {
    const row = $('#chat-emoji-searchrow');
    const inp = $('#chat-emoji-search');
    if (inp) inp.value = '';
    if (row) row.hidden = true;
    syncSearchRow();
    if (panelMode === 'gif') {
      if (gifQuery) { gifQuery = ''; loadGifs('', false); }
    } else if (emojiQuery) {
      emojiQuery = '';
      renderEmojiGrid();
    }
  }

  /** Emoji ↔ GIF geçişi. */
  function switchPanelMode(mode) {
    if (mode === panelMode) return;
    const wasSearch = searchRowOpen();
    if (panelMode === 'emoji') lastEmojiTab = emojiTab;
    panelMode = mode;
    emojiQuery = '';
    gifQuery = '';
    gifError = '';
    const inp = $('#chat-emoji-search');
    if (inp) inp.value = '';
    if (mode === 'gif') {
      setPanelMode(true);
      renderEmojiTabs();
      loadGifs('');
    } else {
      if (lastEmojiTab) emojiTab = lastEmojiTab;
      setPanelMode(false);
      renderEmojiTabs();
      renderEmojiGrid();
    }
    if (!wasSearch) closeSearchRowSilent();
    syncSearchRow();
  }

  /** Arama kutusunu gizle ama sorguyu/sonucu bozma (mod değişiminde kullanılır). */
  function closeSearchRowSilent() {
    const row = $('#chat-emoji-searchrow');
    const inp = $('#chat-emoji-search');
    if (inp) inp.value = '';
    if (row) row.hidden = true;
    syncSearchRow();
  }

  const EMOJI_RECENT_KEY = 'fksohbet.emojis.recent';
  let emojiTab = null;          // emoji kategorisi (asla 'gif' olmaz)
  let panelMode = 'emoji';      // 'emoji' | 'gif'
  let lastEmojiTab = null;      // GIF'ten emojiye dönünce hatırlanır
  let emojiQuery = '';

  function trFold(v) {
    return String(v || '').toLocaleLowerCase('tr')
      .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c')
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/î/g, 'i').replace(/â/g, 'a');
  }

  function loadRecentEmojis() {
    try {
      const raw = JSON.parse(localStorage.getItem(EMOJI_RECENT_KEY) || '[]');
      return Array.isArray(raw) ? raw.filter(x => typeof x === 'string').slice(0, 24) : [];
    } catch (e) { return []; }
  }

  function saveRecentEmojis(list) {
    try { localStorage.setItem(EMOJI_RECENT_KEY, JSON.stringify(list.slice(0, 24))); } catch (e) { /* yok */ }
  }

  function pushRecentEmoji(ch) {
    const list = loadRecentEmojis().filter(x => x !== ch);
    list.unshift(ch);
    saveRecentEmojis(list);
    if (emojiTab === 'recent' && !emojiQuery) renderEmojiGrid();
  }

  function renderEmojiGrid() {
    const grid = $('#chat-emoji-grid');
    if (!grid) return;
    if (panelMode === 'gif') { renderGifPanel(); return; }
    setPanelMode(false);
    grid.innerHTML = '';
    const out = [];
    const q = trFold(emojiQuery.trim());
    if (q) {
      EMOJI_CATS.forEach(cat => {
        const head = trFold(cat.label + ' ' + cat.keys);
        cat.items.forEach(item => {
          const bar = item.indexOf('|');
          const ch = bar < 0 ? item : item.slice(0, bar);
          const kw = bar < 0 ? '' : item.slice(bar + 1);
          if (head.indexOf(q) >= 0 || trFold(kw).indexOf(q) >= 0) out.push(ch);
        });
      });
    } else if (emojiTab === 'recent') {
      out.push(...loadRecentEmojis());
    } else {
      const cat = EMOJI_CATS.find(c => c.id === emojiTab) || EMOJI_CATS[0];
      cat.items.forEach(item => {
        const bar = item.indexOf('|');
        out.push(bar < 0 ? item : item.slice(0, bar));
      });
    }

    if (!out.length) {
      const empty = document.createElement('div');
      empty.className = 'ep-empty';
      empty.textContent = emojiTab === 'recent' ? 'Henüz emoji kullanmadın.' : 'Sonuç yok.';
      grid.appendChild(empty);
      return;
    }

    const frag = document.createDocumentFragment();
    out.forEach(ch => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ep-e';
      b.textContent = ch;
      b.title = ch;
      b.setAttribute('role', 'option');
      b.addEventListener('click', () => insertChatEmoji(ch));
      frag.appendChild(b);
    });
    grid.appendChild(frag);
    grid.scrollTop = 0;
  }

  function renderEmojiTabs() {
    const bar = $('#chat-emoji-tabs');
    if (!bar) return;
    bar.innerHTML = '';
    bar.hidden = panelMode === 'gif';          // GIF modunda kategori çubuğu yok
    if (panelMode === 'gif') return;
    const list = [{ id: 'recent', icon: '🕘', label: 'Son kullanılan' }]
      .concat(EMOJI_CATS.map(c => ({ id: c.id, icon: c.icon, label: c.label })));
    list.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ep-tab' + (emojiTab === t.id ? ' active' : '');
      b.textContent = t.icon;
      b.title = t.label;
      b.setAttribute('aria-label', t.label);
      b.addEventListener('click', () => {
        if (emojiTab === t.id) return;
        emojiTab = t.id;
        renderEmojiTabs();
        renderEmojiGrid();
      });
      bar.appendChild(b);
    });
  }

  function emojiPanelOpen() {
    const panel = $('#chat-emoji-panel');
    return !!(panel && !panel.hidden);
  }

  function openEmojiPanel() {
    const panel = $('#chat-emoji-panel');
    if (!panel || !panel.hidden) return;
    if (!emojiTab) emojiTab = lastEmojiTab || (loadRecentEmojis().length ? 'recent' : EMOJI_CATS[0].id);
    renderEmojiTabs();
    if (panelMode === 'gif') loadGifs(gifQuery);
    else { setPanelMode(false); renderEmojiGrid(); }
    syncSearchRow();
    panel.hidden = false;
    const btn = $('#chat-emoji-btn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    const input = $('#chat-input');
    if (input) input.focus();
  }

  function closeEmojiPanel() {
    const panel = $('#chat-emoji-panel');
    if (panel) panel.hidden = true;
    closeSearchRowSilent();
    emojiQuery = '';
    const btn = $('#chat-emoji-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function toggleEmojiPanel() {
    if (emojiPanelOpen()) closeEmojiPanel();
    else openEmojiPanel();
  }

  /** İmlecin olduğu yere emoji ekler (yazıyı silmez). */
  function insertChatEmoji(ch) {
    const input = $('#chat-input');
    if (!input) return;
    const val = input.value;
    let start = typeof input.selectionStart === 'number' ? input.selectionStart : val.length;
    let end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
    if (start > val.length) start = val.length;
    if (end > val.length) end = val.length;
    input.value = val.slice(0, start) + ch + val.slice(end);
    const pos = start + ch.length;
    input.focus();
    try { input.setSelectionRange(pos, pos); } catch (e) { /* yok */ }
    if (state.session) onChatInputChange();
    pushRecentEmoji(ch);
  }

  /** Metin yalnızca emojilerden mi oluşuyor? (balonu büyütmek için) */
  let EMOJI_ONLY_RE = null;
  try { EMOJI_ONLY_RE = /^(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3|\s)+$/u; } catch (e) { EMOJI_ONLY_RE = null; }

  function isEmojiOnly(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 24) return false;
    if (!EMOJI_ONLY_RE) return false;
    return EMOJI_ONLY_RE.test(t) && /[\u203C-\u3299\u{1F000}-\u{1FAFF}]/u.test(t);
  }

  // ------------------------------------------------ dosya gönderme (seç / sürükle-bırak / yapıştır)
  const FILE_MAX_BYTES = (FK.config && FK.config.FILE_MAX_BYTES) || 1024 * 1024 * 1024;
  const FILE_BIG_BYTES = (FK.config && FK.config.FILE_BIG_BYTES) || 200 * 1024 * 1024;
  const PASTED_EXT = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/gif': 'gif',
    'image/webp': 'webp', 'image/bmp': 'bmp', 'image/svg+xml': 'svg'
  };
  const GENERIC_NAME = /^(image|blob|clipboard|file)(\.[a-z0-9]{1,5})?$/i;

  let sendChain = Promise.resolve();   // dosyalar sırayla gitsin
  let dragDepth = 0;

  function newChatId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /** Panodan gelen görsele anlamlı bir ad verir (image.png → yapistirilan-20261021-1930.png). */
  function pastedName(file, index) {
    if (file.name && !GENERIC_NAME.test(file.name)) return file.name;
    const ext = PASTED_EXT[(file.type || '').toLowerCase()] || (file.name.split('.').pop() || 'png');
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    return `yapistirilan-${stamp}${index ? '-' + (index + 1) : ''}.${ext}`;
  }

  /**
   * Dosyaları kuyruğa alır. Her dosya için DERHAL "gönderiliyor" balonu açılır,
   * ilerleme gerçek parça sayısından güncellenir; bitince ✓ / ✓✓ olur.
   */
  function queueFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    if (!state.session) { toast('Dosya göndermek için bir odada olmalısın', 'warn'); return; }

    const accepted = [];
    let tooBig = 0;
    files.forEach(f => { if (f.size > FILE_MAX_BYTES) tooBig++; else accepted.push(f); });
    if (tooBig) toast(tooBig === 1 ? 'Dosya 1 GB sınırını aşıyor' : tooBig + ' dosya 1 GB sınırını aşıyor', 'warn');
    if (!accepted.length) return;

    let big = false;
    accepted.forEach(f => {
      if (f.size > FILE_BIG_BYTES) big = true;
      const msg = {
        id: newChatId(),
        sender: 'me',
        state: 'sending',
        progress: 0,
        text: '',
        time: Date.now(),
        file: {
          name: String(f.name || 'dosya').slice(0, 100),
          size: f.size,
          mime: f.type || 'application/octet-stream'
        }
      };
      msg._file = f;                 // yeniden denemek için dosya tutamacı
      // GIF ise daha gönderim sürerken yerel önizleme göster
      if (isGifFile(msg.file)) { try { msg._previewUrl = URL.createObjectURL(f); } catch (e) { msg._previewUrl = ''; } }
      chatMessages.push(msg);
      upsertChatMessage(msg);
      sendChain = sendChain.then(() => sendOneFile(msg));
    });
    if (big) toast('Büyük dosya: aktarım uzun sürebilir, iki taraf da uygulamayı açık tutmalı', 'warn');
  }

  async function sendOneFile(msg) {
    if (!state.session) { failChatSend(msg); return; }
    let lastPaint = 0;
    try {
      const res = await state.session.sendChatFile(msg._file, msg.text || '', {
        id: msg.id,
        // 119.000 parçalık dosyada DOM'u boğmamak için saniyede ~10 güncelleme
        onProgress: ratio => {
          const now = (window.performance && performance.now) ? performance.now() : Date.now();
          if (ratio < 1 && now - lastPaint < 100) return;
          lastPaint = now;
          msg.progress = ratio;
          updateChatProgress(msg);
        }
      });
      msg.state = 'sent';
      msg.file = res.file;
      msg.progress = 1;
      if (msg._previewUrl) {
        try { URL.revokeObjectURL(msg._previewUrl); } catch (e) { /* yok */ }
        msg._previewUrl = '';
      }
      upsertChatMessage(msg);
    } catch (e) {
      msg.error = (e && e.message) || 'Gönderilemedi';
      failChatSend(msg);
    }
  }

  function failChatSend(msg) {
    msg.state = 'failed';
    upsertChatMessage(msg);
  }

  function retryChatSend(msg) {
    if (!msg._file) { toast('Dosya artık erişilebilir değil', 'error'); return; }
    if (!state.session) { toast('Dosya göndermek için bir odada olmalısın', 'warn'); return; }
    msg.state = 'sending';
    msg.progress = 0;
    msg.error = '';
    upsertChatMessage(msg);
    sendChain = sendChain.then(() => sendOneFile(msg));
  }

  function handleChatFileUpload(e) {
    const input = e.target;
    const files = Array.from(input.files || []);
    input.value = '';
    queueFiles(files);
  }

  function isFileDrag(e) {
    const types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.from(types).indexOf('Files') !== -1;
  }

  function setDropZone(visible) {
    const zone = $('#chat-drop-zone');
    if (zone) zone.hidden = !visible;
    const modal = $('#chat-modal');
    if (modal) modal.classList.toggle('dropping', !!visible);
  }

  /** Sohbete sürükle-bırak; pencere dışına bırakılırsa dosya tarayıcıda açılmasın. */
  function bindChatDrop() {
    const modal = $('#chat-modal');
    if (modal) {
      modal.addEventListener('dragenter', e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        dragDepth++;
        if (state.chatOpen) setDropZone(true);
      });
      modal.addEventListener('dragover', e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (state.chatOpen) setDropZone(true);
      });
      // dragleave bazen dataTransfer olmadan gelir; sayaç her durumda azalsın.
      modal.addEventListener('dragleave', () => {
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) setDropZone(false);
      });
      modal.addEventListener('drop', e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        e.stopPropagation();
        dragDepth = 0;
        setDropZone(false);
        queueFiles(e.dataTransfer.files);
      });
    }

    // Güvenlik ağı: sürükleme iptal edilirse / pencere odağı giderse katman takılı kalmasın.
    const resetDrag = () => { dragDepth = 0; setDropZone(false); };
    window.addEventListener('dragend', resetDrag);
    window.addEventListener('blur', resetDrag);

    ['dragover', 'drop'].forEach(type => {
      window.addEventListener(type, e => {
        if (!isFileDrag(e)) return;
        e.preventDefault();          // dosya tarayıcıda açılmasın
        if (type !== 'drop') return;
        dragDepth = 0;
        setDropZone(false);
        if (state.session) {
          toast(state.chatOpen ? 'Dosyayı sohbet penceresine bırak' : 'Dosya göndermek için sohbeti aç', 'warn');
        }
      });
    });
  }

  /** Ctrl+V: panodaki dosya/görselleri gönderir (metin yapıştırmayı engellemez). */
  function bindChatPaste() {
    document.addEventListener('paste', e => {
      if (!state.chatOpen || !state.session || state.settingsOpen) return;
      const dt = e.clipboardData;
      if (!dt) return;

      const files = [];
      if (dt.items) {
        for (const item of dt.items) {
          if (item.kind !== 'file') continue;
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (!files.length && dt.files) Array.from(dt.files).forEach(f => files.push(f));
      if (!files.length) return;

      e.preventDefault();
      queueFiles(files.map((f, i) => {
        const name = pastedName(f, files.length > 1 ? i : 0);
        if (name === f.name) return f;
        try {
          return new File([f], name, { type: f.type || 'application/octet-stream', lastModified: Date.now() });
        } catch (err) {
          return f;
        }
      }));
    });
  }

  function onChatInputChange() {
    if (!state.session) return;
    state.session.sendChatTyping(true);
    clearTimeout(myTypingTimeout);
    myTypingTimeout = setTimeout(() => {
      if (state.session) state.session.sendChatTyping(false);
    }, 2000);
  }

  function openFilePreview(file) {
    if (!file) return;
    activePreviewFile = file;
    const modal = $('#file-preview-modal');
    const nameEl = $('#preview-filename');
    const sizeEl = $('#preview-filesize');
    const badgeEl = $('#preview-badge');
    const container = $('#preview-content-box');
    if (!modal || !container) return;

    const cat = getFileCategory(file.name, file.mime);
    const ext = (file.name || 'file').split('.').pop().toUpperCase();
    if (nameEl) nameEl.textContent = file.name;
    if (sizeEl) sizeEl.textContent = formatBytes(file.size);
    if (badgeEl) {
      badgeEl.className = 'file-type-badge ' + cat;
      badgeEl.textContent = ext;
    }

    container.innerHTML = '';

    const src = file.url || file.data || '';

    if (cat === 'img' && src) {
      const img = document.createElement('img');
      img.className = 'preview-img';
      img.src = src;
      img.alt = file.name;
      container.appendChild(img);
    } else if (cat === 'code' && src) {
      const pre = document.createElement('pre');
      pre.className = 'preview-code';
      pre.textContent = 'Yükleniyor…';
      container.appendChild(pre);
      if (file.blob && file.blob.text) {
        // Blob doğrudan okunur (CSP 'connect-src' fetch'i engelliyor).
        file.blob.text().then(t => { pre.textContent = t; })
          .catch(() => { pre.textContent = 'Metin içeriği okunamadı.'; });
      } else if (file.data) {
        try {
          const b64 = file.data.split(',')[1] || file.data;
          pre.textContent = decodeURIComponent(escape(atob(b64)));
        } catch (e) {
          pre.textContent = 'Metin içeriği çözülemedi.';
        }
      } else {
        pre.textContent = 'Metin içeriği okunamadı.';
      }
    } else {
      const infoWrap = document.createElement('div');
      infoWrap.style.textAlign = 'center';
      infoWrap.style.padding = '30px';
      infoWrap.innerHTML = `
        <div style="font-size: 48px; margin-bottom: 12px;">📁</div>
        <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 6px;">${escapeHtml(file.name)}</div>
        <div style="font-size: 13px; color: var(--text-2); margin-bottom: 16px;">${formatBytes(file.size)} &bull; ${escapeHtml(file.mime || 'Dosya')}</div>
        <p style="font-size: 12px; color: var(--text-2); max-width: 320px; margin: 0 auto;">Bu dosya türü doğrudan görselleştirilemiyor. Dosyayı bilgisayarınıza indirerek açabilirsiniz.</p>
      `;
      container.appendChild(infoWrap);
    }

    modal.hidden = false;
  }

  function closeFilePreview() {
    const modal = $('#file-preview-modal');
    if (modal) modal.hidden = true;
    activePreviewFile = null;
  }

  function downloadFile(file) {
    if (!file) return;
    const src = file.url || file.data;
    if (!src) return;

    // Kabuk köprüsü (save-file) 4 MB JSON sınırına takılır: yalnızca küçük data URL'ler için.
    const viaHost = FK.host && FK.host.available && file.data && !file.url && (file.size || 0) < 8 * 1024 * 1024;
    if (viaHost) {
      FK.host.send('save-file', {
        name: file.name || 'dosya',
        data: file.data
      });
      toast((file.name || 'Dosya') + ' kaydediliyor...', 'ok');
      return;
    }

    // Blob URL (veya büyük dosya): tarayıcı indirmesi — WebView2 indirme penceresine düşer.
    if (file.url) {
      const a = document.createElement('a');
      a.href = src;
      a.download = file.name || 'dosya';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 500);
      toast((file.name || 'Dosya') + ' indiriliyor…', 'ok');
      return;
    }
    // Web / önizleme ortamı için güvenli Blob indirmesi
    try {
      const b64 = file.data.includes(',') ? file.data.split(',')[1] : file.data;
      const mime = file.mime || (file.data.includes(';') ? file.data.split(';')[0].replace('data:', '') : 'application/octet-stream');
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name || 'dosya';
      document.body.appendChild(a);
      a.click();
      toast((file.name || 'Dosya') + ' indirildi', 'ok');
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1500);
    } catch (e) {
      const a = document.createElement('a');
      a.href = file.data;
      a.download = file.name || 'dosya';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 100);
    }
  }

  function setPill(text, kind) {
    $('#call-status').textContent = text;
    $('#call-pill').dataset.kind = kind;
  }

  function netText(st) {
    if (!st) return '';
    const parts = [];
    if (st.rtt != null) parts.push(st.rtt + ' ms');
    parts.push(st.relay ? 'TURN üzerinden' : 'Doğrudan P2P');
    return parts.join(' · ');
  }

  function peerCard(id) {
    return $$('#people .person.peer').find(el => el.dataset.peer === id) || null;
  }

  function showStats(st) {
    const el = peerCard(st.id);
    if (el && !el.classList.contains('away')) $('.person-net', el).textContent = netText(st);
  }

  const PEER_STATUS = {
    connected: 'Bağlandı', unstable: 'Bağlantı zayıf', reconnecting: 'Yeniden bağlanıyor...',
    connecting: 'Bağlanıyor...', lost: 'Bağlantı kesildi',
  };

  /**
   * İki kart (sen + arkadaşın): PP, isim, mikrofon/bağlantı durumu.
   * Arkadaş kartı eski kimlikleri taşır (#person-peer, #peer-name ...).
   */
  function renderPeople() {
    const s = state.session;
    const box = $('#people');
    const st = s ? s.state : 'idle';
    let list = s ? s.members() : [];
    if (!list.length) {
      // Kimse yok (ör. oda kapandı): tek bir boş kart, düzen bozulmasın.
      list = [{ id: '_none', name: '', photo: '', muted: false, noMic: false, status: st === 'reconnecting' ? 'reconnecting' : 'lost' }];
    }
    const keep = new Set(list.map(m => m.id));
    $$('.person.peer', box).forEach(el => { if (!keep.has(el.dataset.peer)) el.remove(); });
    list.forEach((m, i) => {
      let el = peerCard(m.id);
      if (!el) {
        el = $('#tpl-person').content.firstElementChild.cloneNode(true);
        el.dataset.peer = m.id;
        el._lvl = -1;
      }
      const at = box.children[i + 1] || null;   // 0: kendi kartın
      if (at !== el) box.insertBefore(el, at);
      const first = i === 0;
      el.id = first ? 'person-peer' : '';
      $('.avatar', el).id = first ? 'peer-avatar' : '';
      $('.pn-text', el).id = first ? 'peer-name' : '';
      $('.person-state', el).id = first ? 'peer-state' : '';
      $('.person-net', el).id = first ? 'peer-net' : '';

      const live = m.status === 'connected' || m.status === 'unstable';
      el.classList.toggle('muted', live && !!(m.muted || m.noMic));
      el.classList.toggle('away', !live);
      if (!live) { el.classList.remove('speaking'); el.style.setProperty('--lvl', '0'); el._lvl = -1; }
      let text = PEER_STATUS[m.status] || 'Bağlantı kesildi';
      if (m.status === 'connected') {
        if (m.noMic) text = 'Mikrofonu yok (yalnızca dinliyor)';
        else if (m.muted) text = 'Mikrofonu kapalı';
      }
      const name = m.name || 'Arkadaşın';
      P.paintAvatar($('.avatar', el), m);
      const nameEl = $('.pn-text', el);
      if (nameEl.textContent !== name) nameEl.textContent = name;
      const stEl = $('.person-state', el);
      if (stEl.textContent !== text) stEl.textContent = text;
      el.title = name + ' — ' + text;
      const net = $('.person-net', el);
      if (!live) net.innerHTML = '&nbsp;';
      else if (m.stats) net.textContent = netText(m.stats);
    });

    const cards = 1 + list.length;
    box.dataset.count = String(cards);
    const count = s ? s.memberCount : 1;
    const cc = $('#call-count');
    cc.textContent = count + '/' + FK.config.MAX_MEMBERS;
    cc.classList.toggle('full', count >= FK.config.MAX_MEMBERS);
    cc.title = count >= FK.config.MAX_MEMBERS ? 'Oda dolu (en fazla ' + FK.config.MAX_MEMBERS + ' kişi)' : 'Odadaki kişi sayısı (en fazla ' + FK.config.MAX_MEMBERS + ')';
  }

  function updatePeopleUI() {
    const self = $('#person-self');
    self.classList.toggle('muted', A.muted || !A.hasMic);
    $('#self-state').textContent = !A.hasMic ? (state.micError ? MIC_ERRORS[state.micError] : 'Mikrofon yok') : (A.muted ? 'Mikrofon kapalı' : 'Mikrofon açık');
    renderPeople();
  }

  // ================================================================== profil
  // Kendi kartın ve Ayarlar → Profil: isim + fotoğraf + (yalnızca Ayarlar'da) kullanıcı adı.
  // Arkadaşın kartı: yalnızca session.remoteProfile (isim + fotoğraf). Kullanıcı adı odaya hiç gitmez.
  const P = FK.profile;
  let profileSendTimer = 0;
  const USERNAME_HINT = '3–20 karakter: harf, rakam, _ ve .';

  function myProfile() {
    const photo = S.get('profilePhoto');
    return { name: P.cleanName(S.get('profileName')), photo: P.isSafePhoto(photo) ? photo : '' };
  }

  function updateProfileUI() {
    const me = myProfile();
    P.paintAvatar($('#profile-avatar'), me);
    P.paintAvatar($('#self-avatar'), me);
    $('#self-name').textContent = me.name || 'Sen';
    $('#self-you').hidden = !me.name;
    $('#profile-photo-remove').hidden = !me.photo;
    $('#profile-pick-label').textContent = me.photo ? 'Fotoğrafı değiştir' : 'Fotoğraf yükle';
    const nameEl = $('#set-name');
    if (document.activeElement !== nameEl) nameEl.value = me.name;
    const userEl = $('#set-username');
    if (document.activeElement !== userEl && !userEl.parentElement.classList.contains('invalid')) userEl.value = S.get('profileUsername');
  }

  function updatePeerProfileUI() { renderPeople(); }

  /** İsim/fotoğraf değişti: arayüzü yenile ve odadaki arkadaşa (kısa gecikmeyle, tek sefer) gönder. */
  function profileChanged() {
    updateProfileUI();
    clearTimeout(profileSendTimer);
    profileSendTimer = setTimeout(() => { if (state.session) state.session.sendProfile(); }, 250);
    FK.overlay.sendProfile(); // oyun içi gösterge de aynı profili kullanır
  }

  function setUsernameHint(text, kind) {
    const hint = $('#username-hint');
    hint.textContent = text;
    hint.classList.toggle('error', kind === 'error');
    hint.classList.toggle('ok', kind === 'ok');
    $('#set-username').parentElement.classList.toggle('invalid', kind === 'error');
    $('#set-username').setAttribute('aria-invalid', kind === 'error' ? 'true' : 'false');
  }

  function resetProfileFields() {
    setUsernameHint(USERNAME_HINT, '');
    $('#set-username').value = S.get('profileUsername');
    $('#set-name').value = myProfile().name;
  }

  async function onPhotoPicked(file) {
    if (!file) return;
    const box = $('.profile-photo');
    const pickBtns = [$('#profile-pick'), $('#profile-pick-badge')];
    box.classList.add('busy');
    pickBtns.forEach(b => { b.disabled = true; });
    try {
      const url = await P.processPhoto(file);
      S.set('profilePhoto', url);
      profileChanged();
      toast('Profil fotoğrafı güncellendi', 'ok');
    } catch (e) {
      const msg = {
        'not-image': 'Lütfen bir görüntü dosyası seçin (JPG, PNG, WebP).',
        'too-large': 'Dosya çok büyük (en fazla 15 MB).',
        'decode': 'Bu görüntü açılamadı.',
      }[e && e.code] || 'Fotoğraf işlenemedi.';
      toast(msg, 'error');
    } finally {
      box.classList.remove('busy');
      pickBtns.forEach(b => { b.disabled = false; });
    }
  }

  function bindProfile() {
    const nameEl = $('#set-name');
    const userEl = $('#set-username');
    const fileEl = $('#profile-file');
    const blurOnEnter = e => { if (e.key === 'Enter') e.currentTarget.blur(); };

    nameEl.addEventListener('keydown', blurOnEnter);
    nameEl.addEventListener('change', () => {
      const v = P.cleanName(nameEl.value);
      nameEl.value = v;
      if (S.set('profileName', v)) profileChanged();
    });

    userEl.addEventListener('keydown', blurOnEnter);
    userEl.addEventListener('input', () => {
      const r = P.checkUsername(userEl.value);
      // Yazarken yalnızca geçersiz karakteri hemen göster; uzunluk kontrolü alan bırakılınca.
      if (!r.ok && /[^a-z0-9_.]/.test(r.value)) setUsernameHint(r.error, 'error');
      else setUsernameHint(USERNAME_HINT, '');
    });
    userEl.addEventListener('change', () => {
      const r = P.checkUsername(userEl.value);
      if (!r.ok) { setUsernameHint(r.error, 'error'); return; }
      userEl.value = r.value;
      const changed = S.set('profileUsername', r.value);
      setUsernameHint(changed ? (r.value ? 'Kaydedildi · yalnızca sen görürsün' : 'Kullanıcı adı kaldırıldı') : USERNAME_HINT, changed ? 'ok' : '');
      updateProfileUI(); // kullanıcı adı odaya gönderilmez
    });

    const pick = () => fileEl.click();
    $('#profile-pick').addEventListener('click', pick);
    $('#profile-pick-badge').addEventListener('click', pick);
    fileEl.addEventListener('change', () => {
      const f = fileEl.files && fileEl.files[0];
      fileEl.value = '';
      onPhotoPicked(f);
    });
    $('#profile-photo-remove').addEventListener('click', () => {
      if (S.set('profilePhoto', '')) { profileChanged(); toast('Profil fotoğrafı kaldırıldı', 'ok'); }
    });
    // Fotoğrafı avatarın üzerine sürükleyip bırakma
    const drop = $('.profile-photo');
    drop.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('drop', e => {
      e.preventDefault();
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) onPhotoPicked(f);
    });
  }

  // ================================================================== sessize alma
  async function toggleMute(force) {
    if (!A.hasMic && typeof force !== 'boolean') {
      // Mikrofon yok / izin yok: düğme mikrofonu yeniden dener.
      if (await ensureMic()) toast('Mikrofon hazır', 'ok');
      else toast(MIC_ERRORS[state.micError] || MIC_ERRORS.failed, 'error');
      updateMuteUI();
      reportHostState();
      return;
    }
    const m = typeof force === 'boolean' ? force : !A.muted;
    if (state.session) state.session.setMuted(m); else A.setMuted(m);
    updateMuteUI();
    reportHostState();
  }

  function updateMuteUI() {
    const btn = $('#btn-mute');
    const off = A.muted || !A.hasMic;
    btn.setAttribute('aria-pressed', off ? 'true' : 'false');
    $('.cap', btn).textContent = !A.hasMic ? 'Mikrofon yok' : (A.muted ? 'Mikrofon kapalı' : 'Mikrofon');
    btn.title = !A.hasMic ? 'Mikrofonu yeniden dene' : (A.muted ? 'Mikrofonu aç (Ctrl+Shift+M)' : 'Mikrofonu kapat (Ctrl+Shift+M)');
    $$('.meter[data-meter="self"]').forEach(m => m.classList.toggle('muted', A.muted));
    updatePeopleUI();
  }

  // ================================================================== ayarlar katmanı
  async function openSettings() {
    // Sohbet katmanı ayarların üstünde çiziliyor; ayarlar görünmez kalmasın diye önce kapatılır.
    if (state.chatOpen) closeChat();
    state.settingsOpen = true;
    $('#settings').hidden = false;
    resetProfileFields();
    updateProfileUI();
    syncBindings();
    updateHotkeyUI();
    updateLoop();
    await ensureMic();
    fillDeviceSelects();
    syncBindings();
  }

  function closeSettings() {
    state.settingsOpen = false;
    stopHotkeyRecording(true);
    if (FK.programs) FK.programs.close();
    $('#settings').hidden = true;
    A.setMonitor(false);
    $('#monitor-toggle').checked = false;
    releaseMicIfIdle();
    updateLoop();
  }

  // ================================================================== gerçek seviye göstergeleri
  const SEGMENTS = 20;
  function buildMeters() {
    $$('.meter').forEach(m => {
      m.textContent = '';
      for (let i = 0; i < SEGMENTS; i++) {
        const seg = document.createElement('i');
        if (i >= SEGMENTS - 3) seg.dataset.hot = '1';
        m.appendChild(seg);
      }
      m._n = -1;
    });
  }

  function setMeter(m, level) {
    const n = Math.round(level * SEGMENTS);
    if (n === m._n) return;
    m._n = n;
    const kids = m.children;
    for (let i = 0; i < kids.length; i++) {
      kids[i].classList.toggle('on', i < n);
      if (kids[i].dataset.hot) kids[i].classList.toggle('hot', i < n);
    }
  }

  let rafId = 0, frame = 0;
  let lastSelfLvl = -1;

  function loopWanted() {
    if (state.background || document.hidden) return false;
    const visibleMeters = state.settingsOpen || state.screen === 'call' || state.screen === 'create' || state.screen === 'join';
    return visibleMeters && (A.hasMic || !!A.remoteStream);
  }

  function updateLoop() {
    if (loopWanted()) {
      if (!rafId) rafId = requestAnimationFrame(tick);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    document.body.classList.toggle('bg-mode', state.background);
  }

  function tick() {
    rafId = 0;
    if (!loopWanted()) return;
    if ((frame++ & 1) === 0) render(); // ~30 fps yeterli
    rafId = requestAnimationFrame(tick);
  }

  function render() {
    const selfLvl = A.getInputLevel();
    const visibleSelf = state.settingsOpen ? '#settings .meter' : '#screen-' + state.screen + ' .meter';
    $$(visibleSelf).forEach(m => setMeter(m, selfLvl));

    if (state.screen === 'call') {
      const sl = A.muted ? 0 : Math.round(selfLvl * 20) / 20;
      if (sl !== lastSelfLvl) {
        lastSelfLvl = sl;
        const self = $('#person-self');
        self.style.setProperty('--lvl', Math.max(0, (sl - 0.3) / 0.7).toFixed(2));
        self.classList.toggle('speaking', sl > FK.config.SPEAKING_LEVEL);
      }
      // Her arkadaşın halkası, o kişiden gelen CANLI sesin gerçek seviyesiyle hareket eder.
      $$('#people .person.peer').forEach(el => {
        if (el.classList.contains('away')) return;
        const pl = Math.round(A.getRemoteLevel(el.dataset.peer) * 20) / 20;
        if (pl === el._lvl) return;
        el._lvl = pl;
        el.style.setProperty('--lvl', Math.max(0, (pl - 0.3) / 0.7).toFixed(2));
        el.classList.toggle('speaking', pl > FK.config.SPEAKING_LEVEL);
      });
    }
  }

  function setBackground(bg) {
    if (state.background === bg) return;
    state.background = bg;
    if (state.session) state.session.statsPaused = bg;
    updateLoop();
  }

  // ================================================================== kapanış
  async function shutdown() {
    await disposeSession();
    A.releaseMicrophone();
  }

  async function goHome() {
    closeChat();
    closeFilePreview();
    await disposeSession();
    $('#call-banner').hidden = true;
    showScreen('home');
    releaseMicIfIdle();
  }

  // ================================================================== masaüstü kabuğu
  function bindHost() {
    if (!FK.host.available) {
      $$('.host-only input').forEach(el => { el.disabled = true; });
      $('#host-note').hidden = false;
      $('#app-version').textContent = '(tarayıcı)';
      return;
    }
    FK.host.on('init', m => {
      state.hostInfo = m;
      S.HOST_KEYS.forEach(k => {
        if (m[k] !== undefined) S.set(k, m[k]);
      });
      $('#app-version').textContent = m.version ? 'v' + m.version : '';
      $('#hotkey-warn').hidden = m.hotkeyOk !== false || !S.get('hotkey');
      syncBindings();
      updateHotkeyUI();
    });
    FK.host.on('window', m => setBackground(m.state === 'minimized' || m.state === 'hidden'));
    FK.host.on('notification-click', m => {
      // Bildirime tıklandı: pencere kabuk tarafından öne getirildi; bekleyen isteği veya sohbeti göster.
      if (m.action === 'manage-request') { showManageModal(); if (state.session) setBackground(false); }
      if (m.action === 'chat') { openChat(); if (state.session) setBackground(false); }
    });
    FK.host.on('toggle-mute', () => {
      toggleMute();
      if (A.hasMic) {
        toast(A.muted ? 'Mikrofon kapatıldı' : 'Mikrofon açıldı', A.muted ? 'warn' : 'ok');
      }
    });
    FK.host.on('overlay', m => FK.overlay.setVisible(!!m.visible));
    FK.host.on('hotkey-status', m => {
      $('#hotkey-warn').hidden = !!m.ok || !S.get('hotkey');
      if (m.display) {
        S.set('hotkeyDisplay', m.display);
      }
      updateHotkeyUI();
    });
    FK.host.on('shutdown-request', async () => {
      try { await shutdown(); } finally { FK.host.send('shutdown-ready'); }
    });
    bindControlHost();
    FK.host.send('ready');
    FK.overlay.sendProfile();
  }

  // ================================================================== başlat
  function init() {
    buildMeters();
    bindSettings();
    bindHotkeyUI();
    bindProfile();
    updateProfileUI();
    bindJoinInput();
    syncBindings();

    $('#btn-create').addEventListener('click', () => createRoom());
    $('#btn-join').addEventListener('click', openJoin);
    $('#btn-copy').addEventListener('click', copyCode);
    $('#call-copy').addEventListener('click', copyCode);
    $('#btn-create-retry').addEventListener('click', () => createRoom());
    $('#btn-mute').addEventListener('click', () => toggleMute());
    $('#btn-chat').addEventListener('click', () => toggleChat());
    $('#btn-hangup').addEventListener('click', goHome);
    // Arkadaş kartına sağ tık → "Bilgisayarı Yönet" menüsü
    $('#people').addEventListener('contextmenu', e => {
      const card = e.target && e.target.closest ? e.target.closest('.person.peer') : null;
      if (!card || !card.dataset.peer || card.dataset.peer === '_none') return;
      e.preventDefault();
      openPeerMenu(card.dataset.peer, e.clientX, e.clientY);
    });
    $('#peer-menu-manage').addEventListener('click', () => {
      const peerId = manageMenuPeerId;
      closePeerMenu();
      if (peerId) sendManageRequest(peerId);
    });
    document.addEventListener('mousedown', e => {
      const menu = $('#peer-menu');
      if (!menu.hidden && !menu.contains(e.target)) closePeerMenu();
    });
    window.addEventListener('blur', closePeerMenu);
    document.addEventListener('scroll', closePeerMenu, true);
    $('#btn-manage-accept').addEventListener('click', () => respondManage(true));
    $('#btn-manage-reject').addEventListener('click', () => respondManage(false));
    $('#btn-control-stop').addEventListener('click', () => endControl(true, 'Kontrol durduruldu.'));
    $('#btn-retry').addEventListener('click', () => { if (state.session) state.session.retry(); });
    $$('[data-action="home"]').forEach(b => b.addEventListener('click', goHome));
    $$('[data-action="settings"]').forEach(b => b.addEventListener('click', openSettings));
    $('#settings-close').addEventListener('click', closeSettings);
    $('#settings').addEventListener('mousedown', e => { if (e.target.id === 'settings') closeSettings(); });
    $('#chat-close-btn').addEventListener('click', closeChat);
    $('#chat-clear-btn').addEventListener('click', () => resetChat());
    $('#chat-modal').addEventListener('mousedown', e => { if (e.target.id === 'chat-modal') closeChat(); });
    $('#chat-send-btn').addEventListener('click', sendCurrentChatMessage);
    $('#chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCurrentChatMessage();
      }
    });
    $('#chat-input').addEventListener('input', onChatInputChange);
    $('#chat-attach-btn').addEventListener('click', () => $('#chat-file-input').click());
    $('#chat-emoji-btn').addEventListener('click', toggleEmojiPanel);
    $('#chat-emoji-close').addEventListener('click', () => { closeEmojiPanel(); $('#chat-input').focus(); });
    $('#chat-emoji-searchbtn').addEventListener('click', () => {
      if (searchRowOpen()) { closeSearchRow(); $('#chat-input').focus(); }
      else openSearchRow();
    });
    $('#chat-emoji-searchclear').addEventListener('click', () => {
      const inp = $('#chat-emoji-search');
      if (inp) { inp.value = ''; inp.focus(); }
      if (panelMode === 'gif') { clearTimeout(gifTimer); loadGifs('', false); }
      else { emojiQuery = ''; renderEmojiGrid(); }
    });
    $('#chat-mode-emoji').addEventListener('click', () => switchPanelMode('emoji'));
    $('#chat-mode-gif').addEventListener('click', () => switchPanelMode('gif'));
    $('#chat-emoji-search').addEventListener('input', e => {
      const v = e.target.value;
      if (panelMode === 'gif') {
        clearTimeout(gifTimer);
        gifTimer = setTimeout(() => { loadGifs(v); }, GIPHY_DEBOUNCE);
        return;
      }
      emojiQuery = v;
      renderEmojiGrid();
    });
    $('#chat-emoji-search').addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (searchRowOpen()) { closeSearchRow(); $('#chat-input').focus(); }
        else { closeEmojiPanel(); $('#chat-input').focus(); }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (panelMode === 'gif') {
          clearTimeout(gifTimer);
          if (!gifLoading && gifItems.length) sendGif(gifItems[0]);
          else loadGifs(e.target.value, true);
          return;
        }
        const first = $('#chat-emoji-grid .ep-e');
        if (first) insertChatEmoji(first.textContent);
      }
    });
    document.addEventListener('mousedown', e => {
      if (!emojiPanelOpen()) return;
      const panel = $('#chat-emoji-panel');
      if (panel && panel.contains(e.target)) return;
      if (e.target && e.target.closest && e.target.closest('#chat-emoji-btn')) return;
      if (e.target && e.target.closest && e.target.closest('#chat-send-btn')) return;  // gönderince panel açık kalsın
      closeEmojiPanel();
    });
    $('#chat-file-input').addEventListener('change', handleChatFileUpload);
    $('#preview-close-btn').addEventListener('click', closeFilePreview);
    $('#preview-cancel-btn').addEventListener('click', closeFilePreview);
    $('#file-preview-modal').addEventListener('mousedown', e => { if (e.target.id === 'file-preview-modal') closeFilePreview(); });
    $('#preview-download-btn').addEventListener('click', () => {
      if (activePreviewFile) downloadFile(activePreviewFile);
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (!$('#file-preview-modal').hidden) { closeFilePreview(); return; }
      if (emojiPanelOpen()) {
        if (searchRowOpen()) closeSearchRow();
        else closeEmojiPanel();
        return;
      }
      if (state.chatOpen) { closeChat(); return; }
      if (!$('#peer-menu').hidden) { closePeerMenu(); return; }        // önce sağ tık menüsü kapanır
      if (manageIncoming) { respondManage(false); return; }            // onay penceresi: Esc = Reddet
      if (!$('#program-picker').hidden) { FK.programs.close(); return; }   // önce açık liste kapanır
      if (state.settingsOpen) closeSettings();
    });
    $('#monitor-toggle').addEventListener('change', async e => {
      if (e.target.checked && !(await ensureMic())) { e.target.checked = false; return; }
      A.setMonitor(e.target.checked);
    });
    $('#btn-giphy-test').addEventListener('click', async e => {
      const btn = e.currentTarget;
      const out = $('#giphy-result');
      const key = giphyKey();
      if (!key) { out.textContent = 'Önce anahtarı girin.'; out.className = 'small warn'; return; }
      btn.disabled = true;
      out.textContent = 'Deneniyor…';
      out.className = 'small muted';
      try {
        const res = await fetch(GIPHY_API + '/trending?api_key=' + encodeURIComponent(key) + '&limit=1', { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Anahtar reddedildi' : 'Giphy: HTTP ' + res.status);
        const json = await res.json();
        if (!json || !Array.isArray(json.data)) throw new Error('Beklenmeyen yanıt');
        out.textContent = 'Anahtar çalışıyor ✓';
        out.className = 'small ok';
        gifCache.clear();
      } catch (err) {
        out.textContent = (err && err.message) || 'Bağlantı hatası';
        out.className = 'small warn';
      }
      btn.disabled = false;
    });
    $('#btn-sound-test').addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await A.playTestSound(); } catch (err) { toast('Ses çalınamadı', 'error'); }
      btn.disabled = false;
    });
    $('#btn-turn-test').addEventListener('click', async e => {
      const btn = e.currentTarget, out = $('#turn-result');
      // Yazılmakta olan alanı önce kaydet.
      if (document.activeElement && document.activeElement.matches('input.text')) document.activeElement.blur();
      const turn = S.customTurn();
      if (!turn) { out.textContent = 'Önce bir TURN adresi girin.'; out.className = 'small warn'; return; }
      btn.disabled = true; out.textContent = 'Test ediliyor...'; out.className = 'small muted';
      const r = await FK.net.probeRelay(turn, 10000);
      btn.disabled = false;
      if (r.ok) { out.textContent = 'TURN çalışıyor ✓'; out.className = 'small ok'; }
      else if (r.error === 'none' || r.error === 'invalid') { out.textContent = 'Adres geçersiz (turn: veya turns: ile başlamalı).'; out.className = 'small warn'; }
      else { out.textContent = 'TURN yanıt vermedi (adres veya kullanıcı bilgisi hatalı olabilir).'; out.className = 'small warn'; }
    });
    $('#btn-mic-privacy').addEventListener('click', () => FK.host.send('open-mic-privacy'));
    $('#btn-mic-retry').addEventListener('click', async () => {
      A.releaseMicrophone();
      if (await ensureMic()) toast('Mikrofon hazır', 'ok');
    });

    A.addEventListener('mic-fallback', () => toast('Seçili mikrofon bulunamadı, varsayılan mikrofon kullanılıyor', 'error'));
    A.addEventListener('output-fallback', () => toast('Seçili ses çıkışı bulunamadı, varsayılan kullanılıyor', 'error'));
    A.addEventListener('mic-ended', async () => {
      // Mikrofon çıkarıldı: varsayılana geçmeyi dene, görüşme sürsün.
      try { await A.setMicrophone(''); toast('Mikrofon bağlantısı kesildi, varsayılan mikrofona geçildi', 'error'); setMicError(null); }
      catch (e) { A.releaseMicrophone(); setMicError(e.code || 'not-found'); }
      refreshDevices().catch(() => {});
    });
    FK.devices.onChange(() => fillDeviceSelects());
    document.addEventListener('visibilitychange', updateLoop);

    bindHost();
    bindChatDrop();
    bindChatPaste();
    refreshDevices().catch(() => {});
    updateMuteUI();
  }

  FK.app = {
    get session() { return state.session; },
    get state() { return state; },
    createRoom, joinRoom, toggleMute, goHome, shutdown, openSettings, closeSettings, setBackground,
    openChat, closeChat, toggleChat, renderChatMessage,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.FK = window.FK || {});
