/* FK Sohbet — oyun içi gösterge beslemesi
 *
 * Göstergenin kendisi Windows tarafında yerel bir pencere olarak çizilir (host/Overlay.cs):
 * saydam, tıklamayı geçirir, odak almaz. İki satır:  [PP] [İsim] [Animasyon]
 * (üstte sen, altında arkadaşın). Bu modül yalnızca MEVCUT verileri iletir:
 *   - Profil: FK.profile.publicProfile() (sen) ve session.members() (arkadaşlar: odada zaten gelen
 *     isim + fotoğraf). Ayrı bir profil verisi yok; kullanıcı adı hiç yok. Fotoğraflar PNG'ye
 *     çevrilir: Windows'un GDI+ çizicisi WebP açamaz.
 *   - Konuşma: görüşme kartlarındaki ölçümün aynısı — senin için mikrofon seviyesi
 *     (FK.audio.getInputLevel), arkadaşlar için o kişiden gelen CANLI sesin seviyesi
 *     (FK.audio.getRemoteLevel(id)); eşik FK.config.SPEAKING_LEVEL. Mikrofonu kapalı olan
 *     kişide animasyon çalışmaz, yerinde kırmızı simge görünür.
 * Ölçüm yalnızca kabuk "gösterge görünür" dediğinde çalışır; değişmeyen değer tekrar gönderilmez.
 *
 * Sayfa → kabuk:  overlay-profile {name, photo}, overlay-members {members:[{id, name, photo}]},
 *                 overlay-voice {speaking, level, muted, peers:[{id, speaking, level, muted}]}
 * Kabuk → sayfa:  overlay {visible}
 */
(function (FK) {
  'use strict';

  const C = FK.config;
  let visible = false;
  let timer = 0;
  let speaking = false, lastLoud = 0, lastKey = '';
  const peerVoice = new Map();   // id → {speaking, lastLoud}
  const pngCache = new Map();    // fotoğraf data URL → PNG data URL
  let profileSeq = 0, membersSeq = 0, lastMembersKey = null;

  function toPng(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const n = C.OVERLAY_PHOTO_PX;
          const c = document.createElement('canvas');
          c.width = c.height = n;
          const g = c.getContext('2d');
          g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
          g.drawImage(img, 0, 0, n, n);
          resolve(c.toDataURL('image/png'));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('decode'));
      img.src = dataUrl;
    });
  }

  async function pngOf(photo) {
    if (!photo) return '';
    if (pngCache.has(photo)) return pngCache.get(photo);
    let png = '';
    try { png = await toPng(photo); } catch (e) { png = ''; }
    if (pngCache.size > 24) pngCache.clear();
    pngCache.set(photo, png);
    return png;
  }

  /** Mevcut profili (isim + PP) göstergeye gönderir. Profil değişince app.js çağırır. */
  async function sendProfile() {
    if (!FK.host.available) return;
    const { name, photo } = FK.profile.publicProfile();
    const seq = ++profileSeq;
    const png = await pngOf(photo);
    if (seq !== profileSeq) return; // bu arada daha yeni bir değişiklik geldi
    FK.host.send('overlay-profile', { name, photo: png });
  }

  function session() { return FK.app && FK.app.session; }

  /** Göstergede satırı olacak arkadaş: sesi gerçekten bağlı olan karşı taraf (en fazla 1). */
  function liveMembers() {
    const s = session();
    if (!s || typeof s.members !== 'function') return [];
    return s.members().filter(m => m.status === 'connected' || m.status === 'unstable').slice(0, C.MAX_MEMBERS - 1);
  }

  /** Odadaki arkadaş listesi (isim + PP) değişince çağrılır; yalnızca gerçekten değiştiyse gönderir. */
  async function sendMembers() {
    if (!FK.host.available) return;
    const list = liveMembers();
    const key = list.map(m => m.id + '\u0001' + m.name + '\u0001' + (m.photo ? m.photo.length + ':' + m.photo.slice(-24) : '')).join('\u0002');
    if (key === lastMembersKey) return;
    const seq = ++membersSeq;
    const members = [];
    for (const m of list) members.push({ id: m.id, name: m.name || '', photo: await pngOf(m.photo) });
    if (seq !== membersSeq) return;
    lastMembersKey = key;
    FK.host.send('overlay-members', { members });
    lastKey = '';            // yeni satırlar için konuşma durumunu hemen tekrar bildir
    if (visible) tick();
  }

  function decide(level, muted, wasSpeaking, lastLoudAt, now) {
    const loud = !muted && level > C.SPEAKING_LEVEL;
    const sp = !muted && (loud || (wasSpeaking && now - lastLoudAt < C.SPEAKING_HOLD_MS));
    return { sp, loud };
  }

  function tick() {
    const A = FK.audio;
    const now = performance.now();
    const muted = !!(A.muted || !A.hasMic);
    const level = muted ? 0 : A.getInputLevel();
    const me = decide(level, muted, speaking, lastLoud, now);
    if (me.loud) lastLoud = now;
    speaking = me.sp;
    const lv = me.sp ? Math.round(level * 20) / 20 : 0;

    const peers = [];
    const seen = new Set();
    liveMembers().forEach(m => {
      seen.add(m.id);
      const v = peerVoice.get(m.id) || { speaking: false, lastLoud: 0 };
      const pm = !!(m.muted || m.noMic);
      const pl = pm ? 0 : A.getRemoteLevel(m.id);
      const d = decide(pl, pm, v.speaking, v.lastLoud, now);
      if (d.loud) v.lastLoud = now;
      v.speaking = d.sp;
      peerVoice.set(m.id, v);
      peers.push({ id: m.id, speaking: d.sp, level: d.sp ? Math.round(pl * 20) / 20 : 0, muted: pm });
    });
    Array.from(peerVoice.keys()).forEach(id => { if (!seen.has(id)) peerVoice.delete(id); });

    const key = [me.sp, lv, muted].join(',') + '|' + peers.map(p => [p.id, p.speaking, p.level, p.muted].join(',')).join('|');
    if (key === lastKey) return;
    lastKey = key;
    FK.host.send('overlay-voice', { speaking: me.sp, level: lv, muted, peers });
  }

  /** Kabuk göstergeyi gösterince/gizleyince çağrılır; ölçüm yalnızca görünürken çalışır. */
  function setVisible(v) {
    v = !!v;
    if (v === visible) return;
    visible = v;
    clearInterval(timer);
    timer = 0;
    speaking = false; lastKey = ''; peerVoice.clear();
    if (v) { tick(); timer = setInterval(tick, C.OVERLAY_TICK_MS); }
  }

  FK.overlay = {
    setVisible, sendProfile, sendMembers,
    get visible() { return visible; },
    get speaking() { return speaking; },
    peerSpeaking(id) { const v = peerVoice.get(id); return !!(v && v.speaking); },
  };
})(window.FK = window.FK || {});
