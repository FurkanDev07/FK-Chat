'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const web = path.resolve(__dirname, '../android/app/src/main/assets/web');
const html = fs.readFileSync(path.join(web, 'index.html'), 'utf8');

test('Android web scripts initialize and the language selector remains accessible', async () => {
  const dom = new JSDOM(html, { url: 'https://fksohbet.local/', runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const failures = [];
  dom.window.addEventListener('error', e => failures.push(e.message));
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) dom.window.eval(fs.readFileSync(path.join(web, m[1]), 'utf8'));
  await new Promise(resolve => {
    if (dom.window.document.readyState !== 'loading') resolve();
    else dom.window.document.addEventListener('DOMContentLoaded', resolve, {once:true});
  });
  assert.ok(dom.window.FK.app);
  assert.equal(dom.window.FK.app.state.screen, 'home');
  dom.window.FK.app.openSettings();
  const select = dom.window.document.querySelector('#language-preview');
  select.value = 'en'; select.dispatchEvent(new dom.window.Event('change'));
  assert.equal(dom.window.document.querySelector('#settings-title').textContent, 'Settings');
  assert.equal(dom.window.localStorage.getItem('fksohbet.language.preview.v1'), 'en');
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.deepEqual(failures, []);
  dom.window.close();
});
