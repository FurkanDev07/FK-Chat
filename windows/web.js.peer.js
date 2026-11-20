/* FK Sohbet — PeerJS + WebRTC oturumu
 *
 * Oda sahibi (host):
 *   PeerJS sunucusuna "fksohbet-v1-<kod>" kimliğiyle kaydolur. Sunucu aynı kimliğin iki kez
 *   kullanılmasına izin vermez; böylece aynı anda aktif olan bir kod başka odaya verilemez
 *   (dolu koda denk gelinirse yeni kod üretilir). Sahip ayrılınca kimlik silinir → kod geçersiz olur.
 *
 * Katılan (guest):
 *   Rastgele kimlikle kaydolur, sahibe bir veri kanalı açar. Sahip "welcome" der; ses yalnızca
 *   sahip ile bu arkadaş arasında doğrudan akar. Görüşme toplam 2 kişiliktir (sahip + 1 arkadaş);
 *   oda doluyken katılmaya çalışan ikinci kişiye "full" gelir.
 *
 * Ses her iki kişi arasında doğrudan WebRTC ile CANLI akar (mikrofon → ağ → hoparlör; kayıt,
 * dosya ya da toplu gönderim yok; gerekirse TURN aktarır). Sunucuda ses tutulmaz.
 * Kimin konuştuğu, her kişiden gelen canlı sesin seviyesinden anlaşılır (ek mesaj gerekmez).
 */
(function (FK) {
  'use strict';

  const C = FK.config;

  class SessionError extends Error {
    constructor(code, detail) {
      super(code);
      this.code = code;     // invalid-code | not-found | full | timeout | peerjs-failed | webrtc-unsupported
      this.detail = detail; // | create-failed | unavailable-id | closed
    }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /** Bayt dizisi → base64 (parça parça; büyük dosyada çağrı yığını taşmasın). */
  function bytesToBase64(bytes) {
    let bin = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    }
    return btoa(bin);
  }

  /** base64 → bayt dizisi. */
  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function mapPeerError(err) {
    const type = err && err.type;
    switch (type) {
      case 'peer-unavailable': return new SessionError('not-found', err);
      case 'unavailable-id': return new SessionError('unavailable-id', err);
      case 'browser-incompatible': return new SessionError('webrtc-unsupported', err);
      default: return new SessionError('peerjs-failed', err);
    }
  }

  /** Opus'u konuşma için ayarlar: 64 kbps, paket kaybı düzeltme (FEC), mono. */
  function tuneOpus(sdp) {
    if (typeof sdp !== 'string') return sdp;
    const m = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
    if (!m) return sdp;
    const pt = m[1];
    const fmtpRe = new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)');
    const params = new Map();
    const existing = sdp.match(fmtpRe);
    if (existing) {
      existing[1].split(';').forEach(kv => {
        const i = kv.indexOf('=');
        const k = (i < 0 ? kv : kv.slice(0, i)).trim();
        if (k) params.set(k, i < 0 ? '' : kv.slice(i + 1).trim());
      });
    }
    Object.keys(C.OPUS_PARAMS).forEach(k => params.set(k, String(C.OPUS_PARAMS[k])));
    const line = 'a=fmtp:' + pt + ' ' + Array.from(params, ([k, v]) => (v === '' ? k : k + '=' + v)).join(';');
    if (existing) return sdp.replace(fmtpRe, line);
    return sdp.replace(new RegExp('(a=rtpmap:' + pt + ' opus/48000[^\\r\\n]*)(\\r?\\n)'), '$1$2' + line + '$2');
  }

  /** Odadaki bir arkadaş (bu bilgisayardan bakınca). Kimlik = PeerJS kimliği; ekranda gösterilmez. */
  class Partner {
    constructor(id, isHost) {
      this.id = id;
      this.isHost = !!isHost;       // misafirin gözünden: oda sahibi mi
      this.conn = null;             // veri kanalı (durum + profil mesajları)
      this.call = null;             // canlı ses bağlantısı
      this.outgoing = false;        // veri kanalını biz mi açtık
      this.gotStream = false;
      this.connected = false;       // ses şu an akıyor
      this.everConnected = false;
      this.unstable = false;
      this.lost = false;            // bağlantı koptu, geri gelmesi bekleniyor
      this.reconnecting = false;    // (misafir → sahip) yeniden bağlanılıyor
      this.muted = false;
      this.noMic = false;
      this.profile = { name: '', photo: '' };   // yalnızca isim + fotoğraf (kullanıcı adı ASLA gelmez)
      this.profileIn = null;
      this.frameIn = null;          // gelen ekran karesi (parçalar birleşiyor)
      this.lastFrameSeq = -1;       // iletilen en yeni kare; eskisi düşer
      this.stats = null;
      this.timers = {};
      this.joinedAt = Date.now();
    }
    setTimer(name, ms, fn) { this.clearTimer(name); this.timers[name] = setTimeout(() => { delete this.timers[name]; fn(); }, ms); }
    clearTimer(name) { if (this.timers[name]) { clearTimeout(this.timers[name]); delete this.timers[name]; } }
    clearTimers() { Object.keys(this.timers).forEach(t => this.clearTimer(t)); }
    get status() {
      if (this.connected) return this.unstable ? 'unstable' : 'connected';
      if (this.reconnecting) return 'reconnecting';
      if (this.lost) return 'lost';
      return 'connecting';
    }
  }

  class Session extends EventTarget {
    /**
     * @param {object} audio   FK.audio (giden ses akışı + arkadaşların sesi)
     * @param {function} getCustomTurn  ayarlardaki isteğe bağlı TURN sunucusu
     */
    constructor(audio, getCustomTurn) {
      super();
      this.audio = audio;
      this.getCustomTurn = getCustomTurn || (() => null);
      this.role = null;            // 'host' | 'guest'
      this.code = null;            // her zaman 5 haneli STRING
      this.peer = null;
      this.partners = new Map();   // peerId → Partner (katılma sırasıyla)
      this.state = 'idle';
      this.stateInfo = {};
      this.disposed = false;
      this._profileSeq = 0;
      this._profileCache = new Map();  // kısa kopmada aynı kişinin isim/fotoğrafı korunur
      this._hostEverConnected = false;
      this._roomClosed = false;
      this.reconnectAttempt = 0;
      this.statsPaused = false;
      this.collisions = 0;         // dolu koda denk gelme sayısı (test/teşhis)
      this.lastStats = null;
      this._reconnectRun = 0;
      this._timers = {};
      this._sigRetrying = false;
      this.pendingJoin = null;
    }

    // ---------------------------------------------------------------- yardımcılar
    emit(type, detail) { this.dispatchEvent(new CustomEvent(type, { detail })); }

    setState(state, extra) {
      this.state = state;
      this.stateInfo = Object.assign({ code: this.code, role: this.role }, extra || {});
      this.emit('state', Object.assign({ state }, this.stateInfo));
    }

    _setTimer(name, ms, fn) { this._clearTimer(name); this._timers[name] = setTimeout(() => { delete this._timers[name]; fn(); }, ms); }
    _clearTimer(name) { if (this._timers[name]) { clearTimeout(this._timers[name]); delete this._timers[name]; } }

    get hostPeerId() { return FK.room.peerIdForCode(this.code); }
    get myId() { return this.peer ? this.peer.id : ''; }

    /** Odadaki arkadaşlar (ben hariç), ekrana hazır özet. */
    members() {
      return Array.from(this.partners.values(), p => ({
        id: p.id, isHost: p.isHost, name: p.profile.name, photo: p.profile.photo,
        muted: p.muted, noMic: p.noMic, status: p.status, connected: p.connected, stats: p.stats,
      }));
    }
    /** Ben dahil odadaki kişi sayısı (kopmuş/bekleyenler hariç). */
    get memberCount() { return 1 + this._activePartners().length; }
    get connectedCount() { let n = 0; this.partners.forEach(p => { if (p.connected) n++; }); return n; }
    get partnerConnected() { return this.connectedCount > 0; }
    _activePartners() { return Array.from(this.partners.values()).filter(p => !p.lost && !p.reconnecting || p.connected); }
    _emitMembers() { this.emit('members', { count: this.memberCount }); }

    // 2 kişilik eski arayüzle uyum (testler / teşhis): misafirde oda sahibi, sahipte ilk arkadaş.
    get _primary() {
      if (this.role === 'guest') return this.partners.get(this.hostPeerId) || null;
      const it = this.partners.values().next();
      return it.done ? null : it.value;
    }
    get conn() { const p = this._primary; return p ? p.conn : null; }
    get call() { const p = this._primary; return p ? p.call : null; }
    get remoteMuted() { const p = this._primary; return !!(p && p.muted); }
    get remoteNoMic() { const p = this._primary; return !!(p && p.noMic); }
    get remoteProfile() { const p = this._primary; return p ? Object.assign({}, p.profile) : { name: '', photo: '' }; }
    partnerById(id) { return this.partners.get(id) || null; }

    _peerOptions() {
      const s = C.PEER_SERVER;
      return {
        host: s.host, port: s.port, path: s.path, secure: s.secure, key: s.key,
        debug: 1,
        config: { iceServers: C.iceServers(this.getCustomTurn()), sdpSemantics: 'unified-plan', iceTransportPolicy: C.FORCE_RELAY ? 'relay' : 'all' },
      };
    }

    _openPeer(id) {
      return new Promise((resolve, reject) => {
        if (typeof window.Peer !== 'function') { reject(new SessionError('peerjs-failed', 'PeerJS yüklenemedi')); return; }
        let peer;
        try { peer = id ? new window.Peer(id, this._peerOptions()) : new window.Peer(this._peerOptions()); }
        catch (e) { reject(new SessionError('peerjs-failed', e)); return; }
        const cleanup = () => { clearTimeout(timer); peer.off('open', onOpen); peer.off('error', onErr); };
        const onOpen = () => { cleanup(); resolve(peer); };
        const onErr = err => { cleanup(); try { peer.destroy(); } catch (e) { /* yok */ } reject(mapPeerError(err)); };
        const timer = setTimeout(() => {
          cleanup();
          try { peer.destroy(); } catch (e) { /* yok */ }
          reject(new SessionError('peerjs-failed', 'timeout'));
        }, C.OPEN_TIMEOUT_MS);
        peer.on('open', onOpen);
        peer.on('error', onErr);
      });
    }

    _bindPeer(peer) {
      peer.on('connection', conn => this._onIncomingConnection(peer, conn));
      peer.on('call', call => this._onIncomingCall(peer, call));
      peer.on('disconnected', () => { if (peer === this.peer) this._onSignalingLost(); });
      peer.on('error', err => { if (peer === this.peer) this._onPeerError(err); });
    }

    _onPeerError(err) {
      if (err && err.type === 'peer-unavailable' && this.pendingJoin) {
        // Başka bir misafire ulaşılamaması odanın olmadığı anlamına gelmez: yalnızca sahip için.
        const msg = String(err.message || '');
        if (!msg || msg.indexOf(this.hostPeerId) >= 0) this.pendingJoin(new SessionError('not-found', err));
      }
      // Sunucu bağlantısı hataları 'disconnected' olayıyla birlikte gelir; orada ele alınır.
    }

    _closeLater(conn) {
      conn.on('open', () => { try { conn.close(); } catch (e) { /* yok */ } });
      setTimeout(() => { try { conn.close(); } catch (e) { /* yok */ } }, 3000);
    }

    _rejectFull(conn) {
      conn.on('open', () => {
        try { conn.send({ type: 'full', max: C.MAX_MEMBERS }); } catch (e) { /* yok */ }
        setTimeout(() => { try { conn.close(); } catch (e) { /* yok */ } }, 1000);
      });
      setTimeout(() => { try { conn.close(); } catch (e) { /* yok */ } }, 5000);
    }

    /** Odada yer var mı? Uzun süredir kopuk olan kartlar yeni gelene yer açar. */
    _makeRoomFor(peerId) {
      if (this.partners.has(peerId)) return true;
      const active = this._activePartners().length;
      if (active >= C.MAX_MEMBERS - 1) return false;
      while (this.partners.size >= C.MAX_MEMBERS - 1) {
        const lost = Array.from(this.partners.values()).find(p => p.lost && !p.connected);
        if (!lost) return false;
        this._removePartner(lost);
      }
      return true;
    }

    _newPartner(id, isHost) {
      const p = new Partner(id, isHost);
      const cached = this._profileCache.get(id);
      if (cached) p.profile = cached;
      this.partners.set(id, p);
      return p;
    }

    // ---------------------------------------------------------------- oda sahibi
    /** Yeni oda açar ve 5 haneli kodu döndürür. */
    async create(preferredCode) {
      this.role = 'host';
      this.setState('creating');
      for (let i = 0; i < C.CREATE_MAX_TRIES; i++) {
        const code = (i === 0 && FK.room.isValidRoomCode(preferredCode)) ? preferredCode : FK.room.generateRoomCode();
        let peer;
        try {
          peer = await this._openPeer(FK.room.peerIdForCode(code));
        } catch (e) {
          if (e.code === 'unavailable-id') { this.collisions++; continue; } // kod şu an başka bir odada aktif
          throw e;
        }
        if (this.disposed) { try { peer.destroy(); } catch (e) { /* yok */ } throw new SessionError('closed'); }
        this.peer = peer;
        this.code = code;
        this._bindPeer(peer);
        this.setState('waiting');
        return code;
      }
      throw new SessionError('create-failed');
    }

    _onIncomingConnection(peer, conn) {
      if (peer !== this.peer || this.disposed || this._roomClosed) { this._closeLater(conn); return; }
      const md = conn.metadata || {};
      if (md.app !== C.APP_ID) { this._closeLater(conn); return; }

      if (this.role === 'host') {
        if (!this._makeRoomFor(conn.peer)) { this._rejectFull(conn); return; }   // oda dolu: yalnızca 1 arkadaş
        let p = this.partners.get(conn.peer);
        if (p) this._dropLink(p);            // aynı kişi yeniden bağlanıyor (ör. kısa kopma)
        else p = this._newPartner(conn.peer, false);
        p.lost = false;
        this._attachConn(p, conn, false);
        if (!this.partnerConnected) this.setState('connecting');
        conn.on('open', () => {
          if (p.conn !== conn) return;
          try { conn.send({ type: 'welcome', v: C.PROTOCOL, muted: this.audio.muted, noMic: !this.audio.hasMic, max: C.MAX_MEMBERS }); } catch (e) { /* yok */ }
          this._sendProfileTo(p);
          this._sendRosterTo(p);
          this._announceMeshMember(p.id);
        });
        p.setTimer('media', C.MEDIA_TIMEOUT_MS, () => this._onLinkLost(p, 'media-timeout'));
        this._emitMembers();
        return;
      }

      // Mesh: misafir ↔ misafir. Yalnızca aynı odadaki (metadata.mesh) kanallar kabul edilir.
      if (this.role === 'guest' && md.mesh === true) {
        const cur = this.partners.get(conn.peer);
        if (cur && cur.conn) { this._closeLater(conn); return; }
        const guestCount = this._activePartners().filter(o => !o.isHost).length;
        if (guestCount >= C.MAX_MEMBERS - 2) { this._closeLater(conn); return; }   // oda dolu
        let p = cur;
        if (p) this._dropLink(p); else p = this._newPartner(conn.peer, false);
        p.lost = false;
        this._attachConn(p, conn, false);
        conn.on('open', () => {
          if (p.conn !== conn) return;
          try { conn.send(this._localState()); } catch (e) { /* yok */ }
          this._sendProfileTo(p);
          this._emitMembers();
        });
        p.setTimer('media', C.MEDIA_TIMEOUT_MS, () => this._onLinkLost(p, 'media-timeout'));
        this._emitMembers();
        return;
      }

      // Tanınmayan bağlantı: kapat.
      this._closeLater(conn);
    }

    /**
     * Misafir ↔ misafir bağlantısı kurar (mesh).
     * Çift kanal açmamak için YALNIZCA küçük Peer ID'li taraf bağlantıyı başlatır;
     * diğer taraf gelen kanalı _onIncomingConnection'da kabul eder ve ses çağrısına cevap verir.
     */
    _meshConnect(remoteId) {
      if (this.role !== 'guest' || this.disposed || this._roomClosed || !this.peer) return;
      if (typeof remoteId !== 'string' || !remoteId || remoteId === this.myId || remoteId === this.hostPeerId) return;
      const cur = this.partners.get(remoteId);
      if (cur && cur.conn) return;
      if (String(this.myId) >= String(remoteId)) return;   // diğer taraf bağlanacak
      let p = cur;
      if (!p) p = this._newPartner(remoteId, false);
      p.lost = false;
      let conn;
      try {
        conn = this.peer.connect(remoteId, {
          reliable: true,
          serialization: 'json',
          metadata: { app: C.APP_ID, v: C.PROTOCOL, mesh: true },
        });
      } catch (e) { this._removePartner(p); return; }
      if (!conn) { this._removePartner(p); return; }
      this._attachConn(p, conn, true);
      conn.on('open', () => {
        if (p.conn !== conn) return;
        try { conn.send(this._localState()); } catch (e) { /* yok */ }
        this._sendProfileTo(p);
        this._placeCall(p);
        this._emitMembers();
      });
      conn.on('error', () => { this._onLinkLost(p, 'mesh-error'); });
      this._emitMembers();
    }

    /** Oda sahibi: yeni gelen misafire odadaki diğer misafirlerin listesini verir. */
    _sendRosterTo(p) {
      if (this.role !== 'host' || !p || !p.conn) return;
      const ids = Array.from(this.partners.values())
        .filter(o => o !== p && !o.isHost && o.conn)
        .map(o => o.id);
      try { p.conn.send({ type: 'roster', ids }); } catch (e) { /* yok */ }
    }

    /** Oda sahibi: yeni misafiri diğer misafirlere duyurur (mesh kurulsun). */
    _announceMeshMember(id) {
      if (this.role !== 'host') return;
      this.partners.forEach(o => {
        if (o.id === id || o.isHost || !o.conn) return;
        try { o.conn.send({ type: 'peer-add', id }); } catch (e) { /* yok */ }
      });
    }

    _onIncomingCall(peer, call) {
      const md = call.metadata || {};
      const p = this.partners.get(call.peer);
      if (peer !== this.peer || this.disposed || !p || !p.conn || md.app !== C.APP_ID) {
        try { call.close(); } catch (e) { /* yok */ }
        return;
      }
      if (p.call) this._closeCall(p);
      this._attachCall(p, call);
      call.answer(this.audio.outgoingStream, { sdpTransform: tuneOpus });
      this._watchPc(p, call);
    }

    // ---------------------------------------------------------------- katılan
    /** 5 haneli kodla odaya katılır. "welcome" gelince çözülür; ses bağlanınca durum 'connected' olur. */
    async join(code) {
      if (!FK.room.isValidRoomCode(code)) throw new SessionError('invalid-code');
      this.role = 'guest';
      this.code = code;
      this.setState('connecting');
      const peer = await this._openPeer(null);
      if (this.disposed) { try { peer.destroy(); } catch (e) { /* yok */ } throw new SessionError('closed'); }
      this.peer = peer;
      this._bindPeer(peer);
      await this._connectToHost();
    }

    _connectToHost() {
      return new Promise((resolve, reject) => {
        const conn = this.peer.connect(this.hostPeerId, {
          reliable: true,
          serialization: 'json',
          metadata: { app: C.APP_ID, v: C.PROTOCOL },
        });
        let finished = false;
        const done = err => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          if (this.pendingJoin === done) this.pendingJoin = null;
          conn.off('data', onData);
          conn.off('close', onClose);
          if (err) { try { conn.close(); } catch (e) { /* yok */ } reject(err); }
          else resolve();
        };
        const onData = msg => {
          if (!msg || typeof msg !== 'object') return;
          if (msg.type === 'full') { done(new SessionError('full')); return; }
          if (msg.type === 'welcome') {
            done(null);
            if (this.disposed) { try { conn.close(); } catch (e) { /* yok */ } return; }
            let p = this.partners.get(this.hostPeerId);
            if (p) this._dropLink(p); else p = this._newPartner(this.hostPeerId, true);
            p.lost = false;
            this._attachConn(p, conn, true);
            this._setRemoteMuted(p, !!msg.muted, !!msg.noMic);
            try { conn.send(this._localState()); } catch (e) { /* yok */ }
            this._sendProfileTo(p);
            this._placeCall(p);
            this._emitMembers();
          }
        };
        const onClose = () => done(new SessionError('closed'));
        const timer = setTimeout(() => done(new SessionError('timeout')), C.JOIN_TIMEOUT_MS);
        conn.on('data', onData);
        conn.on('close', onClose);
        this.pendingJoin = done;
      });
    }

    _placeCall(p) {
      if (p.call) return;
      const call = this.peer.call(p.id, this.audio.outgoingStream, {
        metadata: { app: C.APP_ID, v: C.PROTOCOL },
        sdpTransform: tuneOpus,
      });
      if (!call) { this._onLinkLost(p, 'call-failed'); return; }
      this._attachCall(p, call);
      this._watchPc(p, call);
      p.setTimer('media', C.MEDIA_TIMEOUT_MS, () => this._onLinkLost(p, 'media-timeout'));
    }

    // ---------------------------------------------------------------- ortak bağlantı yönetimi
    _attachConn(p, conn, outgoing) {
      p.conn = conn;
      p.outgoing = !!outgoing;
      conn.on('data', msg => { if (p.conn === conn && this.partners.get(p.id) === p) this._onData(msg, p); });
      conn.on('close', () => { if (p.conn === conn) this._onLinkLost(p, 'data-closed'); });
      conn.on('error', () => { if (p.conn === conn) this._onLinkLost(p, 'data-error'); });
    }

    _onData(msg, p) {
      if (!msg || typeof msg !== 'object') return;
      p = p || this._primary;
      if (!p) return;
      switch (msg.type) {
        case 'state': this._setRemoteMuted(p, !!msg.muted, !!msg.noMic); break;
        case 'roster':
          if (this.role === 'guest' && Array.isArray(msg.ids)) {
            msg.ids.forEach(id => { if (typeof id === 'string') this._meshConnect(id); });
          }
          break;
        case 'peer-add':
          if (this.role === 'guest' && typeof msg.id === 'string') this._meshConnect(msg.id);
          break;
        case 'peer-remove':
          if (typeof msg.id === 'string') {
            const q = this.partners.get(msg.id);
            if (q && !q.isHost) this._removePartner(q);
          }
          break;
        case 'profile': this._onProfileHead(msg, p); break;
        case 'profile-photo': this._onProfileChunk(msg, p); break;
        case 'bye': this._onPartnerBye(p); break;
        case 'manage-request':
          if (typeof msg.id === 'string' && msg.id.length > 0 && msg.id.length <= 40) {
            this.emit('manage-request', { id: msg.id, peerId: p.id, name: p.profile.name });
          }
          break;
        case 'manage-response':
          if (typeof msg.id === 'string' && msg.id.length > 0 && msg.id.length <= 40) {
            this.emit('manage-response', { id: msg.id, peerId: p.id, name: p.profile.name, accepted: !!msg.accepted });
          }
          break;
        case 'control-start': this.emit('control-start', { peerId: p.id, name: p.profile.name }); break;
        case 'control-stop': this.emit('control-stop', { peerId: p.id, name: p.profile.name }); break;
        case 'control-input': {
          const input = Session.cleanControlInput(msg);
          if (input) this.emit('control-input', { peerId: p.id, input });
          break;
        }
        case 'control-launch':
          if (typeof msg.app === 'string' && msg.app.length > 0 && msg.app.length <= 260) {
            this.emit('control-launch', { peerId: p.id, app: msg.app });
          }
          break;
        case 'control-text':
          if (typeof msg.text === 'string' && msg.text.length > 0 && msg.text.length <= C.CONTROL_TEXT_MAX) {
            this.emit('control-text', { peerId: p.id, text: msg.text });
          }
          break;
        case 'control-frame': this._onFrameHead(msg, p); break;
        case 'control-frame-data': this._onFrameChunk(msg, p); break;
        case 'chat-text':
          if (typeof msg.id === 'string' && typeof msg.text === 'string') {
            this.emit('chat-message', {
              id: msg.id,
              peerId: p.id,
              sender: 'partner',
              senderName: p.profile.name,
              text: msg.text,
              time: msg.time || Date.now()
            });
          }
          break;
        case 'chat-typing':
          this.emit('chat-typing', { peerId: p.id, typing: !!msg.typing, name: p.profile.name });
          break;
        case 'chat-file-head': this._onChatFileHead(msg, p); break;
        case 'chat-file-chunk': this._onChatFileChunk(msg, p); break;
        case 'chat-file-ack':
          if (typeof msg.id === 'string') this.emit('chat-file-ack', { id: msg.id, peerId: p.id });
          break;
        case 'chat-file-reject':
          if (typeof msg.id === 'string') this.emit('chat-file-failed', { id: msg.id, reason: msg.reason || 'rejected' });
          break;
        default: break;
      }
    }

    _attachCall(p, call) {
      p.call = call;
      p.gotStream = false;
      call.on('stream', stream => {
        if (p.call !== call) return;
        this.audio.attachRemote(p.id, stream);   // canlı akış: gelen ses anında çalar
        p.gotStream = true;
        this._maybeConnected(p);
      });
      call.on('close', () => { if (p.call === call) this._onLinkLost(p, 'call-closed'); });
      call.on('error', () => { if (p.call === call) this._onLinkLost(p, 'call-error'); });
    }

    _watchPc(p, call, tries) {
      const pc = call.peerConnection;
      if (!pc) {
        if ((tries || 0) < 50 && p.call === call) setTimeout(() => this._watchPc(p, call, (tries || 0) + 1), 20);
        return;
      }
      const onChange = () => {
        if (p.call !== call) { pc.removeEventListener('connectionstatechange', onChange); return; }
        const s = pc.connectionState;
        if (s === 'connected') {
          p.clearTimer('grace');
          if (p.unstable) { p.unstable = false; this._emitMembers(); }
          this._maybeConnected(p);
        } else if (s === 'disconnected') {
          // Ağ kısa süre gidip gelebilir; WebRTC çoğu zaman kendiliğinden toparlar.
          if (p.connected && !p.unstable) { p.unstable = true; this._emitMembers(); }
          this._refreshState();
          p.setTimer('grace', C.ICE_DISCONNECT_GRACE_MS, () => this._onLinkLost(p, 'ice-disconnected'));
        } else if (s === 'failed') {
          this._onLinkLost(p, 'ice-failed');
        }
      };
      pc.addEventListener('connectionstatechange', onChange);
      onChange();
    }

    _maybeConnected(p) {
      const pc = p.call && p.call.peerConnection;
      if (!p.gotStream || !pc || pc.connectionState !== 'connected') return;
      p.clearTimer('media');
      p.clearTimer('grace');
      p.unstable = false;
      if (p.connected) { this._refreshState(); this._emitMembers(); return; }
      const first = !p.everConnected;
      p.connected = true;
      p.everConnected = true;
      p.lost = false;
      p.reconnecting = false;
      p.clearTimer('expire');
      const info = { id: p.id, name: p.profile.name };
      if (this.role === 'guest' && p.isHost) {
        const wasReconnecting = this.reconnectAttempt > 0 || this.state === 'unstable' || this.state === 'reconnecting';
        const kind = !this._hostEverConnected && !wasReconnecting ? 'peer-joined' : 'reconnected';
        this._hostEverConnected = true;
        this.reconnectAttempt = 0;
        this._refreshState(true);
        this.emit('notify', Object.assign({ kind }, info));
      } else {
        this._refreshState(true);
        this.emit('notify', Object.assign({ kind: first ? 'peer-joined' : 'reconnected' }, info));
      }
      this._emitMembers();
      this._startStats();
    }

    /**
     * Oturumun genel durumu (ekran/şerit buna göre değişir):
     *  sahip:   en az bir kişiyle ses akıyorsa 'connected'; kimse yoksa bekliyor / kopanı bekliyor.
     *  misafir: oda sahibiyle bağlantıya göre (sahip odayı tutar; o giderse oda kapanır).
     */
    _refreshState(force) {
      if (this.disposed || this.state === 'failed' && !force) return;
      let next = null;
      if (this.role === 'host') {
        const live = Array.from(this.partners.values()).filter(p => p.connected);
        if (live.length) next = live.every(p => p.unstable) ? 'unstable' : 'connected';
        else if (Array.from(this.partners.values()).some(p => !p.lost)) next = 'connecting';
        else if (this.partners.size) next = 'partner-lost';
        else next = this.state === 'partner-left' ? 'partner-left' : 'waiting';
      } else {
        const h = this.partners.get(this.hostPeerId);
        if (h && h.connected) next = h.unstable ? 'unstable' : 'connected';
      }
      if (next && next !== this.state) this.setState(next);
    }

    _setRemoteMuted(p, m, noMic) {
      noMic = !!noMic;
      if (p.muted === m && p.noMic === noMic) return;
      p.muted = m;
      p.noMic = noMic;
      this.emit('remote-muted', { id: p.id, muted: m, noMic });
      this._emitMembers();
    }

    _closeCall(p) {
      const call = p.call;
      p.call = null;
      p.gotStream = false;
      if (call) { try { call.close(); } catch (e) { /* yok */ } }
    }

    /** Bir arkadaşla olan bağlantıları kapatır (kartı / profili kalır). */
    _dropLink(p) {
      const conn = p.conn;
      p.conn = null;
      this._closeCall(p);
      if (conn) { try { conn.close(); } catch (e) { /* yok */ } }
      ['media', 'grace'].forEach(t => p.clearTimer(t));
      p.connected = false;
      p.unstable = false;
      p.stats = null;
      if (p.filesIn) { p.filesIn.clear(); }
      this.audio.detachRemote(p.id);
    }

    /** Arkadaşı odadan tamamen çıkarır. */
    _removePartner(p) {
      if (this.partners.get(p.id) !== p) return;
      this._dropLink(p);
      p.clearTimers();
      this.partners.delete(p.id);
      if (this.role === 'host' && !p.isHost) {
        this.partners.forEach(o => {
          if (o.isHost || !o.conn) return;
          try { o.conn.send({ type: 'peer-remove', id: p.id }); } catch (e) { /* yok */ }
        });
      }
      if (p.profile.name || p.profile.photo) this._profileCache.set(p.id, p.profile);
      if (!this.partners.size) this._stopStats();
      this._emitMembers();
    }

    _onLinkLost(p, reason) {
      if (this.disposed || this.partners.get(p.id) !== p) return;
      const wasConnected = p.connected;
      this.lastLossReason = reason;
      this._dropLink(p);
      const info = { id: p.id, name: p.profile.name };

      if (this.role === 'guest' && p.isHost) {
        if (this._roomClosed) return;
        if (wasConnected) this.emit('notify', Object.assign({ kind: 'connection-lost' }, info));
        p.reconnecting = true;
        this._emitMembers();
        this._reconnectLoop();
        return;
      }

      // Karşı tarafla doğrudan bağlantı koptu.
      p.lost = true;
      if (wasConnected) this.emit('notify', Object.assign({ kind: 'connection-lost' }, info));
      p.setTimer('expire', C.LOST_MEMBER_KEEP_MS, () => {
        if (this.partners.get(p.id) === p && !p.connected) this._removePartner(p);
        this._refreshState();
      });
      this._refreshState();
      this._emitMembers();
    }

    _onPartnerBye(p) {
      const info = { id: p.id, name: p.profile.name };
      if (this.role === 'guest' && p.isHost) {
        // Oda sahibi odayı kapattı: görüşme iki taraf için de kapanır.
        this._roomClosed = true;
        this._reconnectRun++;
        Array.from(this.partners.values()).forEach(o => this._removePartner(o));
        this.setState('failed', { reason: 'host-left' });
        this.emit('notify', { kind: 'host-left' });
        return;
      }
      this._profileCache.delete(p.id);
      this._removePartner(p);
      this.emit('notify', Object.assign({ kind: 'peer-left' }, info));
      if (this.role === 'host') {
        if (!this.partners.size) this.setState('partner-left');
        else this._refreshState();
      }
    }

    // ---------------------------------------------------------------- yeniden bağlanma
    async _reconnectLoop() {
      const run = ++this._reconnectRun;
      const delays = C.RECONNECT_DELAYS_MS;
      while (this.reconnectAttempt < delays.length) {
        const attempt = ++this.reconnectAttempt;
        // Sahiple bağlantı kurulana kadar yeniden bağlanma durumu gösterilir.
        if (!this.partnerConnected) this.setState('reconnecting', { attempt, max: delays.length });
        await sleep(delays[attempt - 1]);
        if (this.disposed || run !== this._reconnectRun) return;
        try {
          await this._ensureSignaling();
          if (this.disposed || run !== this._reconnectRun) return;
          await this._connectToHost();
          return; // karşılandı; ses kurulunca 'connected', kurulamazsa bu döngü kaldığı yerden sürer
        } catch (e) {
          if (this.disposed || run !== this._reconnectRun) return;
          if (e.code === 'not-found') { this._closeRoomLocally('room-closed'); return; }
          // 'full' (sahip eski bağlantıyı henüz düşürmedi), zaman aşımı, ağ hatası → tekrar dene
        }
      }
      this._closeRoomLocally('reconnect-failed');
    }

    _closeRoomLocally(reason) {
      this._roomClosed = true;
      Array.from(this.partners.values()).forEach(o => {
        if (o.conn && o.conn.open) { try { o.conn.send({ type: 'bye' }); } catch (e) { /* yok */ } }
      });
      setTimeout(() => Array.from(this.partners.values()).forEach(o => this._removePartner(o)), 150);
      this.setState('failed', { reason });
    }

    /** Kullanıcının "Tekrar Bağlan" düğmesi. */
    retry() {
      if (this.disposed) return;
      if (this.role === 'guest') {
        this._roomClosed = false;
        this.reconnectAttempt = 0;
        this._reconnectLoop();
      } else {
        this._ensureSignaling()
          .then(() => { if (!this.disposed) this.setState(this.partnerConnected ? 'connected' : 'waiting'); })
          .catch(() => { if (!this.disposed) this.setState('failed', { reason: 'signaling' }); });
      }
    }

    /** PeerJS sunucusuyla bağlantının açık olmasını sağlar (aynı kimlikle). */
    async _ensureSignaling() {
      const peer = this.peer;
      if (peer && !peer.destroyed && !peer.disconnected && peer.open) return;
      if (peer && !peer.destroyed && peer.disconnected) {
        await new Promise((resolve, reject) => {
          const cleanup = () => { clearTimeout(timer); peer.off('open', onOpen); peer.off('error', onErr); };
          const onOpen = () => { cleanup(); resolve(); };
          const onErr = err => { cleanup(); reject(mapPeerError(err)); };
          const timer = setTimeout(() => { cleanup(); reject(new SessionError('peerjs-failed', 'timeout')); }, C.OPEN_TIMEOUT_MS);
          peer.on('open', onOpen);
          peer.on('error', onErr);
          try { peer.reconnect(); } catch (e) { cleanup(); reject(new SessionError('peerjs-failed', e)); }
        });
        return;
      }
      // Kayıt tamamen gitmiş: yeniden oluştur (sahip aynı kodu tekrar almaya çalışır).
      const fresh = await this._openPeer(this.role === 'host' ? this.hostPeerId : null);
      if (this.disposed) { try { fresh.destroy(); } catch (e) { /* yok */ } throw new SessionError('closed'); }
      if (peer) { try { peer.destroy(); } catch (e) { /* yok */ } }
      this.peer = fresh;
      this._bindPeer(fresh);
    }

    _onSignalingLost() {
      if (this.disposed || this._sigRetrying) return;
      this._sigRetrying = true;
      (async () => {
        for (const delay of C.SIGNALING_RETRY_MS) {
          await sleep(delay);
          if (this.disposed) break;
          if (this.peer && this.peer.open && !this.peer.disconnected) break;
          if (this.state === 'reconnecting') continue; // yeniden bağlanma döngüsü zaten deniyor
          try { await this._ensureSignaling(); break; }
          catch (e) { if (e.code === 'unavailable-id') break; }
        }
        this._sigRetrying = false;
        const down = !this.peer || this.peer.destroyed || this.peer.disconnected;
        // Görüşme sürüyorsa ses doğrudan akmaya devam eder; yalnızca bekleyen oda sahibi etkilenir.
        if (!this.disposed && down && this.role === 'host' && !this.partnerConnected) {
          this.setState('failed', { reason: 'signaling' });
        }
      })();
    }

    // ---------------------------------------------------------------- kullanıcı işlemleri
    _broadcast(msg) {
      this.partners.forEach(p => {
        if (p.conn && p.conn.open) { try { p.conn.send(msg); } catch (e) { /* yok */ } }
      });
    }

    setMuted(muted) {
      this.audio.setMuted(muted);
      this.sendState();
    }

    /** Mikrofon durumunu (kapalı / hiç yok) karşı tarafa bildir. */
    sendState() { this._broadcast(this._localState()); }

    // ------------------------------------------------------------ bilgisayarı yönet isteği
    /**
     * Karşı tarafa "bilgisayarını yönetmek istiyorum" isteği gönderir.
     * Kurulan benzersiz istek kimliğini döndürür; bağlantı açık değilse null.
     * Şimdilik yalnızca istek/cevap akışı var; asıl uzaktan kontrol sonra eklenecek.
     */
    requestManagement(peerId) {
      const p = this.partners.get(peerId);
      if (!p || !p.conn || !p.conn.open) return null;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { p.conn.send({ type: 'manage-request', id }); } catch (e) { return null; }
      return id;
    }

    /** Gelen yönetim isteğine onay / ret yanıtı gönderir. Gönderildiyse true. */
    respondManagement(peerId, id, accepted) {
      const p = this.partners.get(peerId);
      if (!p || !p.conn || !p.conn.open || typeof id !== 'string' || !id) return false;
      try { p.conn.send({ type: 'manage-response', id, accepted: !!accepted }); return true; }
      catch (e) { return false; }
    }

    // ------------------------------------------------------------ uzaktan kontrol
    _sendTo(p, msg) {
      if (!p || !p.conn || !p.conn.open) return false;
      try { p.conn.send(msg); return true; } catch (e) { return false; }
    }

    /** Ekran paylaşımının (kontrolün) başladığını karşı tarafa söyler. */
    startControl(peerId) { return this._sendTo(this.partners.get(peerId), { type: 'control-start' }); }

    /** Kontrol oturumunu bitirir (iki taraf da ekranı / pencereyi kapatır). */
    stopControl(peerId) { return this._sendTo(this.partners.get(peerId), { type: 'control-stop' }); }

    /** Fare / klavye girdisini karşı tarafa gönderir (biçim burada da doğrulanır). */
    sendControlInput(peerId, input) {
      const clean = Session.cleanControlInput(Object.assign({ type: 'control-input' }, input || {}));
      if (!clean) return false;
      return this._sendTo(this.partners.get(peerId), Object.assign({ type: 'control-input' }, clean));
    }

    /** Karşı tarafta uygulama açtırır (ör. 'explorer', 'notepad' ya da tam yol). */
    sendControlLaunch(peerId, app) {
      if (typeof app !== 'string' || !app.trim() || app.length > 260) return false;
      return this._sendTo(this.partners.get(peerId), { type: 'control-launch', app: app.trim() });
    }

    /** Karşı tarafta metin yazdırır (klavye düzeni farkını aşmak için Unicode gider). */
    sendControlText(peerId, text) {
      if (typeof text !== 'string' || !text || text.length > C.CONTROL_TEXT_MAX) return false;
      return this._sendTo(this.partners.get(peerId), { type: 'control-text', text });
    }

    /**
     * Bir ekran karesini (base64 JPEG) parçalar halinde gönderir.
     * Profil fotoğrafındaki düzenin aynısı; kare sırası (seq) eskilerin düşmesi içindir.
     */
    sendControlFrame(peerId, frame) {
      const p = this.partners.get(peerId);
      if (!p || !frame || typeof frame.data !== 'string' || !frame.data) return false;
      const size = C.PROFILE_CHUNK_CHARS;
      const parts = Math.ceil(frame.data.length / size);
      if (parts > C.CONTROL_MAX_PARTS) return false;
      const head = { type: 'control-frame', seq: frame.seq | 0, w: frame.w | 0, h: frame.h | 0, parts };
      if (!head.w || !head.h) return false;
      if (!this._sendTo(p, head)) return false;
      try {
        for (let i = 0; i < parts; i++) {
          p.conn.send({ type: 'control-frame-data', seq: head.seq, i, data: frame.data.slice(i * size, (i + 1) * size) });
        }
      } catch (e) { return false; }
      return true;
    }

    _onFrameHead(msg, p) {
      const parts = msg.parts;
      if (!Number.isInteger(msg.seq) || msg.seq < 0 || !Number.isInteger(parts) || parts < 1 || parts > C.CONTROL_MAX_PARTS) { p.frameIn = null; return; }
      if (!Number.isInteger(msg.w) || msg.w < 16 || msg.w > 4096 || !Number.isInteger(msg.h) || msg.h < 16 || msg.h > 4096) { p.frameIn = null; return; }
      if (msg.seq <= p.lastFrameSeq) { p.frameIn = null; return; }   // eski kare: hiç başlama
      p.frameIn = { seq: msg.seq, w: msg.w, h: msg.h, parts, chunks: new Array(parts), got: 0 };
    }

    _onFrameChunk(msg, p) {
      const fi = p.frameIn;
      if (!fi || msg.seq !== fi.seq || !Number.isInteger(msg.i) || msg.i < 0 || msg.i >= fi.parts) return;
      if (typeof msg.data !== 'string' || msg.data.length > C.PROFILE_CHUNK_CHARS || fi.chunks[msg.i] !== undefined) return;
      fi.chunks[msg.i] = msg.data;
      if (++fi.got < fi.parts) return;
      p.frameIn = null;
      if (fi.seq <= p.lastFrameSeq) return;
      p.lastFrameSeq = fi.seq;
      this.emit('control-frame', { peerId: p.id, seq: fi.seq, w: fi.w, h: fi.h, data: fi.chunks.join('') });
    }

    /**
     * Kontrol girdisini güvenli biçime indirger; uygun değilse null.
     * kind: move {x,y} · button {button,down,x,y} · wheel {delta,x,y}
     *       key {vk,down} · keys {vks:[...]} (kısayol: sırayla bas, ters sırayla bırak)
     * x/y karşı ekranın 0–1 aralığına normalize edilmiş göreli konumudur.
     */
    static cleanControlInput(msg) {
      if (!msg || typeof msg !== 'object') return null;
      const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : null;
      const pos = () => {
        const x = num(msg.x, 0, 1), y = num(msg.y, 0, 1);
        return (x === null || y === null) ? null : { x, y };
      };
      switch (msg.kind) {
        case 'move': { const p = pos(); return p ? Object.assign({ kind: 'move' }, p) : null; }
        case 'button': {
          const p = pos();
          if (!p || ['left', 'right', 'middle'].indexOf(msg.button) < 0) return null;
          return Object.assign({ kind: 'button', button: msg.button, down: !!msg.down }, p);
        }
        case 'wheel': {
          const p = pos(); const delta = num(msg.delta, -2400, 2400);
          return (p && delta !== null) ? Object.assign({ kind: 'wheel', delta: Math.round(delta) }, p) : null;
        }
        case 'key':
          return (Number.isInteger(msg.vk) && msg.vk >= 1 && msg.vk <= 254)
            ? { kind: 'key', vk: msg.vk, down: !!msg.down } : null;
        case 'keys': {
          if (!Array.isArray(msg.vks) || !msg.vks.length || msg.vks.length > 6) return null;
          if (!msg.vks.every(v => Number.isInteger(v) && v >= 1 && v <= 254)) return null;
          return { kind: 'keys', vks: msg.vks.slice() };
        }
        default: return null;
      }
    }

    // ------------------------------------------------------------ sohbet & dosya transferi
    sendChatMessage(text) {
      if (typeof text !== 'string' || !text.trim()) return null;
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const time = Date.now();
      const payload = { type: 'chat-text', id, text: text.trim(), time };
      this._broadcast(payload);
      return { id, sender: 'me', text: text.trim(), time };
    }

    sendChatTyping(typing) {
      this._broadcast({ type: 'chat-typing', typing: !!typing });
    }

    /**
     * Dosyayı diskten dilim dilim okuyup gönderir (tüm dosya belleğe alınmaz).
     * @param {File} file
     * @param {string} caption
     * @param {{id?:string, onProgress?:(ratio:number, sent:number, parts:number)=>void}} opts
     */
    async sendChatFile(file, caption, opts) {
      if (!file) return null;
      const o = opts || {};
      const id = o.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
      const time = Date.now();
      const chunkBytes = C.FILE_CHUNK_BYTES || 9000;
      const parts = Math.max(1, Math.ceil(file.size / chunkBytes));

      const head = {
        type: 'chat-file-head',
        id,
        name: String(file.name || 'dosya').slice(0, 100),
        size: file.size,
        mime: String(file.type || 'application/octet-stream').slice(0, 50),
        parts,
        chunk: chunkBytes,
        caption: typeof caption === 'string' ? caption.trim() : '',
        time
      };
      this._broadcast(head);

      const conns = this._openConns();
      if (!conns.length) throw new Error('Bağlantı yok');

      for (let i = 0; i < parts; i++) {
        if (!this._openConns().length) throw new Error('Bağlantı koptu');
        const slice = file.slice(i * chunkBytes, Math.min(file.size, (i + 1) * chunkBytes));
        const buf = await slice.arrayBuffer();
        const data = buf.byteLength ? bytesToBase64(new Uint8Array(buf)) : '';
        this._broadcast({ type: 'chat-file-chunk', id, i, data: data });
        if (o.onProgress) o.onProgress((i + 1) / parts, i + 1, parts);
        if ((i & 7) === 7) await this._drain(conns);
      }

      let url = '';
      try { url = URL.createObjectURL(file); } catch (e) { url = ''; }

      return {
        id,
        sender: 'me',
        text: head.caption,
        file: { name: head.name, size: head.size, mime: head.mime, url: url, blob: file },
        time,
        state: 'sent'
      };
    }

    /** Açık veri kanalları. */
    _openConns() {
      const out = [];
      this.partners.forEach(p => { if (p.conn && p.conn.open) out.push(p.conn); });
      return out;
    }

    /** DataChannel tamponu boşalana kadar bekle (1 GB'lık aktarımda şart). */
    async _drain(conns, limit, maxWaitMs) {
      const high = limit || 2 * 1024 * 1024;
      const deadline = Date.now() + (maxWaitMs || 15000);
      for (;;) {
        let busy = false;
        for (let i = 0; i < conns.length; i++) {
          const dc = conns[i] && conns[i].dataChannel;
          if (dc && dc.bufferedAmount > high) { busy = true; break; }
        }
        if (!busy || Date.now() > deadline) return;
        await sleep(15);
      }
    }

    _onChatFileHead(msg, p) {
      if (!p || typeof msg.id !== 'string' || !Number.isInteger(msg.parts) || msg.parts < 1) return;
      const size = Number(msg.size) || 0;
      if (size > (C.FILE_MAX_BYTES || 1073741824)) {
        try { p.conn.send({ type: 'chat-file-reject', id: msg.id, reason: 'too-big' }); } catch (e) { /* yok */ }
        return;
      }
      if (!p.filesIn) p.filesIn = new Map();
      const fi = {
        id: msg.id,
        name: String(msg.name || 'dosya').slice(0, 100),
        size: size,
        mime: String(msg.mime || 'application/octet-stream'),
        caption: typeof msg.caption === 'string' ? msg.caption : '',
        parts: msg.parts,
        time: msg.time || Date.now(),
        chunks: new Array(msg.parts),
        got: 0,
        received: 0,
        last: 0
      };
      p.filesIn.set(msg.id, fi);
      this.emit('chat-file-incoming', {
        id: fi.id, peerId: p.id, senderName: p.profile.name,
        file: { name: fi.name, size: fi.size, mime: fi.mime },
        parts: fi.parts, time: fi.time
      });
    }

    _onChatFileChunk(msg, p) {
      if (!p || !p.filesIn) return;
      const fi = p.filesIn.get(msg.id);
      if (!fi || !Number.isInteger(msg.i) || msg.i < 0 || msg.i >= fi.parts) return;
      if (typeof msg.data !== 'string' || msg.data.length > 24000) return;
      if (fi.chunks[msg.i] !== undefined) return;

      let bytes;
      try { bytes = msg.data ? base64ToBytes(msg.data) : new Uint8Array(0); }
      catch (e) { return; }

      fi.chunks[msg.i] = bytes;
      fi.got++;
      fi.received += bytes.length;

      if (fi.got < fi.parts) {
        const now = Date.now();
        if (now - fi.last >= (C.FILE_PROGRESS_MS || 250)) {
          fi.last = now;
          this.emit('chat-file-progress', {
            id: fi.id, ratio: fi.got / fi.parts, got: fi.got, parts: fi.parts,
            size: fi.size, received: fi.received
          });
        }
        return;
      }

      p.filesIn.delete(fi.id);

      let url = '', blob = null;
      try {
        blob = new Blob(fi.chunks, { type: fi.mime || 'application/octet-stream' });
        url = URL.createObjectURL(blob);
      } catch (e) {
        this.emit('chat-file-failed', { id: fi.id, reason: 'memory' });
        return;
      }

      this.emit('chat-message', {
        id: fi.id,
        peerId: p.id,
        sender: 'partner',
        senderName: p.profile.name,
        text: fi.caption,
        file: { name: fi.name, size: fi.size, mime: fi.mime, url: url, blob: blob },
        time: fi.time,
        state: 'received'
      });

      try { p.conn.send({ type: 'chat-file-ack', id: fi.id }); } catch (e) { /* yok */ }
    }

    _localState() { return { type: 'state', muted: this.audio.muted, noMic: !this.audio.hasMic }; }

    // ---------------------------------------------------------------- profil (isim + fotoğraf)
    /**
     * Kendi profilini karşı tarafa gönderir. Yalnızca FK.profile.publicProfile() gider: isim + fotoğraf.
     * Kullanıcı adı bu mesajlara hiçbir koşulda eklenmez.
     * Fotoğraf, PeerJS JSON kanalının tek mesaj sınırı (16 300 bayt) aşılmasın diye parçalanır.
     */
    sendProfile() { this.partners.forEach(p => this._sendProfileTo(p)); }

    _sendProfileTo(p) {
      const conn = p && p.conn;
      if (!conn || !conn.open || !FK.profile) return;
      const { name, photo } = FK.profile.publicProfile();
      const size = C.PROFILE_CHUNK_CHARS;
      const parts = photo ? Math.ceil(photo.length / size) : 0;
      if (parts > C.PROFILE_MAX_PARTS) return;
      const id = (++this._profileSeq).toString(36) + Date.now().toString(36);
      try {
        conn.send({ type: 'profile', id, name, parts });
        for (let i = 0; i < parts; i++) conn.send({ type: 'profile-photo', id, i, data: photo.slice(i * size, (i + 1) * size) });
      } catch (e) { /* bağlantı kapanıyor; yeniden bağlanınca tekrar gönderilir */ }
    }

    _onProfileHead(msg, p) {
      const parts = msg.parts;
      if (typeof msg.id !== 'string' || msg.id.length > 40 || !Number.isInteger(parts) || parts < 0 || parts > C.PROFILE_MAX_PARTS) return;
      const name = FK.profile.cleanName(msg.name);
      if (parts === 0) {
        p.profileIn = null;
        this._setRemoteProfile(p, name, '');
        return;
      }
      // İsim hemen güncellenir; yeni fotoğraf tamamı gelince eskisinin yerini alır.
      p.profileIn = { id: msg.id, parts, chunks: new Array(parts), got: 0 };
      this._setRemoteProfile(p, name, p.profile.photo);
    }

    _onProfileChunk(msg, p) {
      const pi = p.profileIn;
      if (!pi || msg.id !== pi.id || !Number.isInteger(msg.i) || msg.i < 0 || msg.i >= pi.parts) return;
      if (typeof msg.data !== 'string' || msg.data.length > C.PROFILE_CHUNK_CHARS || pi.chunks[msg.i] !== undefined) return;
      pi.chunks[msg.i] = msg.data;
      if (++pi.got < pi.parts) return;
      p.profileIn = null;
      const photo = pi.chunks.join('');
      this._setRemoteProfile(p, p.profile.name, FK.profile.isSafePhoto(photo) ? photo : '');
    }

    _setRemoteProfile(p, name, photo) {
      const clean = FK.profile ? FK.profile.sanitizeRemote(name, photo) : { name: '', photo: '' };
      if (clean.name === p.profile.name && clean.photo === p.profile.photo) return;
      p.profile = clean;
      this.emit('remote-profile', Object.assign({ id: p.id }, clean));
      this._emitMembers();
    }

    /** Odadan çık: karşı tarafa haber ver, bağlantıları ve PeerJS kaydını kapat (sahipse kod geçersizleşir). */
    async leave() {
      if (this.disposed) return;
      this.disposed = true;
      this._reconnectRun++;
      let sent = false;
      this.partners.forEach(p => {
        if (p.conn && p.conn.open) { try { p.conn.send({ type: 'bye' }); sent = true; } catch (e) { /* yok */ } }
      });
      if (sent) await sleep(150); // mesajın gitmesi için kısa süre
      if (this.pendingJoin) this.pendingJoin(new SessionError('closed'));
      Array.from(this.partners.values()).forEach(p => { this._dropLink(p); p.clearTimers(); });
      this.partners.clear();
      this.audio.detachRemote();
      this._stopStats();
      Object.keys(this._timers).forEach(t => this._clearTimer(t));
      if (this.peer) { try { this.peer.destroy(); } catch (e) { /* yok */ } }
      this.peer = null;
      this.setState('idle');
    }

    // ---------------------------------------------------------------- istatistik
    _startStats() {
      if (this._statsTimer) return;
      this._statsTimer = setInterval(() => { this._pollStats().catch(() => {}); }, C.STATS_INTERVAL_MS);
      this._pollStats().catch(() => {});
    }

    _stopStats() {
      if (this._statsTimer) clearInterval(this._statsTimer);
      this._statsTimer = null;
    }

    async _pollStats() {
      if (this.statsPaused) return;
      const list = Array.from(this.partners.values()).filter(p => p.connected);
      if (!list.length) { this._stopStats(); return; }
      await Promise.all(list.map(p => this._pollPartnerStats(p).catch(() => {})));
    }

    async _pollPartnerStats(p) {
      const pc = p.call && p.call.peerConnection;
      if (!pc || pc.connectionState !== 'connected') return;
      const report = await pc.getStats();
      const byId = new Map();
      report.forEach(r => byId.set(r.id, r));
      let pair = null;
      report.forEach(r => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = byId.get(r.selectedCandidatePairId) || pair; });
      if (!pair) report.forEach(r => { if (!pair && r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) pair = r; });
      if (!pair) return;
      const local = byId.get(pair.localCandidateId) || {};
      const remote = byId.get(pair.remoteCandidateId) || {};
      p.stats = {
        rtt: pair.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null,
        relay: local.candidateType === 'relay' || remote.candidateType === 'relay',
        localType: local.candidateType || null,
        remoteType: remote.candidateType || null,
      };
      if (p === this._primary) this.lastStats = p.stats;
      this.emit('stats', Object.assign({ id: p.id }, p.stats));
    }
  }

  FK.Session = Session;
  FK.SessionError = SessionError;
  FK.sdp = { tuneOpus };

  /**
   * Bir TURN sunucusunun gerçekten röle adresi verip vermediğini sınar: yalnızca "relay"
   * adaylarına izin veren geçici bir bağlantı kurar ve aday toplar. Ses/veri göndermez.
   * @returns {Promise<{ok:boolean, count:number, error?:string}>}
   */
  function probeRelay(customTurn, timeoutMs) {
    const servers = C.iceServers(customTurn).filter(s => [].concat(s.urls).some(u => /^turns?:/i.test(u)));
    if (!servers.length) return Promise.resolve({ ok: false, count: 0, error: 'none' });
    return new Promise(resolve => {
      let pc;
      try { pc = new RTCPeerConnection({ iceServers: servers, iceTransportPolicy: 'relay' }); }
      catch (e) { resolve({ ok: false, count: 0, error: 'invalid' }); return; }
      let count = 0, lastErr = '', finished = false;
      const finish = () => {
        if (finished) return; finished = true; clearTimeout(timer);
        try { pc.close(); } catch (e) { /* yok */ }
        resolve(count ? { ok: true, count } : { ok: false, count: 0, error: lastErr || 'no-answer' });
      };
      const timer = setTimeout(finish, timeoutMs || 10000);
      pc.onicecandidate = e => {
        if (!e.candidate) { finish(); return; }
        if (/ typ relay /.test(e.candidate.candidate)) count++;
      };
      pc.onicecandidateerror = e => { lastErr = (e.errorCode || '') + ' ' + (e.errorText || ''); };
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') finish(); };
      pc.createDataChannel('probe');
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(() => finish());
    });
  }
  FK.net = { probeRelay };
})(window.FK = window.FK || {});
