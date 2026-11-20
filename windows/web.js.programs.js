/* FK Sohbet — Ayarlar → Oyun içi gösterge → "Program Seç"
 *
 * Gösterge yalnızca burada seçilen program ÖNDEYKEN, o programın penceresinin sol üst köşesinde
 * görünür. Seçim Windows tarafında (settings.ini) saklanır; program kapanınca gösterge kapanır,
 * tekrar açılınca kendiliğinden etkinleşir. Program listesi gerçek açık pencerelerden gelir
 * (host/Programs.cs): ad, simge, exe ve ayırt edici bilgi (Steam oyunu, Java / Minecraft ...).
 *
 * Sayfa → kabuk:  list-programs, overlay-target {exe, path, title, name, icon} | {clear:true}
 * Kabuk → sayfa:  programs {items}, overlay-target {set, name, exe, path, title, icon, running, active, found}
 */
(function (FK) {
  'use strict';

  const $ = (sel, root) => (root || document).querySelector(sel);
  let target = null;       // kabuktan gelen son durum
  let items = [];
  let loading = false, loadTimer = 0, bound = false;

  const GENERIC = /^(javaw?|pythonw?|py|node|electron|applicationframehost|mono|love|nw)\.exe$|^python.*\.exe$/i;
  function titleKey(title) {
    const m = String(title || '').trim().match(/^[^\p{L}]*(\p{L}[\p{L}\d'_]*)/u);
    return m && m[1].length >= 2 ? m[1] : '';
  }
  function isTarget(it) {
    if (!target || !target.set || !it) return false;
    if (String(it.exe).toLowerCase() !== String(target.exe).toLowerCase()) return false;
    if (!GENERIC.test(target.exe)) return true;
    const key = titleKey(target.title);
    return !key || String(it.title || '').toLowerCase().startsWith(key.toLowerCase());
  }

  function overlayOn() { return !!(FK.settings && FK.settings.get('overlay')); }

  /** "Program Seç" bölümü yalnızca gösterge AÇIKKEN (ve masaüstü uygulamasında) görünür. */
  function sync() {
    const box = $('#overlay-target');
    if (!box) return;
    box.hidden = !(FK.host.available && overlayOn());
    if (box.hidden) closePicker();
    renderTarget();
  }

  function paintIcon(el, url) {
    const img = $('img', el);
    const ok = typeof url === 'string' && url.startsWith('data:image/png;base64,');
    if (ok) { if (img.getAttribute('src') !== url) img.src = url; img.hidden = false; }
    else { img.hidden = true; img.removeAttribute('src'); }
    el.classList.toggle('has-img', ok);
  }

  function setStatus(text, kind) {
    const st = $('#ot-status');
    st.textContent = text;
    st.className = 'small muted prog-status' + (kind ? ' ' + kind : '');
  }

  function renderTarget() {
    if (!$('#ot-name')) return;
    const t = target;
    const set = !!(t && t.set);
    const name = set ? (t.name || t.exe) : 'Seçilmedi';
    $('#ot-name').textContent = name;
    $('#ot-name').title = set ? (t.path || t.exe) : '';
    paintIcon($('#ot-icon'), set ? t.icon : '');
    $('#btn-pick-program span').textContent = set ? 'Değiştir' : 'Program Seç';
    $('#btn-clear-program').hidden = !set;
    if (!set) {
      setStatus('Göstergenin görüneceği oyunu/programı seç. Seçilmezse yalnızca tam ekran oyunlarda otomatik görünür.', '');
    } else if (t.active) {
      setStatus('Etkin — gösterge şu an ' + name + ' penceresinin sol üst köşesinde.', 'ok');
    } else if (t.running) {
      const inRoom = !!(FK.app && FK.app.session);
      setStatus(inRoom ? 'Çalışıyor — ' + name + ' öndeyken gösterge sol üst köşesinde görünür.'
                       : 'Çalışıyor — bir odadayken ' + name + ' öndeyse gösterge sol üst köşesinde görünür.', 'ok');
    } else if (t.found === false) {
      setStatus('Program bulunamadı: ' + (t.exe || name) + ' kaydedilen konumda yok (taşınmış ya da kaldırılmış olabilir). Yine de bu adla açılırsa gösterge çalışır; gerekirse "Değiştir" ile yeniden seç.', 'error');
    } else {
      setStatus(name + ' şu an açık değil — açıldığında gösterge otomatik etkinleşir.', 'warn');
    }
  }

  // ---------------------------------------------------------------- liste penceresi
  function openPicker() {
    if (!FK.host.available) return;
    $('#program-picker').hidden = false;
    $('#program-search').value = '';
    load();
    setTimeout(() => $('#program-search').focus(), 30);
  }

  function closePicker() {
    const p = $('#program-picker');
    if (p && !p.hidden) p.hidden = true;
    clearTimeout(loadTimer);
    loading = false;
  }

  function load() {
    loading = true;
    items = [];
    renderList();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => { if (loading) { loading = false; renderList('Program listesi alınamadı. Yenile ile tekrar dene.'); } }, 8000);
    FK.host.send('list-programs');
  }

  function renderList(errorText) {
    const ul = $('#program-list');
    const empty = $('#program-empty');
    ul.textContent = '';
    if (loading) { empty.hidden = false; empty.textContent = 'Açık programlar aranıyor...'; return; }
    if (errorText) { empty.hidden = false; empty.textContent = errorText; return; }
    const q = $('#program-search').value.trim().toLocaleLowerCase('tr');
    const shown = items.filter(it => !q || [it.name, it.title, it.exe, it.tag].some(v => String(v || '').toLocaleLowerCase('tr').includes(q)));
    shown.forEach(it => ul.appendChild(itemEl(it)));
    empty.hidden = shown.length > 0;
    if (!items.length) empty.textContent = 'Açık program bulunamadı. Oyununu ya da programını açıp yenile düğmesine bas.';
    else if (!shown.length) empty.textContent = '"' + $('#program-search').value.trim() + '" ile eşleşen açık program yok.';
  }

  function itemEl(it) {
    const li = document.createElement('li');
    li.className = 'prog-item' + (isTarget(it) ? ' selected' : '');
    li.tabIndex = 0;
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', isTarget(it) ? 'true' : 'false');
    const icon = document.createElement('span');
    icon.className = 'prog-icon';
    icon.innerHTML = '<img alt="" draggable="false" hidden><svg><use href="#i-app"/></svg>';
    paintIcon(icon, it.icon);
    const text = document.createElement('div');
    text.className = 'prog-text';
    const nm = document.createElement('span');
    nm.className = 'prog-name';
    nm.textContent = it.name || it.exe;
    const sub = document.createElement('span');
    sub.className = 'prog-sub';
    const parts = [];
    if (it.title && it.title !== it.name) parts.push(it.title);
    parts.push(it.exe);
    sub.textContent = parts.join(' · ');
    sub.title = it.path || it.exe;
    text.append(nm, sub);
    li.append(icon, text);
    if (it.tag) {
      const tag = document.createElement('span');
      tag.className = 'prog-tag';
      tag.textContent = it.tag;
      li.appendChild(tag);
    }
    const pick = () => choose(it);
    li.addEventListener('click', pick);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    return li;
  }

  function choose(it) {
    FK.host.send('overlay-target', { exe: it.exe, path: it.path, title: it.title, name: it.name, icon: it.icon || '' });
    // Kabuk onaylayana kadar seçimi hemen göster (onay gelince gerçek durum yazılır).
    target = { set: true, name: it.name || it.exe, exe: it.exe, path: it.path, title: it.title, icon: it.icon, running: true, active: false, found: true };
    renderTarget();
    closePicker();
    const btn = $('#btn-pick-program');
    if (btn) btn.focus();
  }

  function bind() {
    if (bound || !$('#overlay-target')) return;
    bound = true;
    $('#btn-pick-program').addEventListener('click', openPicker);
    $('#btn-clear-program').addEventListener('click', () => {
      FK.host.send('overlay-target', { clear: true });
      target = { set: false };
      renderTarget();
    });
    $('#btn-programs-refresh').addEventListener('click', load);
    $('#btn-picker-close').addEventListener('click', closePicker);
    $('#program-search').addEventListener('input', () => renderList());
    $('#program-picker').addEventListener('click', e => { if (e.target.id === 'program-picker') closePicker(); });
    $('#program-picker').addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); closePicker(); } }, true);
    const toggle = document.querySelector('input[data-bind="overlay"]');
    if (toggle) toggle.addEventListener('change', () => setTimeout(sync, 0));
    FK.host.on('programs', m => {
      loading = false;
      clearTimeout(loadTimer);
      items = Array.isArray(m.items) ? m.items.filter(it => it && typeof it.exe === 'string') : [];
      if (!$('#program-picker').hidden) renderList();
    });
    FK.host.on('overlay-target', m => { target = m; renderTarget(); });
    FK.host.on('init', () => setTimeout(sync, 0));
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  FK.programs = {
    sync, open: openPicker, close: closePicker,
    get target() { return target; },
    get items() { return items; },
    _titleKey: titleKey,
  };
})(window.FK = window.FK || {});
