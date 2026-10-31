(function () {
'use strict';
const D = window.DATA;
const $ = (s, el = document) => el.querySelector(s);
const MAIN = $('#main');
const KEY = 'chemexam.v1';
const GAP = 3 * 3600 * 1000, GOAL = 3, NEED_SESS = 3;
const UNIT = Object.fromEntries(D.units.map(u => [u.id, u]));
const ITEM = Object.fromEntries(D.items.map(i => [i.id, i]));
const TAGS = {}, BYTAG = {};
D.items.forEach(i => { (TAGS[i.unit] = TAGS[i.unit] || []); if (!TAGS[i.unit].includes(i.tag)) TAGS[i.unit].push(i.tag); (BYTAG[i.unit + '|' + i.tag] = BYTAG[i.unit + '|' + i.tag] || []).push(i); });
const LOCK_TOTAL = D.units.reduce((s, u) => s + u.weight, 0);
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- storage ----------
function blank() { return { v: 1, sid: 0, last: 0, sessions: [], att: {}, tag: {}, drills: {}, worked: {}, contrast: {}, errors: [], pretest: {}, primers: {}, theme: null }; }
let st = blank();
try { const raw = localStorage.getItem(KEY); if (raw) st = Object.assign(blank(), JSON.parse(raw)); } catch (e) { }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
const now = () => Date.now();
function touchSession() { const t = now(); if (!st.sid || t - st.last > GAP) { st.sid = t; st.sessions.push(t); } st.last = t; }
// ---------- mastery ----------
function T(u, t) { const k = u + '|' + t; return st.tag[k] || (st.tag[k] = { hist: [], sess: {} }); }
function peekT(u, t) { return st.tag[u + '|' + t] || { hist: [], sess: {} }; }
function sessCount(u, t) { const x = peekT(u, t); return (x.sess && x.sess[st.sid]) || 0; }
function passedSessions(u, t) {
  const x = peekT(u, t); const ok = Object.keys(x.sess || {}).filter(s => x.sess[s] >= GOAL).map(Number).sort((a, b) => a - b);
  let n = 0, lastT = -Infinity; ok.forEach(s => { if (s - lastT >= GAP) { n++; lastT = s; } }); return n;
}
function tagAcc(u, t) { const h = peekT(u, t).hist; return h.length ? h.reduce((a, b) => a + b, 0) / Math.max(5, h.length) : 0; }
function tagMastery(u, t) { return tagAcc(u, t) * (0.55 + 0.15 * Math.min(passedSessions(u, t), NEED_SESS)); }
function tagState(u, t) {
  const h = peekT(u, t).hist; if (!h.length) return ['new', ''];
  const p = passedSessions(u, t), a = tagAcc(u, t);
  if (p >= NEED_SESS && a >= 0.8) return ['locked', 'ok']; if (a >= 0.8) return ['solid', 'acc']; if (a >= 0.5) return ['familiar', 'warn']; return ['learning', 'bad'];
}
function unitMastery(u) { const tg = TAGS[u] || []; return tg.length ? tg.reduce((s, t) => s + tagMastery(u, t), 0) / tg.length : 0; }
function projected() { return D.units.reduce((s, u) => s + u.weight * unitMastery(u.id), 0); }
function openTags(u) { return (TAGS[u] || []).filter(t => sessCount(u, t) < GOAL); }
function record(item, ok, cold) {
  touchSession();
  (st.att[item.id] = st.att[item.id] || []).push([now(), ok ? 1 : 0]); if (st.att[item.id].length > 12) st.att[item.id].shift();
  const t = T(item.unit, item.tag); t.hist.push(ok ? 1 : 0); if (t.hist.length > 8) t.hist.shift();
  if (ok && !cold) t.sess[st.sid] = (t.sess[st.sid] || 0) + 1;
  if (!ok) { st.errors.push({ ts: now(), kind: 'item', id: item.id, unit: item.unit, tag: item.tag }); if (st.errors.length > 400) st.errors.shift(); }
  save();
}
const lastOk = id => { const a = st.att[id]; return a && a.length ? a[a.length - 1][1] : null; };
const lastSeen = id => { const a = st.att[id]; return a && a.length ? a[a.length - 1][0] : 0; };
// ---------- helpers ----------
const IMG = r => (typeof r === 'string' && r[0] === '@') ? (D.imgs[r.slice(1)] || '') : (r || '');
const isImg = r => typeof r === 'string' && (r[0] === '@' || r.trim().startsWith('<svg'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => Math.round(x * 100) + '%';
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1800); }
function countdown() { const ms = new Date(D.exam.start).getTime() - now(); if (ms <= 0) return 'exam time'; const h = Math.floor(ms / 3600000), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : `${h}h ${Math.floor(ms / 60000) % 60}m`; }
function fmtDur(ms) { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
const ease = t => 1 - Math.pow(1 - t, 3);
function tween(from, to, ms, fn, done) {
  if (reduce || ms <= 0) { fn(to); done && done(); return; }
  const t0 = performance.now();
  (function f(t) { const k = Math.min(1, (t - t0) / ms); fn(from + (to - from) * ease(k)); if (k < 1) requestAnimationFrame(f); else done && done(); })(t0);
}
function fly(text, el) {
  if (!el || reduce) return; const r = el.getBoundingClientRect(); const d = document.createElement('div');
  d.className = 'fly'; d.textContent = text; d.style.left = (r.left + r.width / 2 - 14) + 'px'; d.style.top = (r.top + 4) + 'px';
  document.body.appendChild(d); setTimeout(() => d.remove(), 1000);
}
function applyTheme() { if (st.theme) document.documentElement.setAttribute('data-theme', st.theme); else document.documentElement.removeAttribute('data-theme'); }
applyTheme();

// ---------- top bar ----------
let shownPts = projected();
function renderBar(view) {
  const roundPct = F && F.round ? Math.min(1, F.round.qn / F.round.cap) : 0;
  $('#bar').innerHTML = `<div class="in"><a class="bt" href="#study">CHEM 210 <span>· Exam 2</span></a>
    <div class="grow"><div class="prog" title="Round progress"><i id="rprog" style="width:${pct(roundPct)}"></i></div></div>
    <div class="meta"><span class="pill acc num-anim" id="pts" title="Projected lock points">${shownPts.toFixed(1)} / ${LOCK_TOTAL.toFixed(0)}</span><span class="pill num-anim" id="streak" title="Streak">streak ${F ? F.streak : 0}</span><span class="pill" title="Exam countdown">${countdown()}</span></div>
    <nav class="menu"><a href="#study" class="${view === 'study' ? 'on' : ''}">Study</a><a href="#overview" class="${view === 'overview' ? 'on' : ''}">Map</a><a href="#strategy" class="${view === 'strategy' ? 'on' : ''}">Exam</a><a href="#progress" class="${view === 'progress' ? 'on' : ''}">⚙</a></nav></div>`;
}
function updateBar(gainEl) {
  const p = projected(); const el = $('#pts');
  if (el) { const from = shownPts; tween(from, p, 700, v => { el.textContent = v.toFixed(1) + ' / ' + LOCK_TOTAL.toFixed(0); }); if (p - from > 0.05) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); fly('+' + (p - from).toFixed(1), el); } }
  shownPts = p;
  const s = $('#streak'); if (s) { s.textContent = 'streak ' + F.streak; if (F.streak > 0) { s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); } }
  const r = $('#rprog'); if (r && F.round) r.style.width = pct(Math.min(1, F.round.qn / F.round.cap));
}

// ---------- FLOW ----------
let F = null;
function newFlow(focus) { F = { focus: focus || null, round: null, primed: {}, introduced: {}, intro: null, cold: {}, requeue: [], lastTag: null, lastUnit: null, recent: [], done: 0, right: 0, streak: 0, best: 0, specials: 0, forceUnit: null, t0: now(), rounds: 0 }; }
function newRound() {
  const pool0 = (F.focus ? [UNIT[F.focus]] : D.units).map(u => ({ id: u.id, open: u.weight * (1 - unitMastery(u.id)), live: openTags(u.id).length }));
  let pool = pool0.filter(c => c.live > 0); if (!pool.length) pool = pool0;
  pool.sort((a, b) => b.open - a.open);
  const units = pool.slice(0, F.focus ? 1 : 3).map(c => c.id);
  F.rounds++;
  F.round = { units, qn: 0, cap: F.focus ? 14 : 18, rot: 0, sinceSpecial: 0, startProj: projected(), startM: Object.fromEntries(units.map(u => [u, unitMastery(u)])), keep: pool.length === pool0.length && !pool0.some(c => c.live) };
}
function chooseItem(unit, tag) {
  const pool = BYTAG[unit + '|' + tag] || [];
  let c = pool.filter(i => !F.recent.includes(i.id)); if (!c.length) c = pool;
  const wrong = c.filter(i => lastOk(i.id) === 0), fresh = c.filter(i => lastOk(i.id) === null);
  const base = wrong.length && Math.random() < 0.6 ? wrong : (fresh.length && Math.random() < 0.7 ? fresh : c);
  const sorted = base.slice().sort((a, b) => lastSeen(a.id) - lastSeen(b.id));
  return sorted[Math.floor(Math.random() * Math.min(3, sorted.length))];
}
function pickSpecial(units) {
  const opts = [];
  const cs = D.contrast.filter(c => units.includes(c.unit)).sort((a, b) => (st.contrast[a.id] || []).length - (st.contrast[b.id] || []).length);
  if (cs.length) opts.push({ kind: 'contrast', c: cs[0] });
  const ws = D.worked.filter(w => units.includes(w.unit) && !(st.worked[w.id] && st.worked[w.id].retired)).sort((a, b) => ((st.worked[a.id] || {}).runs || 0) - ((st.worked[b.id] || {}).runs || 0));
  if (ws.length) opts.push({ kind: 'worked', w: ws[0] });
  if (units.includes('mech') || units.includes('outcome')) {
    const ds = D.drills.filter(d => units.includes(d.unit) || (units.includes('outcome') && d.id === 'd5')).sort((a, b) => (st.drills[a.id] || []).length - (st.drills[b.id] || []).length);
    if (ds.length) opts.push({ kind: 'drill', d: ds[0] });
  }
  if (!opts.length) return null;
  return opts[(F.specials++) % opts.length];
}
function pickTag(unit) {
  const ot = openTags(unit); const base = ot.length ? ot : TAGS[unit];
  let c = base.filter(t => t !== F.lastTag); if (!c.length) c = base;
  c = c.slice().sort((a, b) => (sessCount(unit, a) - sessCount(unit, b)) || (tagMastery(unit, a) - tagMastery(unit, b)));
  return c[Math.random() < 0.75 ? 0 : Math.floor(Math.random() * c.length)];
}
function qFor(unit, tag, cold) { const item = chooseItem(unit, tag || pickTag(unit)); return item ? { kind: 'q', item, cold: !!cold } : { kind: 'roundEnd' }; }
function serveIntro() {
  const step = F.intro.steps.shift(), unit = F.intro.unit;
  if (!F.intro.steps.length) F.intro = null;
  if (step === 'primer') { F.primed[unit] = true; return { kind: 'primer', unit }; }
  return qFor(unit, null, step === 'cold');
}
function pickNext() {
  const R = F.round;
  if (F.intro) return serveIntro();
  const live = R.units.filter(u => openTags(u).length);
  if (R.qn >= R.cap || (!live.length && !R.keep)) return { kind: 'roundEnd' };
  if (R.sinceSpecial >= 6) { R.sinceSpecial = 0; const sp = pickSpecial(R.units); if (sp) return sp; }
  const di = F.requeue.findIndex(r => r.due <= F.done);
  if (di >= 0) { const r = F.requeue.splice(di, 1)[0]; return qFor(r.unit, r.tag, false); }
  const order = live.length ? live : R.units;
  let unit = order[R.rot % order.length]; R.rot++;
  if (unit === F.lastUnit && order.length > 1) { unit = order[R.rot % order.length]; R.rot++; }
  if (!F.introduced[unit]) {
    F.introduced[unit] = true;
    const steps = [];
    if (!st.pretest[unit]) steps.push('cold', 'cold');
    if (PRIMERS[unit] && !F.primed[unit]) steps.push('primer');
    steps.push('q');
    F.intro = { unit, steps };
    return serveIntro();
  }
  return qFor(unit, null, false);
}
let CUR = null, keyHandler = null;
function setKeys(fn) { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = fn; if (fn) document.addEventListener('keydown', fn); }
function next() {
  touchSession(); save();
  if (!F.round) { newRound(); return show({ kind: 'roundStart' }); }
  show(pickNext());
}
function show(card) {
  CUR = card; setKeys(null);
  MAIN.innerHTML = `<div class="card enter" id="cardel"></div>`;
  const el = $('#cardel');
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  ({ q: cardQ, primer: cardPrimer, contrast: cardContrast, drill: cardDrill, worked: cardWorked, roundEnd: cardRoundEnd, roundStart: cardRoundStart }[card.kind])(el, card);
  updateBar();
}
function contBtn(label = 'Continue') { return `<div class="row" style="margin-top:14px"><button class="btn pri bigbtn" data-cont>${label} →</button><span class="kbd">Enter</span></div>`; }
function wireCont(el, beforeNext) {
  const go = () => { if (beforeNext) beforeNext(); next(); };
  el.querySelectorAll('[data-cont]').forEach(b => b.onclick = go);
  setKeys(e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; if (e.key === 'Enter') { e.preventDefault(); go(); } });
}
// ---------- round cards ----------
function cardRoundStart(el) {
  const R = F.round; const nx = st.sid + GAP - now();
  el.innerHTML = `<div class="kind">Round ${F.rounds}</div><div class="cardtitle">${R.units.map(u => esc(UNIT[u].name)).join(' · ')}</div>
    <p class="sub" style="margin:0">Picked by open exam points. Questions rotate between these ${R.units.length > 1 ? R.units.length + ' units' : 'units'}, with a visual or a drill mixed in. Each concept needs ${GOAL} correct answers this session.</p>
    <div class="roundchips">${R.units.map((u, k) => `<span class="pill acc" style="animation-delay:${k * 70}ms">${esc(UNIT[u].short)} · ${(UNIT[u].weight * (1 - unitMastery(u))).toFixed(1)} pts open</span>`).join('')}</div>
    ${R.keep ? `<div class="callout">Every concept already hit ${GOAL} correct this session. Extra reps still raise accuracy. The next spacing dot unlocks in ${fmtDur(Math.max(0, nx))}.</div>` : ''}
    ${new Date().getHours() >= 21 ? '<div class="callout warn"><b>Past 9 PM.</b> Your rule says stop. Tomorrow’s spaced session counts more.</div>' : ''}
    ${contBtn('Start')}`;
  wireCont(el);
}
function cardRoundEnd(el) {
  const R = F.round; const gain = projected() - R.startProj;
  el.innerHTML = `<div class="kind">Round ${F.rounds} done</div><div class="cardtitle">${gain >= 0 ? '+' : ''}${gain.toFixed(1)} projected points</div>
    <div>${R.units.map(u => `<div class="ubar"><span>${esc(UNIT[u].short)}</span><div class="meter"><i data-from="${R.startM[u]}" data-to="${unitMastery(u)}" style="width:${pct(R.startM[u])}"></i></div><span class="kbd" style="text-align:right">${pct(unitMastery(u))}</span></div>`).join('')}</div>
    <p class="sub">${F.right} right of ${F.done} this sitting · best streak ${F.best}</p>${contBtn('Next round')}`;
  requestAnimationFrame(() => el.querySelectorAll('.meter i').forEach(i => { i.style.width = pct(+i.dataset.to); }));
  F.round = null; wireCont(el);
}
// ---------- question card ----------
function cardQ(el, card) {
  const it = card.item; const u = UNIT[it.unit];
  F.recent.push(it.id); if (F.recent.length > 6) F.recent.shift(); F.lastTag = it.tag; F.lastUnit = it.unit;
  const order = it.type === 'mc' ? (it.ns ? it.choices.map((_, i) => i) : shuffle(it.choices.map((_, i) => i))) : null;
  let figs = '';
  if (it.img) figs += `<div class="figs"><div class="fig"><div class="paper">${IMG(it.img)}</div></div></div>`;
  if (it.imgs) figs += `<div class="figs">${it.imgs.map(([l, s]) => `<div class="fig"><div class="lab">${esc(l)}</div><div class="paper">${IMG(s)}</div></div>`).join('')}</div>`;
  let body = '';
  if (it.type === 'mc') {
    const imgc = !!it.choiceImgs;
    body = `<div class="choices ${imgc ? 'imgs' : ''}">` + order.map((ci, k) => `<button class="ch ${imgc ? 'imgc' : ''}" data-ci="${ci}"><span class="key">${k + 1}</span><span class="body">${imgc ? `<div class="paper">${IMG(it.choices[ci])}</div>` : it.choices[ci]}</span></button>`).join('') + '</div>';
  } else body = `<div class="numrow"><input type="text" inputmode="decimal" id="numin" placeholder="your answer" autocomplete="off"><button class="btn pri" id="numgo">Check</button></div>`;
  el.innerHTML = `<div class="qhead"><span class="pill acc">${esc(u.short)} · ${esc(D.tagnames[it.tag] || it.tag)}</span>${card.cold ? '<span class="pill warn">Cold try · guess if unsure</span>' : `<span class="kbd">${it.type === 'mc' ? '1–' + it.choices.length + ' to answer' : 'Enter to check'}</span>`}</div>
    <div class="q">${it.prompt}</div>${figs}${body}<div id="fb"></div>`;
  let answered = false;
  const answer = (ok, ci) => {
    if (answered) return; answered = true;
    record(it, ok, card.cold);
    F.done++; F.round.qn++; F.round.sinceSpecial++;
    card.answered = true;
    if (ok) { F.right++; F.streak++; F.best = Math.max(F.best, F.streak); } else { F.streak = 0; if (!card.cold) F.requeue.push({ unit: it.unit, tag: it.tag, due: F.done + 2 }); }
    if (card.cold) { F.cold[it.unit] = (F.cold[it.unit] || 0) + 1; if (F.cold[it.unit] >= 2) { st.pretest[it.unit] = { ts: now() }; save(); } }
    el.querySelectorAll('.ch').forEach(b => { b.disabled = true; const c = +b.dataset.ci; if (c === it.answer) b.classList.add('right'); else if (c === ci) b.classList.add('wrong'); });
    const inp = $('#numin', el); if (inp) inp.disabled = true;
    const corr = it.type === 'num' ? `<div style="margin-bottom:4px">Answer: <b>${it.rel ? (it.answer >= 100 ? Math.round(it.answer) : +it.answer.toPrecision(3)) : +(+it.answer).toFixed(3)}</b></div>` : '';
    const vis = it.eimg ? `<div class="paper" style="margin-top:10px">${IMG(it.eimg)}</div>${it.ecap ? `<div class="kbd" style="margin-top:6px">${esc(it.ecap)}</div>` : ''}` : '';
    $('#fb', el).innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><div class="t">${ok ? (card.cold ? 'Correct, even cold' : 'Correct') : 'Not this one'}</div>${corr}<div>${it.explain}</div>${vis}</div>${contBtn()}`;
    wireCont(el);
    updateBar();
  };
  el.querySelectorAll('.ch').forEach(b => b.onclick = () => { const ci = +b.dataset.ci; answer(ci === it.answer, ci); });
  const doNum = () => { const r = judgeNum(it, $('#numin', el).value); if (r === null) { toast('Enter a number'); return; } answer(r, null); };
  if (it.type === 'num') { $('#numgo', el).onclick = doNum; setTimeout(() => { const i = $('#numin', el); i && i.focus(); }, 50); }
  setKeys(e => {
    if (answered) return;
    if (e.target && e.target.id === 'numin') { if (e.key === 'Enter') { e.preventDefault(); doNum(); } return; }
    if (it.type === 'mc' && /^[1-9]$/.test(e.key)) { const k = +e.key - 1; if (k < order.length) answer(order[k] === it.answer, order[k]); }
  });
}
function judgeNum(it, raw) {
  let s = String(raw).trim().replace(/,/g, '').replace(/[×x]\s*10\^/i, 'e').replace(/\s+/g, '');
  if (/^10\^/.test(s)) s = String(Math.pow(10, parseFloat(s.slice(3))));
  const v = parseFloat(s); if (!isFinite(v)) return null;
  return it.rel ? Math.abs(v - it.answer) <= Math.abs(it.answer) * it.tol : Math.abs(v - it.answer) <= it.tol;
}
// ---------- primers (interactive visuals) ----------
const PRIMERS = { mech: primerMech, newman: primerNewman, chair: primerChair, label: primerRS, rel: primerRS, nmr: primerNMR };
function cardPrimer(el, card) {
  const u = UNIT[card.unit];
  el.innerHTML = `<div class="qhead"><span class="pill acc">Visual · ${esc(u.short)}</span><button class="btn sm" id="skipp">Skip</button></div><div id="pbody"></div><div id="pcont" style="display:none">${contBtn()}</div>`;
  const finish = () => { st.primers[card.unit] = (st.primers[card.unit] || 0) + 1; save(); const c = $('#pcont', el); c.style.display = ''; c.classList.add('enter'); wireCont(el); };
  $('#skipp', el).onclick = () => next();
  PRIMERS[card.unit]($('#pbody', el), finish);
}
// --- mechanism: reveal the template one panel at a time
function primerMech(el, done) {
  const steps = ['Step 0 · find the real acid', 'Step 1 · protonate the alkene (2 arrows)', 'Transition state of step 1', 'Step 2 · capture the cation (1 arrow)', 'Step 3 · give the H back (2 arrows)', 'Arrow and charge checks'];
  let k = 0;
  el.innerHTML = `<div class="cardtitle">2-methylpropene + H₂O, catalytic H₂SO₄</div><p class="sub" style="margin:0">Say each step out loud (or sketch it) before you reveal it. Six reveals, then you’re into questions.</p><div id="pan"></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="rev">Reveal: ${steps[0]}</button></div>`;
  const btn = $('#rev', el);
  const go = () => {
    if (k >= steps.length) return;
    const d = document.createElement('div'); d.className = 'panelimg';
    d.innerHTML = `<div class="kind" style="margin-bottom:4px">${esc(steps[k])}</div><div class="paper"><img src="${D.panels[k]}" alt="${esc(steps[k])}"></div>`;
    $('#pan', el).appendChild(d); k++;
    setTimeout(() => d.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }), 60);
    if (k < steps.length) btn.textContent = 'Reveal: ' + steps[k]; else { btn.remove(); done(); }
  };
  btn.onclick = go;
  setKeys(e => { if (e.key === 'Enter' && k < steps.length) { e.preventDefault(); go(); } });
}
// --- Newman: rotate the back carbon, watch the energy
function primerNewman(el, done) {
  const A = [2.3333, 0.7667, 0.1667, 1.7333];
  const E = phi => { const r = phi * Math.PI / 180; return A[0] + A[1] * Math.cos(r) + A[2] * Math.cos(2 * r) + A[3] * Math.cos(3 * r); };
  const sepd = a => { const d = Math.abs(((a % 360) + 360) % 360); return Math.min(d, 360 - d); };
  const NAME = { 0: 'eclipsed (CH₃/CH₃)', 60: 'gauche', 120: 'eclipsed (CH₃/H)', 180: 'anti' };
  let th = 60, shown = 60, solved = false;
  el.innerHTML = `<div class="cardtitle">Turn the back carbon</div><p class="sub" style="margin:0">Butane, looking down C2→C3. The dot is the front carbon (C2), the circle is the back carbon (C3). Drag on the drawing or use the buttons.</p>
    <div class="lab2"><div class="paper"><svg id="nm" viewBox="-150 -150 300 300" style="max-width:300px;touch-action:none;cursor:grab"></svg></div>
    <div class="paper" style="flex-direction:column;align-items:stretch"><svg id="en" viewBox="0 0 320 190"></svg></div></div>
    <div class="row"><button class="btn" data-r="-60">⟲ 60°</button><button class="btn" data-r="60">⟳ 60°</button><span class="pill" id="nst"></span></div>
    <div class="task">Task: make this the most stable conformer, then lock it in.</div><div class="row"><button class="btn pri" id="lock">Lock in</button></div><div id="pfb"></div>`;
  const svg = $('#nm', el), en = $('#en', el), nst = $('#nst', el);
  const P = (a, r) => [Math.sin(a * Math.PI / 180) * r, -Math.cos(a * Math.PI / 180) * r];
  function draw(t) {
    const r = ((t % 120) + 120) % 120, e = Math.min(r, 120 - r), off = 12 * Math.max(0, 1 - e / 60);
    let s = '';
    ['CH₃', 'H', 'H'].forEach((lab, k) => { const a = t + 120 * k + off; const [x1, y1] = P(a, 46), [x2, y2] = P(a, 98), [tx, ty] = P(a, 120);
      s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${k ? '#334' : '#1d4ed8'}" stroke-width="${k ? 3 : 4}" stroke-linecap="round"/><text x="${tx}" y="${ty + 6}" font-size="${k ? 17 : 18}" font-weight="${k ? 400 : 700}" fill="${k ? '#334' : '#1d4ed8'}" text-anchor="middle" font-family="Inter,Arial">${lab}</text>`; });
    s += `<circle r="46" fill="#fff" stroke="#111" stroke-width="3"/>`;
    [['CH₃', 0], ['H', 120], ['H', 240]].forEach(([lab, a], k) => { const [x2, y2] = P(a, 98), [tx, ty] = P(a, 120);
      s += `<line x1="0" y1="0" x2="${x2}" y2="${y2}" stroke="${k ? '#111' : '#c2410c'}" stroke-width="${k ? 3 : 4}" stroke-linecap="round"/><text x="${tx}" y="${ty + 6}" font-size="${k ? 17 : 18}" font-weight="${k ? 400 : 700}" fill="${k ? '#111' : '#c2410c'}" text-anchor="middle" font-family="Inter,Arial">${lab}</text>`; });
    s += '<circle r="4.5" fill="#111"/>';
    svg.innerHTML = s;
    // energy plot
    const X = p => 24 + p / 360 * 284, Y = v => 160 - v * 25;
    let path = ''; for (let p = 0; p <= 360; p += 4) path += (p ? ' L' : 'M') + X(p).toFixed(1) + ',' + Y(E(sepd(p))).toFixed(1);
    const cur = ((t % 360) + 360) % 360;
    en.innerHTML = `<line x1="24" y1="162" x2="308" y2="162" stroke="#999"/><text x="10" y="90" font-size="11" fill="#666" transform="rotate(-90 10 90)" text-anchor="middle" font-family="Inter,Arial">energy</text>
      ${[0, 60, 120, 180, 240, 300, 360].map(p => `<text x="${X(p)}" y="178" font-size="10" fill="#666" text-anchor="middle" font-family="Inter,Arial">${p}°</text>`).join('')}
      <path d="${path}" fill="none" stroke="#111" stroke-width="2.2"/><circle cx="${X(cur)}" cy="${Y(E(sepd(cur)))}" r="7" fill="#c2410c" stroke="#fff" stroke-width="2"/>
      <text x="166" y="14" font-size="11" fill="#666" text-anchor="middle" font-family="Inter,Arial">back CH₃ angle from front CH₃</text>`;
    const snap = Math.round(sepd(t) / 60) * 60; nst.textContent = NAME[snap] || ''; nst.className = 'pill ' + (snap === 180 ? 'ok' : snap === 60 ? 'warn' : 'bad');
  }
  function rotTo(t2) { const from = shown; th = t2; tween(from, t2, 420, v => { shown = v; draw(v); }); }
  el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => rotTo(th + +b.dataset.r));
  let drag = null;
  svg.addEventListener('pointerdown', e => { svg.setPointerCapture(e.pointerId); const r = svg.getBoundingClientRect(); drag = { cx: r.left + r.width / 2, cy: r.top + r.height / 2, a0: Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * 180 / Math.PI, t0: shown }; });
  svg.addEventListener('pointermove', e => { if (!drag) return; const a = Math.atan2(e.clientX - drag.cx, -(e.clientY - drag.cy)) * 180 / Math.PI; let d = a - drag.a0; if (d > 180) d -= 360; if (d < -180) d += 360; shown = drag.t0 + d; draw(shown); });
  const up = () => { if (!drag) return; drag = null; const t2 = Math.round(shown / 60) * 60; th = shown; rotTo(t2); };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  $('#lock', el).onclick = () => {
    const snap = Math.round(sepd(th) / 60) * 60; const fb = $('#pfb', el);
    if (snap === 180) { fb.innerHTML = `<div class="fb ok"><div class="t">Anti locked in</div>The two CH₃ groups are 180° apart and staggered: no gauche pair, nothing eclipsed. Every other spot on the curve is higher.</div>`; if (!solved) { solved = true; done(); } }
    else { const why = snap === 60 ? 'Gauche: the CH₃ groups are only 60° apart. Staggered, but one gauche pair costs energy.' : snap === 120 ? 'Eclipsed: the back CH₃ hides behind a front H. Eclipsing is worse than any staggered form.' : 'Totally eclipsed: CH₃ behind CH₃, the top of the curve.';
      fb.innerHTML = `<div class="fb bad"><div class="t">Not yet</div>${why}</div>`; const c = fb.firstChild; c.style.animation = 'shake .38s ease'; }
  };
  draw(th);
}
// --- Chair: flip the ring, watch the strain
const CT = [[37, 178], [93, 80], [230, 113], [340, 83], [283, 180], [173, 150]], CUP = [0, 1, 0, 1, 0, 1];
const AV = { 'CH₃': 1.7, 'iPr': 2.2, 'tBu': 4.9, 'OH': 0.9, 'Cl': 0.5, 'Br': 0.5 };
function ceq(i) { const cx = CT.reduce((s, p) => s + p[0], 0) / 6, cy = CT.reduce((s, p) => s + p[1], 0) / 6; const a = CT[(i + 1) % 6], b = CT[(i + 2) % 6]; let vx = b[0] - a[0], vy = b[1] - a[1]; const n = Math.hypot(vx, vy); vx /= n; vy /= n; if (vx * (CT[i][0] - cx) + vy * (CT[i][1] - cy) < 0) { vx = -vx; vy = -vy; } return [vx, vy]; }
const csub = (i, k) => k === 'ax' ? [0, CUP[i] ? -1 : 1] : ceq(i);
const cIsUp = (i, k) => (k === 'ax' && CUP[i] === 1) || (k === 'eq' && CUP[i] === 0);
function chairDraw(subs, nums) {
  let s = `<svg viewBox="-120 -25 590 290" style="max-width:520px"><path d="M${CT.map(p => p.join(',')).join(' L')} Z" fill="none" stroke="#111" stroke-width="3" stroke-linejoin="round"/>`;
  const cx = CT.reduce((a, p) => a + p[0], 0) / 6, cy = CT.reduce((a, p) => a + p[1], 0) / 6;
  CT.forEach(([x, y], i) => { const vx = cx - x, vy = cy - y, L = Math.hypot(vx, vy); s += `<text x="${(x + vx / L * 22).toFixed(1)}" y="${(y + vy / L * 22 + 5).toFixed(1)}" font-size="14" fill="#888" text-anchor="middle" font-family="Inter,Arial">${nums[i]}</text>`; });
  const full = {}; subs.forEach(([i, k, t]) => { full[i] = full[i] || {}; full[i][k] = t; });
  Object.keys(full).forEach(i => { i = +i; ['ax', 'eq'].forEach(k => { if (!full[i][k]) full[i][k] = 'H'; }); });
  Object.keys(full).forEach(i => { i = +i; ['ax', 'eq'].forEach(k => {
    const t = full[i][k]; const [dx, dy] = csub(i, k); const L = k === 'ax' ? (i === 2 || i === 5 ? 58 : 42) : 48; const [x0, y0] = CT[i]; const x1 = x0 + dx * L, y1 = y0 + dy * L;
    const big = t !== 'H'; const col = big ? (cIsUp(i, k) ? '#c2410c' : '#1d4ed8') : '#555';
    s += `<line x1="${x0}" y1="${y0}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${col}" stroke-width="${big ? 4 : 2.5}" stroke-linecap="round"/>`;
    let tx, ty, an; if (k === 'ax') { tx = x1; ty = dy < 0 ? y1 - 8 : y1 + 20; an = 'middle'; } else { tx = x1 + (dx > 0 ? 6 : -6); ty = y1 + 6; an = dx > 0 ? 'start' : 'end'; }
    s += `<text x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="${big ? 18 : 15}" font-weight="${big ? 700 : 400}" fill="${col}" stroke="#fff" stroke-width="5" paint-order="stroke" text-anchor="${an}" font-family="Inter,Arial">${t}${big ? (k === 'ax' ? ' (ax)' : ' (eq)') : ''}</text>`;
  }); });
  return s + '</svg>';
}
function makeChair(g1, g2, off, cis, i, k1) {
  if (!g2) return [[i, k1, g1]];
  const j = (i + off) % 6; const want = cis ? cIsUp(i, k1) : !cIsUp(i, k1); const k2 = (CUP[j] === 1) === want ? 'ax' : 'eq';
  return [[i, k1, g1], [j, k2, g2]];
}
const flipSubs = s => s.map(([i, k, t]) => [(i + 1) % 6, k === 'ax' ? 'eq' : 'ax', t]);
const strainOf = s => Math.round(s.filter(x => x[1] === 'ax').reduce((a, x) => a + AV[x[2]], 0) * 10) / 10;
function primerChair(el, done) {
  const presets = [['cis-1-tert-butyl-4-methylcyclohexane', 'tBu', 'CH₃', 3, true], ['trans-1,2-dimethylcyclohexane', 'CH₃', 'CH₃', 1, false], ['cis-2-methylcyclohexan-1-ol', 'OH', 'CH₃', 1, true], ['trans-1-chloro-3-isopropylcyclohexane', 'iPr', 'Cl', 2, false]];
  const p = presets[Math.floor(Math.random() * presets.length)];
  let s1 = makeChair(p[1], p[2], p[3], p[4], 1, 'eq'); let s2 = flipSubs(s1);
  if (strainOf(s1) < strainOf(s2)) { const t = s1; s1 = s2; s2 = t; }
  let cur = s1, other = s2, nums = [6, 1, 2, 3, 4, 5], flips = 0, solved = false;
  const maxS = Math.max(strainOf(s1), strainOf(s2), 0.5);
  el.innerHTML = `<div class="cardtitle">Flip the ring</div><p class="sub" style="margin:0">${esc(p[0])}. Orange = pointing up, blue = pointing down. Numbers follow each carbon through the flip.</p>
    <div class="paper swap" id="ch" style="margin-top:12px"></div>
    <div class="grid g2" style="margin-top:10px"><div class="card"><div class="kbd">Axial strain in this chair</div><div style="font-size:22px;font-weight:700" id="sv"></div><div class="meter"><i id="sm"></i></div><div class="kbd" id="sl" style="margin-top:6px"></div></div>
    <div class="card"><div class="kbd">Other chair · ΔG° · K_EQ</div><div id="cmp" class="kbd" style="font-size:14px;color:var(--fg);margin-top:4px">Flip once to compare.</div></div></div>
    <div class="row" style="margin-top:10px"><button class="btn" id="flip">Ring flip ↻</button><span class="pill" id="ct"></span></div>
    <div class="task">Task: flip until this is the more stable chair, then lock it in. A-values: CH₃ 1.7, iPr 2.2, tBu 4.9, OH 0.9, Cl/Br 0.5.</div>
    <div class="row"><button class="btn pri" id="lock">Lock in</button></div><div id="pfb"></div>`;
  const rel = (() => { const [a, b] = cur; if (!b) return ''; const ua = cIsUp(a[0], a[1]), ub = cIsUp(b[0], b[1]); return `${a[2]} ${ua ? 'up' : 'down'}, ${b[2]} ${ub ? 'up' : 'down'} → ${ua === ub ? 'cis' : 'trans'} (a flip never changes this)`; });
  function paint() {
    $('#ch', el).innerHTML = chairDraw(cur, nums);
    const sv = strainOf(cur); $('#sv', el).textContent = sv.toFixed(1) + ' kcal/mol';
    const m = $('#sm', el); m.style.width = pct(Math.min(1, sv / maxS)); m.style.background = sv <= strainOf(other) ? 'var(--ok)' : 'var(--warn)';
    const ax = cur.filter(x => x[1] === 'ax' && x[2] !== 'H'); $('#sl', el).textContent = ax.length ? 'axial: ' + ax.map(x => `${x[2]} ${AV[x[2]]}`).join(' + ') : 'nothing big axial';
    $('#ct', el).textContent = rel();
    if (flips) { const a = strainOf(cur), b = strainOf(other), dg = Math.abs(a - b), k = Math.pow(10, dg / 1.36); $('#cmp', el).innerHTML = `Other chair: <b>${b.toFixed(1)}</b> kcal/mol<br>ΔG° = |${a.toFixed(1)} − ${b.toFixed(1)}| = <b>${dg.toFixed(1)}</b><br>K_EQ = 10^(${dg.toFixed(1)}/1.36) ≈ <b>${k >= 100 ? Math.round(k) : k.toFixed(1)}</b> for the ${a === b ? 'two (equal)' : 'lower-strain chair'}`; }
  }
  $('#flip', el).onclick = () => { const c = $('#ch', el); c.classList.add('out'); setTimeout(() => { const t = cur; cur = other; other = t; nums = [nums[5], ...nums.slice(0, 5)]; flips++; paint(); c.classList.remove('out'); }, reduce ? 0 : 180); };
  $('#lock', el).onclick = () => {
    const a = strainOf(cur), b = strainOf(other), fb = $('#pfb', el);
    if (a <= b) { fb.innerHTML = `<div class="fb ok"><div class="t">${a === b ? 'Either chair works' : 'More stable chair'}</div>${a === b ? 'Both chairs carry the same axial strain.' : `Only ${a.toFixed(1)} kcal/mol axial vs ${b.toFixed(1)} in the other chair. The bigger group sits equatorial.`}</div>`; if (!solved) { solved = true; done(); } }
    else { fb.innerHTML = `<div class="fb bad"><div class="t">Not this one</div>This chair carries ${a.toFixed(1)} kcal/mol of axial strain. The flipped chair carries ${b.toFixed(1)}. Flip it.</div>`; fb.firstChild.style.animation = 'shake .38s ease'; }
  };
  paint();
}
// --- R/S: rotate a stereocenter in 3D
const RSP = [['butan-2-ol', ['OH', 'CH₂CH₃', 'CH₃', 'H']], ['2-chlorobutane', ['Cl', 'CH₂CH₃', 'CH₃', 'H']], ['alanine', ['NH₂', 'COOH', 'CH₃', 'H']], ['3-methylpent-1-ene (C3)', ['CH=CH₂', 'CH₂CH₃', 'CH₃', 'H']], ['1-deuterioethanol', ['OH', 'CH₃', 'D', 'H']], ['(1-bromoethyl)benzene', ['Br', 'C₆H₅', 'CH₃', 'H']]];
function primerRS(el, done) {
  const TET = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(v => v.map(x => x / Math.sqrt(3)));
  const COL = ['#e5484d', '#f59e0b', '#3b82f6', '#9ca3af'];
  let preset, V, M, solved = false, answeredThis = false, trace = false;
  const mul = (A, B) => A.map((r, i) => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const rx = a => [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const ry = a => [[Math.cos(a), 0, Math.sin(a)], [0, 1, 0], [-Math.sin(a), 0, Math.cos(a)]];
  const app = (A, v) => [0, 1, 2].map(i => A[i][0] * v[0] + A[i][1] * v[1] + A[i][2] * v[2]);
  const axisAngle = (ax, a) => { const [x, y, z] = ax, c = Math.cos(a), s = Math.sin(a), t = 1 - c; return [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]]; };
  function fresh() {
    preset = RSP[Math.floor(Math.random() * RSP.length)]; const perm = shuffle([0, 1, 2, 3]); V = perm.map(k => TET[k].slice());
    M = mul(ry(Math.random() * 6.28), rx(Math.random() * 6.28)); answeredThis = false; trace = false;
    $('#rsname', el).textContent = preset[0]; $('#pfb', el).innerHTML = ''; draw();
  }
  const truth = () => { const [a, b, c] = V; const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]); return det < 0 ? 'R' : 'S'; };
  el.innerHTML = `<div class="cardtitle">Turn the stereocenter</div><p class="sub" style="margin:0"><b id="rsname"></b>. Drag to rotate. Wedge = toward you, hashed = away. Balls are numbered by priority.</p>
    <canvas class="cv3d" id="cv" style="margin-top:10px;background:#fff"></canvas>
    <div class="row" style="justify-content:center;margin-top:8px"><button class="btn" id="away">Point 4 away</button><button class="btn" id="mir">Mirror image</button><button class="btn" id="new">New molecule</button></div>
    <div class="task">Task: R or S? Rotate until 4 points away from you, then trace 1 → 2 → 3.</div>
    <div class="row"><button class="btn pri" data-a="R">R</button><button class="btn pri" data-a="S">S</button></div><div id="pfb"></div>`;
  const cv = $('#cv', el), ctx = cv.getContext('2d');
  function size() { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  function draw() {
    if (!V) return; const W = cv.clientWidth, H = cv.clientHeight, cx = W / 2, cy = H / 2 + 6, S = Math.min(W, H) * 0.34;
    ctx.clearRect(0, 0, W, H);
    const P = V.map((v, k) => { const p = app(M, v); return { k, p, x: cx + S * p[0], y: cy - S * p[1] }; });
    const back = P.filter(q => q.p[2] < 0).sort((a, b) => a.p[2] - b.p[2]), front = P.filter(q => q.p[2] >= 0).sort((a, b) => a.p[2] - b.p[2]);
    const bond = q => {
      const z = q.p[2]; const dx = q.x - cx, dy = q.y - cy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
      ctx.strokeStyle = '#111'; ctx.fillStyle = '#111';
      if (z > 0.3) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(q.x + nx * 9, q.y + ny * 9); ctx.lineTo(q.x - nx * 9, q.y - ny * 9); ctx.closePath(); ctx.fill(); }
      else if (z < -0.3) { ctx.lineWidth = 2; for (let t = 0.12; t <= 1; t += 0.11) { const w = 9 * t, px = cx + dx * t, py = cy + dy * t; ctx.beginPath(); ctx.moveTo(px + nx * w, py + ny * w); ctx.lineTo(px - nx * w, py - ny * w); ctx.stroke(); } }
      else { ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(q.x, q.y); ctx.stroke(); }
    };
    const ball = q => {
      const r = 19 * (1 + 0.14 * q.p[2]);
      ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.283); ctx.fillStyle = COL[q.k]; ctx.globalAlpha = q.p[2] < 0 ? 0.75 : 1; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 15px Inter,Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(q.k + 1), q.x, q.y + 1);
      const dx = q.x - cx, dy = q.y - cy, L = Math.hypot(dx, dy) || 1; const lx = q.x + dx / L * (r + 26), ly = q.y + dy / L * (r + 14);
      ctx.font = '600 15px Inter,Arial'; ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.strokeText(preset[1][q.k], lx, ly); ctx.fillStyle = '#111'; ctx.fillText(preset[1][q.k], lx, ly);
    };
    back.forEach(q => { bond(q); ball(q); });
    ctx.beginPath(); ctx.arc(cx, cy, 13, 0, 6.283); ctx.fillStyle = '#222'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '700 12px Inter,Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('C', cx, cy + 1);
    front.forEach(q => { bond(q); ball(q); });
    if (trace) {
      const pts = [0, 1, 2].map(k => P.find(q => q.k === k)); const ang = pts.map(q => Math.atan2(q.y - cy, q.x - cx));
      const cw = truth() === 'R'; const r = S * 0.58;
      const norm = a => ((a % 6.2832) + 6.2832) % 6.2832;
      const sweep = (a, b) => cw ? norm(b - a) : -norm(a - b);
      const total = sweep(ang[0], ang[1]) + sweep(ang[1], ang[2]);
      ctx.strokeStyle = 'rgba(124,58,237,.9)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx, cy, r, ang[0], ang[0] + total, !cw); ctx.stroke();
      const ae = ang[0] + total, ex = cx + r * Math.cos(ae), ey = cy + r * Math.sin(ae), tdir = ae + (cw ? Math.PI / 2 : -Math.PI / 2);
      ctx.fillStyle = 'rgba(124,58,237,.95)'; ctx.beginPath(); ctx.moveTo(ex + 13 * Math.cos(tdir), ey + 13 * Math.sin(tdir));
      ctx.lineTo(ex + 8 * Math.cos(tdir + 2.3), ey + 8 * Math.sin(tdir + 2.3)); ctx.lineTo(ex + 8 * Math.cos(tdir - 2.3), ey + 8 * Math.sin(tdir - 2.3)); ctx.closePath(); ctx.fill();
      ctx.font = '700 14px Inter,Arial'; ctx.fillStyle = '#7c3aed'; ctx.textAlign = 'center'; ctx.fillText(cw ? 'clockwise → R' : 'counterclockwise → S', cx, H - 14);
    }
  }
  function pointAway(cb) {
    const p4 = app(M, V[3]); const target = [0, 0, -1];
    let ax = [p4[1] * target[2] - p4[2] * target[1], p4[2] * target[0] - p4[0] * target[2], p4[0] * target[1] - p4[1] * target[0]];
    const n = Math.hypot(...ax); const ang = Math.acos(Math.max(-1, Math.min(1, p4[0] * target[0] + p4[1] * target[1] + p4[2] * target[2])));
    if (n < 1e-6) { if (ang < 0.01) { cb && cb(); return; } ax = [1, 0, 0]; } else ax = ax.map(x => x / n);
    const M0 = M.map(r => r.slice());
    tween(0, ang, 600, a => { M = mul(axisAngle(ax, a), M0); draw(); }, cb);
  }
  let drag = null;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); drag = [e.clientX, e.clientY]; cv.style.cursor = 'grabbing'; });
  cv.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag[0], dy = e.clientY - drag[1]; drag = [e.clientX, e.clientY]; M = mul(rx(dy * 0.012), mul(ry(dx * 0.012), M)); trace = false; draw(); });
  const end = () => { drag = null; cv.style.cursor = 'grab'; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  $('#away', el).onclick = () => pointAway(() => { trace = true; draw(); });
  $('#mir', el).onclick = () => { V = V.map(v => [-v[0], v[1], v[2]]); trace = false; answeredThis = false; $('#pfb', el).innerHTML = '<div class="kbd" style="margin-top:8px">Mirrored: this is the enantiomer, so the answer flips.</div>'; draw(); };
  $('#new', el).onclick = fresh;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
    const t = truth(), ok = b.dataset.a === t, fb = $('#pfb', el);
    pointAway(() => { trace = true; draw();
      fb.innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><div class="t">${ok ? 'Correct: ' + t : 'It’s ' + t}</div>With 4 (gray) pointing away, 1 → 2 → 3 runs <b>${t === 'R' ? 'clockwise' : 'counterclockwise'}</b>, so it is ${t}. ${preset[1][3] === 'H' && preset[1][2] === 'D' ? 'D outranks H (higher mass, same atomic number).' : ''} Try “Mirror image” or “New molecule” for another rep.</div>`;
      if (!ok) fb.firstChild.style.animation = 'shake .38s ease';
      if (ok && !solved) { solved = true; done(); }
    });
  });
  new ResizeObserver(size).observe(cv); fresh(); size();
}
// --- NMR: tap atoms to see which ones are the same kind
function primerNMR(el, done) {
  const m = D.nmrtap[Math.floor(Math.random() * D.nmrtap.length)];
  const PAL = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];
  const seen = new Set(); let solved = false;
  el.innerHTML = `<div class="cardtitle">Tap to find the kinds of H</div><p class="sub" style="margin:0">${esc(m.name)}. Tap any carbon or O that carries H. Every atom of the same kind lights up together, which is the fold test done for you.</p>
    <div class="paper" style="margin-top:12px"><div class="tapwrap"><div>${m.svg}</div><svg class="ov" viewBox="0 0 ${m.w} ${m.h}">${m.atoms.map((a, i) => `<circle data-i="${i}" cx="${a.x}" cy="${a.y}" r="14" fill="#000" fill-opacity="0"/>`).join('')}</svg></div></div>
    <div id="legend" class="row" style="margin-top:8px"></div>
    <div class="task">Task: how many ¹H-NMR signals?</div><div class="row">${[1, 2, 3, 4, 5, 6].map(n => `<button class="btn" data-n="${n}">${n}</button>`).join('')}</div><div id="pfb"></div>`;
  const circles = [...el.querySelectorAll('.ov circle')];
  const tap = i => {
    const c = m.atoms[i].c; circles.forEach(x => { x.setAttribute('fill-opacity', '0'); x.setAttribute('r', '14'); });
    if (c < 0) { circles[i].setAttribute('fill', '#999'); circles[i].setAttribute('fill-opacity', '.35'); return; }
    seen.add(c);
    m.atoms.forEach((a, j) => { if (a.c === c) { circles[j].setAttribute('fill', PAL[c % 6]); circles[j].setAttribute('fill-opacity', '.45'); circles[j].setAttribute('r', '17'); } });
    $('#legend', el).innerHTML = [...seen].sort().map(k => `<span class="pill" style="background:${PAL[k % 6]}22;color:${PAL[k % 6]}">kind ${'abcdef'[k]} · ${m.counts[k]}H</span>`).join('');
  };
  circles.forEach(cc => cc.onclick = () => tap(+cc.dataset.i));
  el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => {
    const ok = +b.dataset.n === m.n, fb = $('#pfb', el);
    fb.innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><div class="t">${ok ? 'Correct' : 'It’s ' + m.n}</div>${m.n} kinds of H → ${m.n} signals, ratio ${m.ratio} (counts ${m.counts.join(', ')} reduced, smallest to largest). OH and NH count as their own signals.</div>`;
    if (!ok) fb.firstChild.style.animation = 'shake .38s ease'; else if (!solved) { solved = true; done(); }
    m.atoms.forEach((a, j) => { if (a.c >= 0) { circles[j].setAttribute('fill', PAL[a.c % 6]); circles[j].setAttribute('fill-opacity', '.4'); } });
  });
}
// ---------- contrast / drill / worked inside the flow ----------
function cardContrast(el, card) {
  const c = card.c; const sel = { a: null, b: null };
  const side = (k, o) => `<div class="card"><span class="pill">${esc(o.label)}</span><div style="font-weight:600;margin-top:6px">${esc(o.text)}</div>${o.img ? `<div class="paper" style="margin-top:8px">${IMG(o.img)}</div>` : ''}<div class="opts">${c.options.map((op, i) => `<button class="opt" data-side="${k}" data-i="${i}">${esc(op)}</button>`).join('')}</div></div>`;
  el.innerHTML = `<div class="qhead"><span class="pill acc">Contrast pair · ${esc(UNIT[c.unit].short)}</span><span class="kbd">one feature differs</span></div><div class="cardtitle">${esc(c.title)}</div><div class="q">${esc(c.q)}</div>
    <div class="contrast">${side('a', c.a)}${side('b', c.b)}</div><div class="row" style="margin-top:12px"><button class="btn pri" id="cchk" disabled>Check both</button></div><div id="cfb"></div>`;
  const chk = $('#cchk', el);
  el.querySelectorAll('.opt').forEach(b => b.onclick = () => { const k = b.dataset.side; sel[k] = +b.dataset.i; el.querySelectorAll(`.opt[data-side="${k}"]`).forEach(x => x.classList.toggle('sel', x === b)); chk.disabled = sel.a === null || sel.b === null; });
  chk.onclick = () => {
    const okA = sel.a === c.ansA, okB = sel.b === c.ansB;
    el.querySelectorAll('.opt').forEach(x => { x.disabled = true; const k = x.dataset.side, i = +x.dataset.i, ans = k === 'a' ? c.ansA : c.ansB; if (i === ans) x.classList.add('right'); else if (i === sel[k]) x.classList.add('wrong'); });
    (st.contrast[c.id] = st.contrast[c.id] || []).push({ ts: now(), okA, okB }); if (!(okA && okB)) st.errors.push({ ts: now(), kind: 'contrast', id: c.id, unit: c.unit, tag: c.title }); save();
    $('#cfb', el).innerHTML = `<div class="fb ${okA && okB ? 'ok' : 'bad'}"><div class="t">${okA && okB ? 'Both right' : 'Look at the one difference'}</div><div><b>The feature:</b> ${esc(c.diff)}</div><div style="margin-top:6px">${esc(c.explain)}</div></div>${contBtn()}`;
    chk.remove(); wireCont(el);
  };
}
function padHTML() { return `<div class="pad-tools"><button class="btn sm" data-pad="pen">Pen</button><button class="btn sm" data-pad="erase">Eraser</button><button class="btn sm" data-pad="undo">Undo</button><button class="btn sm" data-pad="clear">Clear</button></div><div class="pad-wrap"><canvas id="pad"></canvas></div>`; }
function initPad(root) {
  const cv = $('#pad', root); if (!cv) return; const ctx = cv.getContext('2d'); let strokes = [], cur = null, mode = 'pen';
  function size() { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  function draw() { ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(s => { ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.m === 'erase' ? '#fff' : '#111'; ctx.lineWidth = s.m === 'erase' ? 22 : 2.4; s.p.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }); }
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); cur = { m: mode, p: [pos(e)] }; strokes.push(cur); });
  cv.addEventListener('pointermove', e => { if (!cur) return; (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).forEach(ev => cur.p.push(pos(ev))); draw(); });
  const end = () => { cur = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  root.querySelectorAll('[data-pad]').forEach(b => b.onclick = () => { const a = b.dataset.pad; if (a === 'pen' || a === 'erase') mode = a; else if (a === 'undo') { strokes.pop(); draw(); } else { strokes = []; draw(); } root.querySelectorAll('[data-pad=pen],[data-pad=erase]').forEach(x => x.classList.toggle('pri', x.dataset.pad === mode)); });
  $('[data-pad=pen]', root).classList.add('pri'); new ResizeObserver(size).observe(cv); size();
}
const rxRow = row => (!row || !row.length) ? '' : `<div class="rxrow">${row.map(x => isImg(x) ? IMG(x) : `<span class="op">${esc(x)}</span>`).join('')}</div>`;
function cardDrill(el, card) {
  const d = card.d; const t0 = now();
  el.innerHTML = `<div class="qhead"><span class="pill acc">Blank-page drill · ${esc(UNIT[d.unit].short)}</span><span class="pill" id="clock">0:00</span></div><div class="cardtitle">${esc(d.title)}</div>
    <div class="q">${d.prompt}</div>${d.img ? `<div class="figs"><div class="fig"><div class="paper">${IMG(d.img)}</div></div></div>` : ''}<p class="kbd">Draw every step on paper or the pad. Reveal only when it’s all down.</p>${padHTML()}
    <div class="row" style="margin-top:12px"><button class="btn pri" id="rev">Reveal the solution</button></div><div id="sol"></div>`;
  initPad(el);
  const tick = setInterval(() => { const c = $('#clock', el); if (!c) { clearInterval(tick); return; } const s = Math.floor((now() - t0) / 1000); c.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
  $('#rev', el).onclick = () => {
    $('#rev', el).remove();
    $('#sol', el).innerHTML = `<div class="enter">${d.template ? `<div class="paper" style="margin:12px 0"><img src="${D.template}" alt="Worked arrow template"></div>` : ''}${d.solution.map(s => `<div class="step"><div class="n">${esc(s.title)}</div><div>${s.text}</div>${rxRow(s.row)}</div>`).join('')}
      <div class="kind" style="margin-top:14px">Grade every box, no forgiveness</div><div class="card" style="margin-top:6px">${d.boxes.map((b, k) => `<label class="check"><input type="checkbox" data-box="${k}"><span>${esc(b)}</span></label>`).join('')}</div>
      <div class="kind" style="margin-top:14px">Tag what went wrong</div><div class="row" style="margin-top:6px">${d.tags.map((t, k) => `<button class="tagbtn" data-tag="${k}">${esc(t)}</button>`).join('')}</div>${contBtn('Save and continue')}</div>`;
    el.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => b.classList.toggle('on'));
    wireCont(el, () => {
      clearInterval(tick);
      const boxes = [...el.querySelectorAll('[data-box]')].map(x => x.checked), tags = [...el.querySelectorAll('[data-tag].on')].map(x => d.tags[+x.dataset.tag]);
      (st.drills[d.id] = st.drills[d.id] || []).push({ ts: now(), boxes, tags, secs: Math.round((now() - t0) / 1000) });
      tags.forEach(t => st.errors.push({ ts: now(), kind: 'drill', id: d.id, unit: d.unit, tag: t })); save();
    });
    setTimeout(() => $('#sol', el).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }), 60);
  };
}
function cardWorked(el, card) {
  const w = card.w; const s = st.worked[w.id] || (st.worked[w.id] = { level: 0, retired: false, runs: 0 });
  const n = w.steps.length, hide = Math.min(s.level, n), first = n - hide, res = {};
  el.innerHTML = `<div class="qhead"><span class="pill acc">Faded example · ${esc(UNIT[w.unit].short)}</span><span class="kbd">${hide ? hide + ' step' + (hide > 1 ? 's' : '') + ' hidden' : 'explain each step'}</span></div><div class="cardtitle">${esc(w.title)}</div>
    <div class="q">${esc(w.setup)}</div>${w.img ? `<div class="figs"><div class="fig"><div class="paper">${IMG(w.img)}</div></div></div>` : ''}
    ${w.steps.map((x, k) => k < first ? `<div class="step"><div class="n">Step ${k + 1}</div><b>${esc(x.do)}</b><div class="hidden-why" id="why${k}">Explain why to yourself first.</div><button class="btn sm" data-why="${k}" style="margin-top:6px">Check my explanation</button></div>`
      : `<div class="step"><div class="n">Step ${k + 1} · your turn</div><b>${esc(x.do)}</b><div class="hidden-why" id="ans${k}">Work it out, then reveal.</div><div class="row" style="margin-top:6px"><button class="btn sm" data-rev="${k}">Reveal</button><button class="btn sm" data-got="${k}" disabled>Got it unaided</button><button class="btn sm" data-miss="${k}" disabled>Missed</button></div></div>`).join('')}
    <div id="wend">${hide ? '' : contBtn('Done, hide a step next time')}</div>`;
  const reveal = k => `<div class="enter">${w.steps[k].why}</div>${rxRow(w.steps[k].row)}`;
  el.querySelectorAll('[data-why]').forEach(b => b.onclick = () => { const k = +b.dataset.why, x = $('#why' + k, el); x.classList.remove('hidden-why'); x.innerHTML = reveal(k); b.remove(); });
  const checkEnd = () => {
    if (Object.keys(res).length < hide) return;
    const all = Object.values(res).every(Boolean);
    $('#wend', el).innerHTML = `<div class="fb ${all ? 'ok' : 'bad'}">${all ? (hide >= n ? 'Solved unaided. This example retires.' : 'Clean. One more step hides next time.') : 'Missed a step. It steps back one level.'}</div>${contBtn()}`;
    wireCont(el, () => { s.runs++; if (all && hide >= n) s.retired = true; else if (all) s.level = hide + 1; else { s.level = Math.max(1, hide - 1); st.errors.push({ ts: now(), kind: 'worked', id: w.id, unit: w.unit, tag: 'faded step missed' }); } save(); });
  };
  el.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => { const k = +b.dataset.rev, x = $('#ans' + k, el); x.classList.remove('hidden-why'); x.innerHTML = reveal(k); b.disabled = true; el.querySelector(`[data-got="${k}"]`).disabled = false; el.querySelector(`[data-miss="${k}"]`).disabled = false; });
  el.querySelectorAll('[data-got],[data-miss]').forEach(b => b.onclick = () => { const k = +(b.dataset.got ?? b.dataset.miss); res[k] = b.dataset.got !== undefined; el.querySelector(`[data-got="${k}"]`).classList.toggle('pri', res[k]); el.querySelector(`[data-miss="${k}"]`).classList.toggle('pri', !res[k]); checkEnd(); });
  if (!hide) wireCont(el, () => { s.runs++; s.level = 1; save(); });
}
// ---------- views ----------
function viewStudy(focus) {
  if (!F || (focus !== undefined && F.focus !== (focus || null))) newFlow(focus);
  if (CUR && F.round && CUR.kind !== 'roundEnd') { if (CUR.answered) next(); else show(CUR); return; }
  const attempts = Object.values(st.att).reduce((s, a) => s + a.length, 0);
  if (!attempts && !F.done) {
    MAIN.innerHTML = `<div class="hero enter"><div class="kind">CHEM 210 · Exam 2 · Tue Nov 3, 6:15 PM</div><h1>One button. Click through and solve.</h1>
      <p class="sub">The app picks the units with the most exam points you haven’t locked, rotates between them, and drops in visuals, contrast pairs, drills and faded examples on its own. You never pick a mode.</p>
      <div class="row"><button class="btn pri bigbtn" id="go">Start studying →</button><span class="kbd">${D.items.length} questions · 6 interactive visuals · Enter works everywhere</span></div></div>`;
    $('#go').onclick = () => next(); setKeys(e => { if (e.key === 'Enter') { e.preventDefault(); next(); } }); return;
  }
  next();
}
function viewOverview() {
  setKeys(null);
  const rows = D.units.map(u => { const m = unitMastery(u.id); return `<div class="card enter" style="margin-bottom:8px"><div class="qhead"><div><b>${esc(u.name)}</b><div class="kbd">${esc(u.what)}</div></div><div class="kbd" style="text-align:right"><b>${(u.weight * m).toFixed(1)}</b> / ${u.weight} pts<br>on ${esc(u.exams)} exams</div></div>
    <div class="meter"><i style="width:${pct(m)};background:var(--accent)"></i></div>
    <div class="row" style="margin-top:8px">${(TAGS[u.id] || []).map(t => { const [s, c] = tagState(u.id, t), p = passedSessions(u.id, t); return `<span class="pill ${c}">${esc(D.tagnames[t] || t)} ${[1, 2, 3].map(k => `<span class="dot ${p >= k ? 'ok' : ''}"></span>`).join('')}</span>`; }).join('')}</div>
    <div class="row" style="margin-top:8px"><a class="btn sm" href="#focus-${u.id}">Study only this</a></div></div>`; }).join('');
  MAIN.innerHTML = `<h1>Map</h1><p class="sub">Read-only view of where the points are. Dots fill when a concept hits ${GOAL} correct in a session, sessions at least 3 hours apart. Studying always happens on the Study screen.</p>${rows}
    <div class="card"><b>Full 3D models</b><div class="row" style="margin-top:8px"><a class="btn sm" href="https://luxologygg.github.io/UMich/chemexam/labs/bond-rotation.html" target="_blank" rel="noopener">Bond rotation lab</a><a class="btn sm" href="https://luxologygg.github.io/UMich/chemexam/labs/chair-newman.html" target="_blank" rel="noopener">Chair to Newman lab</a></div></div>`;
}
function viewStrategy() {
  setKeys(null);
  const units = D.units.slice().sort((a, b) => b.weight - a.weight);
  MAIN.innerHTML = `<h1>Exam plan</h1><p class="sub">Tue Nov 3 · 6:15–8:30 PM with 1.5× time (135 min) · ${esc(D.exam.room)} · room opens ${esc(D.exam.opens)}. Pen and MCard. The pKa table and periodic table are provided.</p>
  <div class="grid g3"><div class="card"><h3>Pass 1 · ≈70 min</h3>Lock boxes only, in exam order. Mark anything else and move on.</div><div class="card"><h3>Pass 2 · ≈30 min</h3>Run the checklists below on every lock box.</div><div class="card"><h3>Pass 3 · ≈35 min</h3>Limbo boxes. Best attempt, never blank.</div></div>
  <h2>Checklists for pass 2</h2><div class="grid g2">${units.map(u => `<div class="card"><h3>${esc(u.name)} · ${u.weight} pts</h3><ul class="tight">${u.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}</div>
  <h2>Mechanism template</h2><div class="paper"><img src="${D.template}" alt="Acid-catalyzed addition template"></div>`;
}
function viewProgress() {
  setKeys(null);
  const open = Object.keys(st.att).filter(id => ITEM[id] && lastOk(id) === 0).length;
  const byTag = {}; st.errors.forEach(e => { const k = (UNIT[e.unit] ? UNIT[e.unit].short : e.unit) + ' · ' + (D.tagnames[e.tag] || e.tag); byTag[k] = (byTag[k] || 0) + 1; });
  MAIN.innerHTML = `<h1>Progress</h1><p class="sub">${st.sessions.length} spaced session${st.sessions.length === 1 ? '' : 's'} · ${open} open misses (they come back automatically). Progress lives in this browser. Copy the export to move it to another device.</p>
  <div class="card"><h3>Where points leak</h3>${Object.keys(byTag).length ? `<ul class="tight">${Object.entries(byTag).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `<li>${esc(k)} · ${n}</li>`).join('')}</ul>` : '<p class="kbd">Nothing missed yet.</p>'}</div>
  <div class="card" style="margin-top:10px"><h3>Theme</h3><div class="row"><button class="btn sm" data-th="">System</button><button class="btn sm" data-th="light">Light</button><button class="btn sm" data-th="dark">Dark</button></div></div>
  <div class="card" style="margin-top:10px"><h3>Move progress</h3><textarea id="exp" readonly>${esc(JSON.stringify(st))}</textarea><div class="row" style="margin-top:8px"><button class="btn sm" id="copy">Copy export</button></div>
  <textarea id="imp" placeholder="Paste an export here" style="margin-top:10px"></textarea><div class="row" style="margin-top:8px"><button class="btn sm" id="doimp">Import (replaces this browser’s progress)</button><button class="btn sm" id="reset">Erase progress</button></div></div>`;
  MAIN.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { st.theme = b.dataset.th || null; save(); applyTheme(); toast('Theme set'); });
  $('#copy').onclick = () => { const t = $('#exp'); t.select(); const ok = () => toast('Copied'); try { navigator.clipboard.writeText(t.value).then(ok, () => { document.execCommand('copy'); ok(); }); } catch (e) { document.execCommand('copy'); ok(); } };
  $('#doimp').onclick = () => { try { const o = JSON.parse($('#imp').value); if (!o || o.v !== 1) throw 0; st = Object.assign(blank(), o); save(); applyTheme(); shownPts = projected(); toast('Imported'); route(); } catch (e) { toast('That is not a valid export'); } };
  $('#reset').onclick = () => { const b = $('#reset'); if (b.dataset.armed) { st = blank(); save(); applyTheme(); F = null; CUR = null; shownPts = 0; toast('Erased'); route(); } else { b.dataset.armed = 1; b.textContent = 'Tap again to erase everything'; } };
}
function route() {
  const raw = (location.hash || '#study').slice(1); const cut = raw.indexOf('-'); const v = cut > 0 ? raw.slice(0, cut) : raw; const arg = cut > 0 ? raw.slice(cut + 1) : null;
  const view = v === 'focus' ? 'study' : v;
  renderBar(view);
  if (v === 'focus' && UNIT[arg]) { CUR = null; newFlow(arg); viewStudy(arg); }
  else if (v === 'overview') viewOverview(); else if (v === 'strategy') viewStrategy(); else if (v === 'progress') viewProgress();
  else viewStudy();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
newFlow(null);
route();
setInterval(() => { const c = document.querySelector('.topbar .meta .pill:last-child'); if (c) c.textContent = countdown(); }, 60000);
})();
