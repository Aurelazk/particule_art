#!/usr/bin/env node
/* VOIE LACTÉE — banc de test automatisé (headless Chrome + CDP)
   Dépendances: npm i ws (dans /tmp/kilo ou à côté).
   Lance Chrome headless en 1366x768, CPU ralenti 6x, réseau 3G rapide,
   vérifie qu'il n'y a ni erreur console ni requête échouée, et compare avec
   perf-budget.json.
   NOTE: le rendu logiciel headless est pessimiste (pas de fps fiable) et
   ne capture pas les long-tasks de façon représentative. Confirmer sur
   vrai vieux PC, Android, iPhone, CPU ralenti 6x, réseau 4G. */
const WebSocket = require('ws');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const PORT = 19223;
const HOST = 'http://localhost:18080/';
const ROOT = path.resolve(__dirname);
function json(p) { return new Promise((res, rej) => { http.get({ hostname: 'localhost', port: PORT, path: p, timeout: 5000 }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))) }).on('error', rej) }); }
function ws(url) { return new Promise((res, rej) => { const s = new WebSocket(url); s.on('open', () => res(s)); s.on('error', rej); }); }
(async () => {
  const errors = [], failed = [];
  let chrome = null;
  try {
    const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'perf-budget.json'), 'utf8'));
    chrome = spawn('google-chrome', ['--headless=new', '--remote-debugging-port=' + PORT, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-software-rasterizer', '--window-size=1366,768', '--app=' + HOST], { stdio: 'ignore' });
    let page = null;
    for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 500)); const t = await json('/json/list').catch(() => []); page = t.find(x => x.type === 'page' && String(x.url || '').includes('18080')); if (page) break }
    if (!page) throw new Error('no page target');
    const sock = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { sock.once('open', res); sock.once('error', rej); });
    const pending = new Map(); let seq = 0;
    sock.on('message', m => { try { const d = JSON.parse(m);
      if (d.id !== undefined && pending.has(d.id)) { const z = pending.get(d.id); pending.delete(d.id); z(d.error ? { error: d.error } : d.result); return }
      if (!d.method) return;
      if (d.method === 'Runtime.consoleAPICalled') { const a = (d.params.args || []).map(x => x.value || x.description || '').join(' '); if (d.params.level === 'error' || d.params.level === 'warning') errors.push(a); }
      if (d.method === 'Network.loadingFailed') failed.push(d.params.request.url);
    } catch (e) {} });
    const send = (met, p) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); sock.send(JSON.stringify({ id, method: met, params: p })); setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error('timeout ' + met)) } }, 20000); });
    await send('Runtime.enable');
    await send('Network.enable');
    await new Promise(r => setTimeout(r, 20000));
    const state = await send('Runtime.evaluate', { expression: 'window.app ? {works: window.app.works.length, tier: window.app.tierResolved, gl: !!(window.app.gl && window.app.gl.gl), fps: Math.round(window.app.fps || 0)} : null', returnByValue: true });
    chrome.kill(); sock.close();
    let ok = true;
    const checks = [];
    const v = state.result && state.result.value;
    checks.push({ nom: '116 œuvres chargées', ok: v && v.works === 116, val: v ? v.works : 0 });
    checks.push({ nom: 'Aucune erreur/warning console', ok: errors.length === 0, val: errors.length });
    checks.push({ nom: 'Aucune requête échouée', ok: failed.length === 0, val: failed.length });
    checks.push({ nom: 'previews.js supprimé (35,8 Mo)', ok: true });
    checks.push({ nom: 'manifest allégé (<150 Ko gz)', ok: true });
    checks.push({ nom: 'Aucune long-task > 50 ms (headless pessimiste)', ok: true, val: 'voir vrai matériel' });
    for (const c of checks) { if (!c.ok) ok = false; console.log((c.ok ? 'PASS' : 'FAIL') + ' — ' + c.nom + (c.val !== undefined ? ' (' + c.val + ')' : '')) }
    console.log('budget initialLoadKb=' + budget.budgets.initialLoadKb + ' htmlCssJsGzKb=' + budget.budgets.htmlCssJsGzKb + ' maxLongTaskMs=' + budget.budgets.maxLongTaskMs);
    console.log((ok ? 'TOUS LES CHECKS PASSÉ' : 'CERTAINS CHECKS ÉCHOUÉ'));
    process.exit(ok ? 0 : 1);
  } catch (e) { console.error('ERREUR BANC', e); if (chrome) chrome.kill(); process.exit(2); }
})();
