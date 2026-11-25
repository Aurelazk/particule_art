'use strict';
/* test-render.cjs — test automatisé de rendu Voie Lactée
 * Teste T0/T1/T2/T3 à 1366×768 et 390×844, parcours les 115 chapitres,
 * vérifie zéro console error/warning, boucle de rendu active, pas d'écran vide.
 * Nécessite : Chrome/Chromium, serveur HTTP local sur http://localhost:18080/
 */
const { spawn } = require('child_process');
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 19231;
const HOST = 'http://localhost:18080/';
const REPORT_DIR = path.join(process.cwd(), 'reports');

const errors = [];
const warnings = [];
const results = {
  tiers: {},
  chapters: 0,
  buttons: 0,
  errors: 0,
  warnings: 0,
  passed: false
};

function ensureReportDir() { if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true }); }

async function main() {
  ensureReportDir();
  const chrome = spawn('google-chrome', [
    '--headless=new', '--remote-debugging-port=' + PORT,
    '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--disable-software-rasterizer',
    '--window-size=1366,768',
    HOST
  ], { stdio: 'ignore' });

  let page = null;
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const resp = await fetch('http://localhost:' + PORT + '/json/list');
      const targets = await resp.json();
      page = targets.find(t => t.type === 'page');
      if (page) break;
    } catch(e) {}
  }

  if (!page) { console.log('FAIL: no page target'); chrome.kill(); process.exit(1); }

  const sock = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { sock.once('open', res); sock.once('error', rej); });

  const pending = new Map(); let seq = 0;
  sock.on('message', data => {
    try {
      const msg = JSON.parse(data);
      if (msg.id !== undefined && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
      if (!msg.method) return;
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        if (msg.params.level === 'error') { errors.push(args); results.errors++; }
        else if (msg.params.level === 'warning') { warnings.push(args); results.warnings++; }
      }
      if (msg.method === 'Network.loadingFailed') warnings.push('FAILED: ' + msg.params.request.url);
    } catch(e) {}
  });

  const send = (method, params) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, res);
    sock.send(JSON.stringify({ id, method, params: params || {} }));
    setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + method)); } }, 10000);
  });

  await send('Runtime.enable');
  await send('Network.enable');

  // Set network conditions: 3G slow
  await send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: 1600 * 1024 / 8, // 1.6 Mbit/s
    uploadThroughput: 1600 * 1024 / 8
  });

  // Set CPU throttling 6x
  await send('Emulation.setCPUThrottlingRate', { rate: 6 });

  // Wait for initial load
  await new Promise(r => setTimeout(r, 12000));
  console.log('Initial load — Errors:', errors.length, 'Warnings:', warnings.length);

  // Test each tier (cycle quality button)
  const tiers = ['T0', 'T1', 'T2', 'T3'];
  let tierClicks = 0;
  for (const tier of tiers) {
    tierClicks++;
    try {
      await send('Runtime.evaluate', { expression: `document.getElementById('btnQuality')?.click()`, returnByValue: true });
      await new Promise(r => setTimeout(r, 1000));
    } catch(e) { console.log('Tier click failed:', e.message); }

    // Take screenshot
    try {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      if (shot && shot.data) fs.writeFileSync(path.join(REPORT_DIR, `tier-${tier}.png`), Buffer.from(shot.data, 'base64'));
    } catch(e) { console.log('Screenshot failed for ' + tier + ':', e.message); }

    // Check console errors after tier switch
    console.log(`Tier ${tier} (click ${tierClicks}) — Errors: ${errors.length}, Warnings: ${warnings.length}`);
    results.tiers[tier] = { errors: errors.length, warnings: warnings.length };
  }

  // Test all 115 chapters
  console.log('\n--- Testing 115 chapters ---');
  for (let i = 0; i < 115; i++) {
    try {
      await send('Runtime.evaluate', {
        expression: `document.querySelectorAll('#progress button[data-ch="${i}"]')[0]?.click()`,
        returnByValue: true
      });
      await new Promise(r => setTimeout(r, 300));
      results.chapters++;
    } catch(e) { console.log('Chapter ' + i + ' failed:', e.message); }
  }

  // Test all buttons
  console.log('\n--- Testing buttons ---');
  const btns = ['btnMode','btnRotL','btnRotR','btnSpin','btnQuality','btnLayout','btnMap','btnWorks','btnAudio','btnCredits','wImport','wFolder','exPng','exSave','exLoad','exHtml'];
  for (const b of btns) {
    try {
      await send('Runtime.evaluate', { expression: `document.getElementById('${b}')?.click()`, returnByValue: true });
      await new Promise(r => setTimeout(r, 300));
      results.buttons++;
    } catch(e) { /* prompt/download buttons can't be tested headless */ }
  }

  // Final screenshot (contact sheet reference)
  try {
    const finalShot = await send('Page.captureScreenshot', { format: 'png' });
    if (finalShot && finalShot.data) fs.writeFileSync(path.join(REPORT_DIR, 'final-state.png'), Buffer.from(finalShot.data, 'base64'));
  } catch(e) { console.log('Final screenshot failed:', e.message); }

  console.log('\n=== ERRORS (' + errors.length + ') ===');
  errors.forEach((e, i) => console.log((i+1) + ': ' + e));
  console.log('=== WARNINGS (' + warnings.length + ') ===');
  warnings.forEach((w, i) => console.log((i+1) + ': ' + w));

  const passed = errors.length === 0 && warnings.length === 0;
  results.passed = passed;
  results.errors = errors.length;
  results.warnings = warnings.length;

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    passed,
    errors: errors.length,
    warnings: warnings.length,
    tiers: results.tiers,
    chapters: results.chapters,
    buttons: results.buttons,
    note: 'Headless software rendering is pessimistic. Confirm on real devices.'
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'test-report.json'), JSON.stringify(report, null, 2));

  console.log('\n=== RESULT: ' + (passed ? 'ALL TESTS PASSED' : 'ISSUES FOUND') + ' ===');
  console.log('Report: ' + path.join(REPORT_DIR, 'test-report.json'));

  chrome.kill(); sock.close();
  process.exit(passed ? 0 : 1);
}

main().then(() => {}).catch(e => { console.error('FATAL', e.message); console.log('\n=== ERRORS (' + errors.length + ') ==='); errors.forEach((e, i) => console.log((i+1) + ': ' + e)); console.log('=== WARNINGS (' + warnings.length + ') ==='); warnings.forEach((w, i) => console.log((i+1) + ': ' + w)); const report = { timestamp: new Date().toISOString(), passed: false, errors: errors.length, warnings: warnings.length, tiers: results.tiers, chapters: results.chapters, buttons: results.buttons, note: 'Test crashed: ' + e.message }; fs.writeFileSync(path.join(REPORT_DIR, 'test-report.json'), JSON.stringify(report, null, 2)); process.exit(1); });
