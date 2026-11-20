/* FK Sohbet — ses motoru (Web Audio API)
 *
 *  Mikrofon (getUserMedia) ─► kaynak ─► kazanç (mikrofon seviyesi) ─┬─► analizör (gerçek seviye)
 *                                                                   ├─► GİDEN SES İZİ (WebRTC'ye)
 *                                                                   └─► (isteğe bağlı) kendini dinle
 *
 * Giden ses izi bir MediaStreamDestination'dan gelir ve uygulama boyunca HİÇ değişmez.
 * Mikrofon değiştirildiğinde yalnızca kaynak düğümü değişir; bu yüzden görüşme ve
 * WebRTC bağlantısı kesilmeden yeni mikrofon devreye girer.
 *
 * Odadaki her arkadaşın canlı sesi ayrı bir <audio> öğesinde çalınır (setSinkId ile çıkış cihazı
 * seçilebilir) ve ayrı bir analizörle ölçülür: kimin konuştuğu gerçek sesten anlaşılır.
 */
(function (FK) {
  'use strict';

  class MicError extends Error {
    constructor(code, cause) {
      super(code);
      this.code = code;           // 'denied' | 'not-found' | 'busy' | 'unsupported' | 'failed'
      this.cause = cause;
    }
  }

  function mapMicError(e) {
    const name = e && e.name;
    if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return new MicError('denied', e);
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return new MicError('not-found', e);
    if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return new MicError('busy', e);
    return new MicError('failed', e);
  }

  /** dBFS tabanlı 0..1 seviye: -60 dB sessizlik, 0 dB tam ölçek. */
  function rmsToLevel(rms) {
    if (!(rms > 0)) return 0;
    const db = 20 * Math.log10(rms);
    return Math.max(0, Math.min(1, (db + 60) / 60));
  }

  class AudioEngine extends EventTarget {
    constructor() {
      super();
      this.ctx = null;
      this.gainNode = null;
      this.analyser = null;
      this.sendDest = null;
      this.micStream = null;
      this.micSource = null;
      this.micDeviceId = null;      // gerçekte kullanılan cihaz
      this.micLabel = '';
      this.muted = false;
      this.micGain = 1;
      this.processing = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };

      // Odadaki her arkadaşın sesi ayrı bir <audio> öğesinde çalar (yankı engelleme için şart)
      // ve ayrı bir analizörle ölçülür (kimin konuştuğu gerçek sesten anlaşılır).
      this.remotes = new Map();    // peerId → {stream, el, source, analyser, buf}
      this.outputDeviceId = '';
      this.outputVolume = 1;

      this.monitorGain = null;     // "Kendimi dinle": düşük gecikmeli Web Audio yolu
      this.monitorDest = null;     // yedek yol (AudioContext.setSinkId yoksa ve özel cihaz seçiliyse)
      this.monitorEl = null;

      this._buf = null;
    }

    // ------------------------------------------------------------------ temel grafik
    ensureContext() {
      if (!this.ctx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) throw new MicError('unsupported');
        this.ctx = new Ctx({ latencyHint: 'interactive' });
        this.gainNode = this.ctx.createGain();
        this.gainNode.gain.value = this.micGain;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.sendDest = this.ctx.createMediaStreamDestination();
        this.gainNode.connect(this.analyser);
        this.gainNode.connect(this.sendDest);
        this._buf = new Float32Array(this.analyser.fftSize);
        this._applyMute();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }

    /** WebRTC'ye verilen, hiç değişmeyen giden ses akışı. */
    get outgoingStream() {
      this.ensureContext();
      return this.sendDest.stream;
    }

    get hasMic() { return !!this.micStream; }

    // ------------------------------------------------------------------ mikrofon
    _constraints(deviceId) {
      const audio = {
        echoCancellation: this.processing.echoCancellation,
        noiseSuppression: this.processing.noiseSuppression,
        autoGainControl: this.processing.autoGainControl,
        channelCount: 1,
      };
      if (deviceId) audio.deviceId = { exact: deviceId };
      return { audio, video: false };
    }

    /**
     * Mikrofonu açar veya değiştirir. Görüşme sırasında çağrılabilir: giden iz aynı kalır.
     * deviceId boşsa / cihaz artık yoksa Windows'un varsayılan mikrofonu kullanılır.
     */
    async setMicrophone(deviceId) {
      this.ensureContext();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new MicError('unsupported');

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(this._constraints(deviceId));
      } catch (e) {
        const err = mapMicError(e);
        if (deviceId && err.code === 'not-found') {
          // Seçili cihaz çıkarılmış olabilir: varsayılana düş.
          try { stream = await navigator.mediaDevices.getUserMedia(this._constraints(null)); }
          catch (e2) { throw mapMicError(e2); }
          this.dispatchEvent(new CustomEvent('mic-fallback'));
        } else {
          throw err;
        }
      }

      const track = stream.getAudioTracks()[0];
      const source = this.ctx.createMediaStreamSource(stream);
      source.connect(this.gainNode);

      // Eski kaynağı yeni bağlandıktan SONRA çıkar: ses kesintisi en aza iner.
      const oldStream = this.micStream, oldSource = this.micSource;
      this.micStream = stream;
      this.micSource = source;
      if (oldSource) { try { oldSource.disconnect(); } catch (e) { /* yok */ } }
      if (oldStream) oldStream.getTracks().forEach(t => t.stop());

      const settings = track.getSettings ? track.getSettings() : {};
      this.micDeviceId = settings.deviceId || deviceId || '';
      this.micLabel = track.label || '';
      track.addEventListener('ended', () => {
        if (this.micStream === stream) this.dispatchEvent(new CustomEvent('mic-ended'));
      });
      this.dispatchEvent(new CustomEvent('mic-changed', { detail: { deviceId: this.micDeviceId, label: this.micLabel } }));
      return this.micDeviceId;
    }

    /** Mikrofonu tamamen bırakır (Windows'taki "mikrofon kullanımda" simgesi kaybolur). */
    releaseMicrophone() {
      if (this.micSource) { try { this.micSource.disconnect(); } catch (e) { /* yok */ } }
      if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
      this.micSource = null;
      this.micStream = null;
      this.micDeviceId = null;
      this.micLabel = '';
      this.setMonitor(false);
    }

    async setProcessing(opts) {
      Object.assign(this.processing, opts);
      // Yankı/gürültü ayarı yalnızca mikrofon yeniden açılınca uygulanır (giden iz yine aynı kalır).
      if (this.micStream) await this.setMicrophone(this.micDeviceId);
    }

    setMicGain(value) {
      this.micGain = Math.max(0, Math.min(2, Number(value) || 0));
      if (this.gainNode) this.gainNode.gain.setTargetAtTime(this.micGain, this.ctx.currentTime, 0.02);
    }

    setMuted(muted) {
      this.muted = !!muted;
      this._applyMute();
    }

    _applyMute() {
      if (!this.sendDest) return;
      // Kapalıyken karşıya sessizlik gider; bağlantı ve mikrofon seviyesi göstergesi çalışmaya devam eder.
      this.sendDest.stream.getAudioTracks().forEach(t => { t.enabled = !this.muted; });
    }

    /** Gerçek mikrofon giriş seviyesi (0..1), kazanç uygulandıktan sonra (karşının duyacağı). */
    getInputLevel() {
      if (!this.analyser || !this.micStream) return 0;
      this.analyser.getFloatTimeDomainData(this._buf);
      let sum = 0;
      for (let i = 0; i < this._buf.length; i++) sum += this._buf[i] * this._buf[i];
      return rmsToLevel(Math.sqrt(sum / this._buf.length));
    }

    // ------------------------------------------------------------------ odadaki arkadaşlar
    /** Bir arkadaşın canlı ses akışını çalmaya başla (id: PeerJS kimliği; ekranda gösterilmez). */
    attachRemote(id, stream) {
      if (stream === undefined && id && typeof id === 'object') { stream = id; id = '_'; } // eski imza
      const cur = this.remotes.get(id);
      if (cur && cur.stream === stream) return;
      if (cur) this.detachRemote(id);
      this.ensureContext();
      const el = new Audio();
      el.autoplay = true;
      el.srcObject = stream;
      el.volume = this.outputVolume;
      const r = { stream, el, source: null, analyser: null, buf: null };
      this.remotes.set(id, r);
      this._applySink(el);
      const p = el.play();
      if (p && p.catch) p.catch(() => {});
      try {
        r.source = this.ctx.createMediaStreamSource(stream);
        r.analyser = this.ctx.createAnalyser();
        r.analyser.fftSize = 1024;
        r.buf = new Float32Array(r.analyser.fftSize);
        r.source.connect(r.analyser); // yalnızca ölçüm; ses <audio> ile çalınır
      } catch (e) { r.analyser = null; }
    }

    /** id verilirse o arkadaşın, verilmezse herkesin sesini kapatır. */
    detachRemote(id) {
      if (id === undefined) { Array.from(this.remotes.keys()).forEach(k => this.detachRemote(k)); return; }
      const r = this.remotes.get(id);
      if (!r) return;
      this.remotes.delete(id);
      if (r.source) { try { r.source.disconnect(); } catch (e) { /* yok */ } }
      try { r.el.pause(); } catch (e) { /* yok */ }
      r.el.srcObject = null;
    }

    /** id verilirse o arkadaşın gerçek ses seviyesi; verilmezse odadaki en yüksek seviye. */
    getRemoteLevel(id) {
      if (id !== undefined) {
        const r = this.remotes.get(id);
        if (!r || !r.analyser) return 0;
        r.analyser.getFloatTimeDomainData(r.buf);
        let sum = 0;
        for (let i = 0; i < r.buf.length; i++) sum += r.buf[i] * r.buf[i];
        return rmsToLevel(Math.sqrt(sum / r.buf.length));
      }
      let max = 0;
      this.remotes.forEach((r, k) => { max = Math.max(max, this.getRemoteLevel(k)); });
      return max;
    }

    get remoteCount() { return this.remotes.size; }
    _firstRemote() { const it = this.remotes.values().next(); return it.done ? null : it.value; }
    // Eski (2 kişilik) arayüzle uyum: ilk arkadaşın akışı/analizörü.
    get remoteStream() { const r = this._firstRemote(); return r ? r.stream : null; }
    get remoteAnalyser() { const r = this._firstRemote(); return r ? r.analyser : null; }
    remoteAnalyserFor(id) { const r = this.remotes.get(id); return r ? r.analyser : null; }

    // ------------------------------------------------------------------ çıkış
    setOutputVolume(v) {
      this.outputVolume = Math.max(0, Math.min(1, Number(v) || 0));
      this.remotes.forEach(r => { r.el.volume = this.outputVolume; });
      if (this.monitorEl) this.monitorEl.volume = this.outputVolume;
      if (this.monitorGain) this.monitorGain.gain.value = this.outputVolume;
    }

    async setOutputDevice(deviceId) {
      this.outputDeviceId = deviceId || '';
      await Promise.all([...Array.from(this.remotes.values(), r => r.el), this.monitorEl].filter(Boolean).map(el => this._applySink(el)));
      if (this.monitorGain || this.monitorDest) {
        // Yeni cihaz için en uygun izleme yolunu yeniden kur.
        await this.setMonitor(false);
        await this.setMonitor(true);
      }
    }

    async _applySink(el) {
      if (!FK.devices.outputSelectionSupported()) return;
      try { await el.setSinkId(this.outputDeviceId || ''); }
      catch (e) {
        // Cihaz çıkarılmış: varsayılan çıkışa dön.
        if (this.outputDeviceId) { try { await el.setSinkId(''); } catch (e2) { /* yok */ } }
        this.dispatchEvent(new CustomEvent('output-fallback'));
      }
    }

    /** Seçili çıkış cihazında kısa test sesi çalar. */
    async playTestSound() {
      const el = new Audio(makeTestToneUrl());
      el.volume = this.outputVolume;
      await this._applySink(el);
      await el.play();
      return new Promise(resolve => { el.onended = resolve; setTimeout(resolve, 2000); });
    }

    get monitorOn() { return !!(this.monitorGain || this.monitorDest); }

    /** AudioContext çıkışını seçili cihaza yönlendirir. Başarılıysa true. */
    async _applyCtxSink() {
      if (!this.ctx || typeof this.ctx.setSinkId !== 'function') return !this.outputDeviceId;
      try { await this.ctx.setSinkId(this.outputDeviceId || ''); return true; }
      catch (e) {
        try { await this.ctx.setSinkId(''); } catch (e2) { /* yok */ }
        return !this.outputDeviceId;
      }
    }

    /**
     * "Kendimi dinle": mikrofonu (kazanç sonrası) seçili çıkışa verir. Kulaklıkla kullanılmalı.
     * Ses doğrudan Web Audio çıkışına gider (~10-30 ms). <audio> öğesi üzerinden çalmak
     * medya tamponu yüzünden 100-300 ms gecikme ekler ve kulağa yankı gibi gelir.
     */
    async setMonitor(on) {
      if (on) {
        if (this.monitorOn) return;
        this.ensureContext();
        if (await this._applyCtxSink()) {
          this.monitorGain = this.ctx.createGain();
          this.monitorGain.gain.value = this.outputVolume;
          this.gainNode.connect(this.monitorGain);
          this.monitorGain.connect(this.ctx.destination);
          if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
          return;
        }
        // Yedek: AudioContext seçili cihaza yönlendirilemiyorsa medya öğesiyle çal.
        this.monitorDest = this.ctx.createMediaStreamDestination();
        this.gainNode.connect(this.monitorDest);
        this.monitorEl = new Audio();
        this.monitorEl.srcObject = this.monitorDest.stream;
        this.monitorEl.volume = this.outputVolume;
        await this._applySink(this.monitorEl);
        await this.monitorEl.play().catch(() => {});
        return;
      }
      if (this.monitorGain) {
        try { this.gainNode.disconnect(this.monitorGain); } catch (e) { /* yok */ }
        try { this.monitorGain.disconnect(); } catch (e) { /* yok */ }
        this.monitorGain = null;
      }
      if (this.monitorDest) {
        try { this.gainNode.disconnect(this.monitorDest); } catch (e) { /* yok */ }
        try { this.monitorEl.pause(); } catch (e) { /* yok */ }
        this.monitorEl.srcObject = null;
        this.monitorEl = null;
        this.monitorDest = null;
      }
    }

    /** İzleme yolunun tahmini çıkış gecikmesi (ms) — teşhis için. */
    get monitorLatencyMs() {
      if (!this.ctx) return null;
      return Math.round(((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000);
    }
  }

  let testToneUrl = null;
  /** 0,6 sn'lik iki notalı WAV (bellekte üretilir, dosya yok). */
  function makeTestToneUrl() {
    if (testToneUrl) return testToneUrl;
    const rate = 44100, dur = 0.6, n = Math.floor(rate * dur);
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const t = i / rate, f = t < dur / 2 ? 660 : 880;
      const env = Math.min(1, t / 0.02, (dur - t) / 0.05, Math.abs(t - dur / 2) < 0.015 ? Math.abs(t - dur / 2) / 0.015 : 1);
      v.setInt16(44 + i * 2, Math.sin(2 * Math.PI * f * t) * env * 0.35 * 32767, true);
    }
    testToneUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    return testToneUrl;
  }

  FK.MicError = MicError;
  FK.audio = new AudioEngine();
  FK.audioUtil = { rmsToLevel };
})(window.FK = window.FK || {});
