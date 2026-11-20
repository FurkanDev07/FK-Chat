'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'android/app/src/main/assets/web/js/i18n-preview.js'), 'utf8');
const markup = fs.readFileSync(path.join(root, 'android/app/src/main/assets/web/index.html'), 'utf8');
function setup(saved) {
  const dom = new JSDOM(markup, {url: 'https://fksohbet.local/', runScripts: 'outside-only'});
  if (saved) dom.window.localStorage.setItem('fksohbet.language.preview.v1', saved);
  dom.window.eval(script);
  return dom;
}
function change(dom, language) {
  const select = dom.window.document.querySelector('#language-preview');
  select.value = language;
  select.dispatchEvent(new dom.window.Event('change'));
}
test('default Turkish, switch English and restore Turkish', () => {
  const dom = setup(); const doc = dom.window.document;
  const title = doc.querySelector('#settings-title');
  assert.equal(title.textContent, 'Ayarlar');
  change(dom, 'en');
  assert.equal(title.textContent, 'Settings');
  assert.equal(doc.documentElement.lang, 'en');
  assert.equal(dom.window.localStorage.getItem('fksohbet.language.preview.v1'), 'en');
  assert.equal(doc.querySelector('#language-preview-notice').hidden, false);
  change(dom, 'tr');
  assert.equal(title.textContent, 'Ayarlar');
  assert.equal(doc.querySelector('#language-preview-notice').hidden, true);
  dom.window.close();
});
test('saved English applied at startup', () => {
  const dom = setup('en');
  assert.equal(dom.window.document.querySelector('#settings-title').textContent, 'Settings');
  assert.equal(dom.window.document.querySelector('#language-preview').value, 'en');
  dom.window.close();
});
test('does not replace text changed by application or new chat messages', () => {
  const dom = setup();
  const doc = dom.window.document;
  const title = doc.querySelector('#settings-title');
  title.firstChild.nodeValue = 'Application-generated value';
  const msg = doc.createElement('div'); msg.textContent = 'Ayarlar'; doc.body.append(msg);
  change(dom, 'en');
  assert.equal(title.textContent, 'Application-generated value');
  assert.equal(msg.textContent, 'Ayarlar');
  dom.window.close();
});
test('platform preview scripts match', () => {
  assert.equal(script, fs.readFileSync(path.join(root, 'windows/web.js.i18n-preview.js'), 'utf8'));
});
test('simplified copy is localized and privacy guidance remains visible in both languages', () => {
  const dom = setup(); const doc = dom.window.document;
  const subtitle = doc.querySelector('#screen-home .hero p');
  const profile = doc.querySelector('.profile-note');
  const chatNotice = doc.querySelector('.chat-p2p-notice');
  assert.equal(subtitle.textContent.trim(), 'Oda koduyla sesli sohbet');
  assert.match(profile.textContent, /kullanıcı adın görünmez/);
  assert.match(chatNotice.textContent, /sunucuda saklanmaz/);
  change(dom, 'en');
  assert.equal(subtitle.textContent.trim(), 'Voice chat with a room code');
  assert.match(profile.textContent, /username is not/);
  assert.match(chatNotice.textContent, /not stored on a server/);
  change(dom, 'tr');
  assert.equal(subtitle.textContent.trim(), 'Oda koduyla sesli sohbet');
  dom.window.close();
});

test('runtime connection status follows the selected language', () => {
  const dom = setup('en');
  const { translate } = dom.window.FK.i18n;
  assert.equal(translate('Bağlantı bekleniyor...'), 'Waiting for a connection...');
  assert.equal(translate('Unknown status'), 'Unknown status');
  change(dom, 'tr');
  assert.equal(translate('Bağlantı bekleniyor...'), 'Bağlantı bekleniyor...');
  dom.window.close();
});
