/* Experimental UI translation. Only selected runtime strings are covered. */
(function () {
  'use strict';
  const en = {
  "Bağlantı bekleniyor...": "Waiting for a connection...",
  "Karşı taraf bağlanıyor...": "The other person is connecting...",
  "Bağlantı zayıf": "Weak connection",
  "Bağlantı zayıfladı, ses kesilebilir. Bağlantı korunmaya çalışılıyor...": "The connection is weak and audio may drop. Trying to keep the connection alive...",
  "Yeniden bağlanıyor": "Reconnecting",
  "Bağlantı kesildi. Yeniden bağlanılıyor...": "Connection lost. Reconnecting...",
  "Bağlantı kesildi. Arkadaşının yeniden bağlanması bekleniyor...": "Connection lost. Waiting for your friend to reconnect...",
  "Bağlantı kesildi": "Connection lost",
  "Bağlantı kesildi.": "Connection lost.",
  "Arkadaşın ayrıldı · Bağlantı bekleniyor...": "Your friend left \u00b7 Waiting for a connection...",
  "Karşı taraf bağlandı": "The other person connected",
  "Arkadaşın bağlandı.": "Your friend connected.",
  "Bağlantı yeniden kuruldu": "Connection restored",
  "Bağlantı yeniden kuruldu.": "Connection restored.",
  "ayrıldı": "left",
  "odadan ayrıldı.": "left the room.",
  "bağlandı": "connected",
  "bağlandı.": "connected.",
  "yeniden bağlandı": "reconnected",
  "yeniden bağlandı.": "reconnected.",
  "ile bağlantı kesildi.": "disconnected.",
  "Oda sahibi odayı kapattı": "The host closed the room",
  "Oda sahibi odayı kapattı.": "The host closed the room.",
  "Ana ekran": "Home screen",
  "Ayarlar": "Settings",
  "FK Sohbet logosu": "FK Sohbet logo",
  "Oda koduyla arkadaşınla doğrudan sesli sohbet": "Talk directly with a friend using a room code",
  "Oda Oluştur": "Create Room",
  "Odaya Katıl": "Join Room",
  "Eşler arası (P2P) · Ses kaydedilmez": "Peer-to-peer (P2P) · Audio is not recorded",
  "Oda oluştur": "Create room",
  "Ana Menü": "Main Menu",
  "Oda Kodun": "Your Room Code",
  "Oda kodu": "Room code",
  "Kodu Kopyala": "Copy Code",
  "Bağlanıyor...": "Connecting...",
  "Tekrar Dene": "Try Again",
  "Ana Menüye Dön": "Back to Main Menu",
  "Mikrofon": "Microphone",
  "Mikrofon giriş seviyesi": "Microphone input level",
  "Odaya katıl": "Join room",
  "Oda Kodu": "Room Code",
  "Bağlan": "Connect",
  "Görüşme": "Call",
  "Oda": "Room",
  "Oda kodunu kopyala (arkadaşını davet et)": "Copy room code (invite a friend)",
  "Oda kodunu kopyala": "Copy room code",
  "Odadaki kişi sayısı (en fazla 2)": "People in the room (maximum 2)",
  "Bağlandı": "Connected",
  "Bilgisayarın kontrol ediliyor.": "Your computer is being controlled.",
  "Kontrolü Durdur": "Stop Control",
  "Tekrar Bağlan": "Reconnect",
  "Mikrofon kapalı": "Microphone off",
  "Sen": "You",
  "Mikrofon açık": "Microphone on",
  "Arkadaşın": "Your friend",
  "Mikrofon seviyesi": "Microphone level",
  "Giriş seviyesi": "Input level",
  "Ses çıkışı": "Audio output",
  "Ses seviyesi": "Volume",
  "Mikrofonu aç/kapat (Ctrl+Shift+M)": "Toggle microphone (Ctrl+Shift+M)",
  "Mesajlaşma (Sohbet)": "Messaging (Chat)",
  "Mesaj": "Message",
  "Bağlantıyı kes": "Disconnect",
  "Bağlantıyı Kes": "Disconnect",
  "Kapat": "Close",
  "Profil": "Profile",
  "Profil fotoğrafı": "Profile picture",
  "Fotoğrafı değiştir": "Change photo",
  "Profil fotoğrafını değiştir": "Change profile picture",
  "İsim": "Name",
  "Odadaki arkadaşların ismini görür": "Your friends in the room can see your name",
  "Odada görünür": "Visible in the room",
  "Adın": "Your name",
  "Kullanıcı adı": "Username",
  "Kullanıcı adın odada gösterilmez; yalnızca burada görünür": "Your username is not shown in the room; only you can see it",
  "Sadece sen": "Only you",
  "kullaniciadi": "username",
  "3–20 karakter: harf, rakam, _ ve .": "3–20 characters: letters, numbers, _ and .",
  "Fotoğraf yükle": "Upload photo",
  "Kaldır": "Remove",
  "Odadaki arkadaşın profil fotoğrafını ve ismini görür. Kullanıcı adın odada gösterilmez.": "Your friend in the room can see your profile picture and name. Your username is not shown.",
  "Mikrofon cihazı": "Microphone device",
  "Mikrofon testi": "Microphone test",
  "— konuşun, gösterge gerçek sesinize göre hareket eder": "— speak to see the meter respond to your voice",
  "Kendimi dinle": "Listen to myself",
  "(kulaklıkla kullanın)": "(use headphones)",
  "Gürültü engelleme": "Noise suppression",
  "Yankı engelleme": "Echo cancellation",
  "Otomatik ses seviyesi": "Automatic gain control",
  "Mikrofonu Kapat / Aç Kısayolu": "Toggle Microphone Shortcut",
  "Seçtiğin tuşa arka planda veya oyundayken bastığında mikrofon kapanır / açılır": "Press the selected key to toggle your microphone in the background or in a game",
  "Arka planda çalışır": "Works in the background",
  "Tuş atamak için tıklayın": "Click to assign a key",
  "Varsayılan tuşa dön (Ctrl + Shift + M)": "Restore default shortcut (Ctrl + Shift + M)",
  "Varsayılan": "Default",
  "Kısayolu kaldır": "Remove shortcut",
  "Kısayol kutusuna tıklayın ve klavyenizden istediğiniz bir tuşa basın (ör. F9, F10, Pause, M veya Ctrl+M). Arka planda bir şeyler yaparken bu tuşa basınca mikrofon kapanır.": "Click the shortcut box and press a key (for example F9, F10, Pause, M or Ctrl+M). Press it while working in the background to toggle the microphone.",
  "Windows mikrofon izinlerini aç": "Open Windows microphone permissions",
  "Tekrar dene": "Try again",
  "Ses": "Audio",
  "Çıkış cihazı": "Output device",
  "Ses testi": "Audio test",
  "Uygulama": "Application",
  "Windows açılışında başlat": "Start with Windows",
  "Bildirimler": "Notifications",
  "(arkadaşın bağlanınca / bağlantı kopunca)": "(when your friend connects or disconnects)",
  "Arka planda çalıştır": "Run in background",
  "(kapatınca sistem tepsisinde açık kalır)": "(keep running in the system tray when closed)",
  "Kısayol ile mikrofonu aç/kapat": "Toggle microphone with a shortcut",
  "(oyundayken de çalışır)": "(also works in games)",
  "Oyun içi gösterge": "In-game overlay",
  "(seçtiğin programın sol üstünde odadakilerin profili ve konuşma animasyonu)": "(room members and speaking indicators at the top left of the selected program)",
  "Seçili Program:": "Selected Program:",
  "Seçilmedi": "None selected",
  "Göstergenin görüneceği oyunu/programı seç.": "Select the game or program where the overlay should appear.",
  "Program Seç": "Select Program",
  "Seçimi kaldır": "Clear selection",
  "Seçilen kısayol başka bir uygulama tarafından kullanılıyor veya atanamadı.": "The selected shortcut is in use by another application or could not be assigned.",
  "Bu ayarlar yalnızca masaüstü uygulamasında kullanılabilir.": "These settings are available only in the desktop application.",
  "Bağlantı": "Connection",
  "(gelişmiş)": "(advanced)",
  "TURN adresi": "TURN address",
  "turn:sunucu.com:3478": "turn:server.com:3478",
  "Şifre": "Password",
  "TURN'ü test et": "Test TURN",
  "Sohbetteki emoji panelinin": "In the chat emoji panel, the",
  "sekmesi Giphy'den GIF arar.\n            Ücretsiz bir API anahtarı gerekir:": "tab searches for GIFs on Giphy.\n            A free API key is required:",
  "Giphy API anahtarı": "Giphy API key",
  "örn. aBcD1234efGh5678": "e.g. aBcD1234efGh5678",
  "Anahtarı test et": "Test key",
  "· Ses doğrudan arkadaşına gider; kaydedilmez, sunucuda saklanmaz.": "· Audio goes directly to your friend; it is not recorded or stored on a server.",
  "Sohbet": "Chat",
  "çevrimiçi": "online",
  "Sohbeti Temizle": "Clear Chat",
  "Kapat (Esc)": "Close (Esc)",
  "🔒 Mesajlar ve dosyalar doğrudan (P2P) aktarılır, sunucuda saklanmaz. Dosyaları buraya sürükleyebilir veya Ctrl+V ile yapıştırabilirsin.": "🔒 Messages and files are transferred directly (P2P), not stored on a server. Drag files here or paste with Ctrl+V.",
  "Bugün": "Today",
  "Bir mesaj yazın...": "Write a message...",
  "Dosya Gönder": "Send File",
  "Gönder": "Send",
  "Emoji seçici": "Emoji picker",
  "Ara": "Search",
  "Emoji veya GIF": "Emoji or GIF",
  "Emoji ara": "Search emoji",
  "Aramayı temizle": "Clear search",
  "Emojiler": "Emojis",
  "GIF'ler": "GIFs",
  "Bırak, gönderelim": "Drop to send",
  "Dosya veya fotoğraf · tek dosya en fazla 1 GB": "File or photo · maximum 1 GB per file",
  "DOSYA": "FILE",
  "dosya": "file",
  "İndir": "Download",
  "Listeyi yenile": "Refresh list",
  "Oyununu ya da programını aç, sonra listeden seç. Gösterge yalnızca o program öndeyken, penceresinin sol üst köşesinde görünür.": "Open your game or program, then select it from the list. The overlay appears in the top left corner only when that program is in the foreground.",
  "Ara (ör. Minecraft, Among Us, Godot)": "Search (e.g. Minecraft, Among Us, Godot)",
  "Açık programlar": "Open programs",
  "Kişi seçenekleri": "Person options",
  "Bilgisayarı Yönet": "Control Computer",
  "Bilgisayarı Yönetme İsteği": "Computer Control Request",
  "bilgisayarını yönetmek istiyor.": "wants to control your computer.",
  "Bu isteği yalnızca güvendiğin kişiden geldiyse onayla.": "Only approve this request if it comes from someone you trust.",
  "Reddet": "Decline",
  "Onayla": "Approve",
  "Farklı ağlardaki bilgisayarlar doğrudan bağlanır (STUN); çoğu ev internetinde bu yeterlidir.\n            İki taraf da çok kısıtlı bir ağdaysa (ör. bazı mobil/CGNAT bağlantılar) sesi aktaracak bir TURN sunucusu gerekir.\n            Herkese açık ücretsiz TURN kalmadığı için varsayılan yoktur; kendi sunucunuzu buraya ekleyebilirsiniz\n            (her iki tarafta da girilmesi önerilir, bir sonraki bağlantıda geçerli olur).": "Computers on different networks connect directly using STUN, which is sufficient for most home connections.\n            If both sides are on very restricted networks, such as some mobile or CGNAT connections, a TURN server is needed to relay audio.\n            No free public TURN server is provided by default; you can add your own here.\n            Entering it on both sides is recommended; changes apply to the next connection.",
  "→ anahtarı buraya yapıştır.\n            Anahtar yalnızca bu bilgisayarda saklanır. GIF seçildiğinde dosya indirilip arkadaşına doğrudan (P2P) gönderilir;\n            Giphy'ye yalnızca arama sırasında bağlanılır.": "→ paste the key here.\n            The key is stored only on this device. When you choose a GIF, the file is downloaded and sent directly to your friend (P2P);\n            Giphy is contacted only when searching.",
  "Oda koduyla sesli sohbet": "Voice chat with a room code",
  "P2P · Ses kaydedilmez": "P2P · Audio is not recorded",
  "İsim ve fotoğrafın odada görünür; kullanıcı adın görünmez.": "Your name and photo are visible in the room; your username is not.",
  "Kısayol seçmek için kutuya tıklayıp bir tuşa basın.": "Click the box and press a key to set a shortcut.",
  "Kısıtlı ağlarda TURN sunucusu gerekebilir. Varsayılan sunucu yoktur; kendi sunucunuzu iki tarafta da ayarlamanız önerilir. Değişiklikler sonraki bağlantıda uygulanır.": "Restricted networks may require a TURN server. None is provided by default; configure your own on both sides. Changes apply to the next connection.",
  "GIF aramak için Giphy API anahtarı gerekir:": "A Giphy API key is required to search for GIFs:",
  ". Anahtar bu cihazda saklanır; aramalarda Giphy'ye bağlanılır.": ". The key is stored on this device; searches connect to Giphy.",
  "🔒 Mesajlar ve dosyalar doğrudan aktarılır; sunucuda saklanmaz. Dosyaları sürükleyebilir veya Ctrl+V ile yapıştırabilirsin.": "🔒 Messages and files are transferred directly, not stored on a server. Drag files here or paste with Ctrl+V."
};
  const key = 'fksohbet.language.preview.v1';
  let lang = 'tr';
  try { if (localStorage.getItem(key) === 'en') lang = 'en'; } catch (_) {}
  window.FK = window.FK || {};
  window.FK.i18n = Object.freeze({
    translate(text) {
      return lang === 'en' && Object.prototype.hasOwnProperty.call(en, text) ? en[text] : text;
    },
  });
  const originals = [];
  const root = document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (!node.parentElement || node.parentElement.closest('script, style, textarea, #language-preview')) continue;
    const value = node.nodeValue;
    const term = value.trim();
    if (Object.prototype.hasOwnProperty.call(en, term)) originals.push({node, value, term});
  }
  const attributes = [];
  root.querySelectorAll('[title], [placeholder], [aria-label], [alt]').forEach(el => {
    for (const name of ['title', 'placeholder', 'aria-label', 'alt']) {
      const term = el.getAttribute(name);
      if (term && Object.prototype.hasOwnProperty.call(en, term)) attributes.push({el, name, term});
    }
  });
  const select = document.getElementById('language-preview');
  const notice = document.getElementById('language-preview-notice');
  function apply(next) {
    const previous = lang;
    lang = next === 'en' ? 'en' : 'tr';
    for (const item of originals) {
      // Do not overwrite runtime-generated content or user-supplied text.
      const expected = previous === 'en' ? item.value.replace(item.term, en[item.term]) : item.value;
      if (item.node.nodeValue === expected) item.node.nodeValue = lang === 'en' ? item.value.replace(item.term, en[item.term]) : item.value;
    }
    for (const item of attributes) {
      const expected = previous === 'en' ? en[item.term] : item.term;
      if (item.el.getAttribute(item.name) === expected) item.el.setAttribute(item.name, lang === 'en' ? en[item.term] : item.term);
    }
    document.documentElement.lang = lang;
    select.value = lang;
    notice.hidden = lang !== 'en';
    try { localStorage.setItem(key, lang); } catch (_) {}
  }
  // The HTML is initially Turkish, regardless of saved preference.
  const saved = lang; lang = 'tr'; apply(saved);
  select.addEventListener('change', () => apply(select.value));
})();
