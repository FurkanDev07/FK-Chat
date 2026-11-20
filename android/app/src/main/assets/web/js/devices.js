/* FK Sohbet — gerçek ses cihazlarının listesi (navigator.mediaDevices) */
(function (FK) {
  'use strict';

  const md = navigator.mediaDevices;
  const listeners = new Set();
  let cache = { inputs: [], outputs: [] };

  function outputSelectionSupported() {
    return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  }

  function normalize(list, kind, fallbackName) {
    let n = 0;
    return list
      .filter(d => d.kind === kind)
      .map(d => ({
        id: d.deviceId,
        groupId: d.groupId,
        // Etiketler mikrofon izni verilince dolar; o zamana kadar okunabilir yedek ad.
        label: d.label || (d.deviceId === 'default' ? 'Varsayılan' : fallbackName + ' ' + (++n)),
        isDefault: d.deviceId === 'default',
        isCommunications: d.deviceId === 'communications',
      }));
  }

  async function refresh() {
    if (!md || !md.enumerateDevices) return cache;
    const all = await md.enumerateDevices();
    cache = {
      inputs: normalize(all, 'audioinput', 'Mikrofon'),
      outputs: normalize(all, 'audiooutput', 'Ses çıkışı'),
    };
    listeners.forEach(fn => { try { fn(cache); } catch (e) { console.error(e); } });
    return cache;
  }

  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  if (md && 'ondevicechange' in md) {
    // Kulaklık takıldı/çıkarıldı, USB/Bluetooth mikrofon bağlandı vb.
    md.addEventListener('devicechange', () => { refresh().catch(() => {}); });
  }

  FK.devices = {
    refresh,
    onChange,
    get inputs() { return cache.inputs; },
    get outputs() { return cache.outputs; },
    outputSelectionSupported,
  };
})(window.FK = window.FK || {});
