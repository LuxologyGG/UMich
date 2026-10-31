(function () {
'use strict';
const D = window.DATA;
const $ = (s, el = document) => el.querySelector(s);
const MAIN = $('#main');
const KEY = 'chemexam.v1';
const GAP = 3 * 3600 * 1000;          // sessions must be 3 h apart to count as spaced
const GOAL = 3;                        // correct answers per concept per session
const NEED_SESS = 3;                   // spaced sessions to lock a concept
const UNIT = Object.fromEntries(D.units.map(u => [u.id, u]));
const ITEM = Object.fromEntries(D.items.map(i => [i.id, i]));
const TAGS = {};                       // unit -> [tags]
D.items.forEach(i => { (TAGS[i.unit] = TAGS[i.unit] || []); if (!TAGS[i.unit].includes(i.tag)) TAGS[i.unit].push(i.tag); });
const BYTAG = {};
D.items.forEach(i => { const k = i.unit + '|' + i.tag; (BYTAG[k] = BYTAG[k] || []).push(i); });
const LOCK_TOTAL = D.units.reduce((s, u) => s + u.weight, 0);

// ---------- storage ----------
function blank() { return { v: 1, sid: 0, last: 0, sessions: [], att: {}, tag: {}, drills: {}, worked: {}, contrast: {}, errors: [], pretest: {}, theme: null }; }
let st = blank();
try { const raw = localStorage.getItem(KEY); if (raw) st = Object.assign(blank(), JSON.parse(raw)); } catch (e) { }
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } }
function now() { return Date.now(); }
function touchSession() {
  const t = now();
  if (!st.sid || t - st.last > GAP) { st.sid = t; st.sessions.push(t); }
  st.last = t;
}
// ---------- mastery ----------
function T(unit, tag) { const k = unit + '|' + tag; return st.tag[k] || (st.tag[k] = { hist: [], sess: {} }); }
function peekT(unit, tag) { return st.tag[unit + '|' + tag] || { hist: [], sess: {} }; }
function sessCount(unit, tag, sid = st.sid) { const t = peekT(unit, tag); return (t.sess && t.sess[sid]) || 0; }
function passedSessions(unit, tag) {
  const t = peekT(unit, tag); const ok = Object.keys(t.sess || {}).filter(s => t.sess[s] >= GOAL).map(Number).sort((a, b) => a - b);
  let n = 0, lastT = -Infinity;
  ok.forEach(s => { if (s - lastT >= GAP) { n++; lastT = s; } });
  return n;
}
function tagAcc(unit, tag) { const h = peekT(unit, tag).hist; if (!h.length) return 0; return h.reduce((a, b) => a + b, 0) / Math.max(5, h.length); }
function tagMastery(unit, tag) { const p = Math.min(passedSessions(unit, tag), NEED_SESS); return tagAcc(unit, tag) * (0.55 + 0.15 * p); }
function tagState(unit, tag) {
  const h = peekT(unit, tag).hist; if (!h.length) return ['new', ''];
  const p = passedSessions(unit, tag), a = tagAcc(unit, tag);
  if (p >= NEED_SESS && a >= 0.8) return ['locked', 'ok'];
  if (a >= 0.8) return ['solid', 'acc'];
  if (a >= 0.5) return ['familiar', 'warn'];
  return ['learning', 'bad'];
}
function unitMastery(u) { const tg = TAGS[u] || []; if (!tg.length) return 0; return tg.reduce((s, t) => s + tagMastery(u, t), 0) / tg.length; }
function projected() { return D.units.reduce((s, u) => s + u.weight * unitMastery(u.id), 0); }
function record(item, ok, mode) {
  touchSession();
  (st.att[item.id] = st.att[item.id] || []).push([now(), ok ? 1 : 0]);
  if (st.att[item.id].length > 12) st.att[item.id].shift();
  const t = T(item.unit, item.tag);
  if (mode !== 'pretest') {
    t.hist.push(ok ? 1 : 0); if (t.hist.length > 8) t.hist.shift();
    if (ok) t.sess[st.sid] = (t.sess[st.sid] || 0) + 1;
  } else { t.hist.push(ok ? 1 : 0); if (t.hist.length > 8) t.hist.shift(); }
  if (!ok) { st.errors.push({ ts: now(), kind: 'item', id: item.id, unit: item.unit, tag: item.tag }); if (st.errors.length > 400) st.errors.shift(); }
  save();
}
function lastOk(id) { const a = st.att[id]; return a && a.length ? a[a.length - 1][1] : null; }
function lastSeen(id) { const a = st.att[id]; return a && a.length ? a[a.length - 1][0] : 0; }

// ---------- helpers ----------
const IMG = r => (typeof r === 'string' && r[0] === '@') ? (D.imgs[r.slice(1)] || '') : (r || '');
const isImg = r => typeof r === 'string' && (r[0] === '@' || r.trim().startsWith('<svg'));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => Math.round(x * 100) + '%';
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
function wpick(arr, wf) { const w = arr.map(wf); const s = w.reduce((a, b) => a + b, 0); let r = Math.random() * s; for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1]; }
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 1800); }
function examStart() { return new Date(D.exam.start).getTime(); }
function countdown() {
  const ms = examStart() - now(); if (ms <= 0) return 'exam time';
  const h = Math.floor(ms / 3600000), d = Math.floor(h / 24);
  return d ? `${d}d ${h % 24}h` : `${h}h ${Math.floor(ms / 60000) % 60}m`;
}
function sessionsSoFar() { return st.sessions.length; }
function nextSessionIn() { if (!st.last) return 0; const ms = st.sid + GAP - now(); return ms > 0 ? ms : 0; }
function fmtDur(ms) { const m = Math.ceil(ms / 60000); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }

// ---------- theme ----------
function applyTheme() { if (st.theme) document.documentElement.setAttribute('data-theme', st.theme); else document.documentElement.removeAttribute('data-theme'); }
applyTheme();

// ---------- nav ----------
const NAV = [['home', '◎', 'Dashboard'], ['learn', '◆', 'Learn'], ['mix', '⇄', 'Mixed practice'], ['drills', '✎', 'Blank-page drills'],
             ['worked', '≡', 'Faded examples'], ['contrast', '⇆', 'Contrast pairs'], ['strategy', '♜', 'Exam strategy'], ['errors', '!', 'Error log'], ['progress', '⚙', 'Progress & theme']];
function renderNav(cur) {
  const links = NAV.map(([id, ico, nm]) => `<a href="#${id}" class="${cur === id ? 'on' : ''}"><span class="ico">${ico}</span>${nm}</a>`).join('');
  const meta = `<div class="meta">Exam in <b>${countdown()}</b><br>Projected lock points <b>${projected().toFixed(0)}</b> / ${LOCK_TOTAL.toFixed(0)}<br>Spaced sessions <b>${sessionsSoFar()}</b></div>`;
  $('#side').innerHTML = `<div class="brand">CHEM 210 · Exam 2<small>Tue Nov 3 · 6:15 PM · ${D.exam.room}</small></div><nav class="nav">${links}</nav>${meta}`;
  $('#top').innerHTML = `<div class="brand">CHEM 210 · Exam 2 <span class="pill">${countdown()}</span> <span class="pill acc">${projected().toFixed(0)}/${LOCK_TOTAL.toFixed(0)} lock</span></div><nav class="nav">${links}</nav>`;
}

// ---------- router ----------
let cleanup = null;
function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const raw = (location.hash || '#home').slice(1); const cut = raw.indexOf('-'); const h = cut > 0 ? [raw.slice(0, cut), raw.slice(cut + 1)] : [raw];
  const v = h[0] || 'home';
  renderNav(v === 'unit' || v === 'pretest' || v === 'retry' ? 'learn' : (v === 'drill' ? 'drills' : (v === 'w' ? 'worked' : v)));
  window.scrollTo(0, 0);
  ({ home: viewHome, learn: viewLearnPick, unit: () => viewLearn(h[1]), mix: viewMix, pretest: () => viewPretest(h[1]), retry: viewRetry,
     drills: viewDrills, drill: () => viewDrill(h[1]), worked: viewWorkedList, w: () => viewWorked(h[1]), contrast: viewContrast,
     strategy: viewStrategy, errors: viewErrors, progress: viewSettings }[v] || viewHome)();
}
window.addEventListener('hashchange', route);

// ---------- dashboard ----------
function unitCard(u, href) {
  const m = unitMastery(u.id); const tg = TAGS[u.id] || [];
  const tags = tg.map(t => { const [s, c] = tagState(u.id, t); const p = passedSessions(u.id, t); return `<span class="pill ${c}" title="${esc(D.tagnames[t] || t)}">${esc(D.tagnames[t] || t)} ${'<span class="dot ' + (p >= 1 ? 'ok' : '') + '"></span><span class="dot ' + (p >= 2 ? 'ok' : '') + '"></span><span class="dot ' + (p >= 3 ? 'ok' : '') + '"></span>'}</span>`; }).join('');
  return `<a class="unit" href="${href || '#unit-' + u.id}"><div><div class="nm">${esc(u.name)}</div><div class="kbd">${esc(u.what)}</div></div>
    <div class="pts"><b>${(u.weight * m).toFixed(1)}</b> / ${u.weight} pts<br>on ${esc(u.exams)} exams</div>
    <div class="bar ${m >= .85 ? 'ok' : ''}"><i style="width:${pct(m)}"></i></div><div class="tags">${tags}</div></a>`;
}
function recommend() {
  return D.units.slice().sort((a, b) => b.weight * (1 - unitMastery(b.id)) - a.weight * (1 - unitMastery(a.id)))[0];
}
function viewHome() {
  const proj = projected(); const rec = recommend(); const nx = nextSessionIn();
  const late = new Date().getHours() >= 21;
  const attempts = Object.values(st.att).reduce((s, a) => s + a.length, 0);
  MAIN.innerHTML = `
  <h1>Lock the repeatable points</h1>
  <p class="sub">Every unit below is a format that showed up on past Exam 2s. Mastery = recent accuracy × spacing credit. A concept locks after ${GOAL} correct answers in each of ${NEED_SESS} sessions at least 3 hours apart.</p>
  ${late ? '<div class="callout warn"><b>Past 9 PM.</b> Your own rule: stop here. Tomorrow’s spaced session is worth more than tonight’s extra hour.</div>' : ''}
  <div class="grid g4">
    <div class="card stat"><div class="k">Projected lock points</div><div class="v">${proj.toFixed(0)} <small>/ ${LOCK_TOTAL.toFixed(0)}</small></div></div>
    <div class="card stat"><div class="k">Exam in</div><div class="v">${countdown()}</div></div>
    <div class="card stat"><div class="k">Spaced sessions</div><div class="v">${sessionsSoFar()} <small>${nx ? 'next in ' + fmtDur(nx) : 'new one starts now'}</small></div></div>
    <div class="card stat"><div class="k">Answers logged</div><div class="v">${attempts}</div></div>
  </div>
  <div class="card" style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
    <div><div class="kbd">Most points at stake right now</div><div style="font-weight:600;font-size:16px">${esc(rec.name)} · ${(rec.weight * (1 - unitMastery(rec.id))).toFixed(1)} pts open</div></div>
    <div class="row"><a class="btn" href="#pretest-${rec.id}">Pretest</a><a class="btn pri" href="#unit-${rec.id}">Learn it</a><a class="btn" href="#mix">Mixed</a></div>
  </div>
  <h2>Units by exam points</h2>
  <div class="list">${D.units.map(u => unitCard(u)).join('')}</div>
  <h2>How to use 3 hours</h2>
  <div class="card"><ul class="tight">
    <li><b>Pretest</b> a unit cold (6 questions), even if you guess. Then <b>Learn</b> it until every concept hits ${GOAL} correct this session.</li>
    <li>Do the top units by open points first, then switch to <b>Mixed practice</b> so units are interleaved.</li>
    <li>One <b>blank-page drill</b> per session: draw the whole mechanism, then self-grade the boxes and tag your errors.</li>
    <li>Come back after 3+ hours (tomorrow is ideal). Each new session that hits ${GOAL} correct adds a spacing dot.</li>
  </ul></div>`;
}
function viewLearnPick() {
  MAIN.innerHTML = `<h1>Learn</h1><p class="sub">Quizlet-Learn style rounds. Each concept needs ${GOAL} correct answers this session, on different questions when possible. Misses come back two questions later.</p>
  <div class="list">${D.units.map(u => unitCard(u)).join('')}</div>`;
}

// ---------- quiz engine ----------
let Q = null;
function newQuiz(cfg) {
  Q = Object.assign({ n: 0, right: 0, wrong: 0, recent: [], requeue: [], lastTag: null, cur: null, answered: false }, cfg);
  nextQ();
}
function chooseItem(unit, tag) {
  const pool = BYTAG[unit + '|' + tag] || [];
  let c = pool.filter(i => !Q.recent.includes(i.id));
  if (!c.length) c = pool;
  const wrongFirst = c.filter(i => lastOk(i.id) === 0);
  const fresh = c.filter(i => lastOk(i.id) === null);
  const base = wrongFirst.length && Math.random() < 0.6 ? wrongFirst : (fresh.length && Math.random() < 0.7 ? fresh : c);
  return base.slice().sort((a, b) => lastSeen(a.id) - lastSeen(b.id)).slice(0, 3)[Math.floor(Math.random() * Math.min(3, base.length))];
}
function nextQ() {
  const it = Q.pick();
  if (!it) { Q.cur = null; Q.done && Q.done(); return; }
  Q.cur = it; Q.answered = false; Q.order = (it.type === 'mc') ? (it.ns ? it.choices.map((_, i) => i) : shuffle(it.choices.map((_, i) => i))) : null;
  Q.recent.push(it.id); if (Q.recent.length > 6) Q.recent.shift();
  Q.render();
}
function qCard(it) {
  const u = UNIT[it.unit];
  let figs = '';
  if (it.img) figs += `<div class="figs"><div class="fig"><div class="paper">${IMG(it.img)}</div></div></div>`;
  if (it.imgs) figs += `<div class="figs">${it.imgs.map(([l, s]) => `<div class="fig"><div class="lab">${esc(l)}</div><div class="paper">${IMG(s)}</div></div>`).join('')}</div>`;
  let body = '';
  if (it.type === 'mc') {
    const imgc = !!it.choiceImgs;
    body = `<div class="choices ${imgc ? 'imgs' : ''}">` + Q.order.map((ci, k) => {
      const c = it.choices[ci];
      return `<button class="ch ${imgc ? 'imgc' : ''}" data-act="ans" data-ci="${ci}"><span class="key">${k + 1}</span><span class="body">${imgc ? `<div class="paper">${IMG(c)}</div>` : c}</span></button>`;
    }).join('') + '</div>';
  } else {
    body = `<div class="numrow"><input type="text" inputmode="decimal" id="numin" placeholder="your answer${it.suffix ? ' (' + esc(it.suffix) + ')' : ''}" autocomplete="off"><button class="btn pri" data-act="num">Check</button></div>`;
  }
  return `<div class="card"><div class="qhead"><span class="pill acc">${esc(u.short)} · ${esc(D.tagnames[it.tag] || it.tag)}</span><span class="kbd">${it.type === 'mc' ? 'keys 1–' + it.choices.length : 'Enter to check'} · Enter = next</span></div>
    <div class="q">${it.prompt}</div>${figs}${body}<div id="fb"></div></div>`;
}
function fmtNum(it) { const a = it.answer; return it.rel ? (a >= 100 ? Math.round(a).toString() : Number(a.toPrecision(3)).toString()) : (+a.toFixed(3)).toString(); }
function judgeNum(it, raw) {
  let s = String(raw).trim().replace(/,/g, '').replace(/×\s*10\^/i, 'e').replace(/x\s*10\^/i, 'e').replace(/\s+/g, '');
  if (/^10\^/.test(s)) s = String(Math.pow(10, parseFloat(s.slice(3))));
  const v = parseFloat(s); if (!isFinite(v)) return null;
  if (it.rel) return Math.abs(v - it.answer) <= Math.abs(it.answer) * it.tol;
  return Math.abs(v - it.answer) <= it.tol;
}
function answerQ(ok, ci) {
  if (Q.answered) return; Q.answered = true;
  const it = Q.cur; record(it, ok, Q.mode);
  Q.n++; ok ? Q.right++ : Q.wrong++;
  if (!ok && Q.mode === 'learn') Q.requeue.push({ tag: it.tag, due: Q.n + 2 });
  document.querySelectorAll('.ch').forEach(b => { b.disabled = true; const c = +b.dataset.ci; if (c === it.answer) b.classList.add('right'); else if (c === ci) b.classList.add('wrong'); });
  const inp = $('#numin'); if (inp) inp.disabled = true;
  const corr = it.type === 'num' ? `<div style="margin-bottom:4px">Answer: <b>${fmtNum(it)}</b></div>` : '';
  $('#fb').innerHTML = `<div class="fb ${ok ? 'ok' : 'bad'}"><div class="t">${ok ? 'Correct' : 'Not this one'}</div>${corr}<div>${it.explain}</div></div>
    <div class="row" style="margin-top:12px"><button class="btn pri" data-act="next">Next →</button>${Q.extra ? Q.extra() : ''}</div>`;
  Q.after && Q.after();
}
function quizKeys(e) {
  if (!Q || !Q.cur) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
    if (e.key === 'Enter') { e.preventDefault(); if (!Q.answered) doNum(); else nextQ(); }
    return;
  }
  if (!Q.answered && Q.cur.type === 'mc' && /^[1-9]$/.test(e.key)) { const k = +e.key - 1; if (k < Q.order.length) { const ci = Q.order[k]; answerQ(ci === Q.cur.answer, ci); } }
  else if (Q.answered && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nextQ(); }
}
function doNum() { const v = $('#numin').value; const r = judgeNum(Q.cur, v); if (r === null) { toast('Enter a number'); return; } answerQ(r, null); }
function quizClicks(e) {
  const b = e.target.closest('[data-act]'); if (!b || !Q) return;
  const a = b.dataset.act;
  if (a === 'ans') { const ci = +b.dataset.ci; answerQ(ci === Q.cur.answer, ci); }
  else if (a === 'num') doNum();
  else if (a === 'next') nextQ();
}
function bindQuiz() {
  MAIN.addEventListener('click', quizClicks); document.addEventListener('keydown', quizKeys);
  cleanup = () => { MAIN.removeEventListener('click', quizClicks); document.removeEventListener('keydown', quizKeys); Q = null; };
}
// ---------- Learn ----------
function viewLearn(uid) {
  const u = UNIT[uid]; if (!u) return viewLearnPick();
  touchSession(); save();
  const tags = TAGS[uid];
  const head = () => {
    const chips = tags.map(t => { const c = sessCount(uid, t); const done = c >= GOAL; return `<span class="chip ${done ? 'done' : (Q && Q.cur && Q.cur.tag === t ? 'cur' : '')}">${esc(D.tagnames[t] || t)} ${[0, 1, 2].map(k => `<span class="dot ${k < c ? (done ? 'ok' : 'on') : ''}"></span>`).join('')}</span>`; }).join('');
    const left = tags.filter(t => sessCount(uid, t) < GOAL).length;
    return `<div class="qhead"><div><h1>${esc(u.name)}</h1><p class="sub" style="margin:0">${left ? left + ' concept' + (left > 1 ? 's' : '') + ' left this session' : 'Session goal met'} · ${Q ? Q.right + ' right, ' + Q.wrong + ' missed' : ''}</p></div>
      <div class="row"><a class="btn sm" href="#pretest-${uid}">Pretest</a><a class="btn sm" href="#home">Done</a></div></div><div class="chips">${chips}</div>`;
  };
  bindQuiz();
  newQuiz({
    mode: 'learn', unit: uid, keepGoing: false,
    pick() {
      const due = Q.requeue.findIndex(r => r.due <= Q.n);
      if (due >= 0) { const r = Q.requeue.splice(due, 1)[0]; return chooseItem(uid, r.tag); }
      let open = tags.filter(t => sessCount(uid, t) < GOAL);
      if (!open.length && !Q.keepGoing) return null;
      if (!open.length) open = tags;
      let c = open.filter(t => t !== Q.lastTag); if (!c.length) c = open;
      const t = c.sort((a, b) => (sessCount(uid, a) - sessCount(uid, b)) || (tagMastery(uid, a) - tagMastery(uid, b)))[Math.random() < 0.7 ? 0 : Math.floor(Math.random() * c.length)];
      Q.lastTag = t; return chooseItem(uid, t);
    },
    render() { MAIN.innerHTML = '<div id="lhead">' + head() + '</div>' + qCard(Q.cur); },
    after() { const h = $('#lhead'); if (h) h.innerHTML = head(); },
    done() {
      const nx = nextSessionIn();
      MAIN.innerHTML = head() + `<div class="card"><h3>Session goal met for ${esc(u.name)}</h3>
        <p>Every concept reached ${GOAL} correct answers this session. The spacing dot fills when you repeat this in a session at least 3 hours after this one${nx ? ' (in about ' + fmtDur(nx) + ')' : ''}.</p>
        <div class="row"><a class="btn pri" href="#home">Back to dashboard</a><a class="btn" href="#mix">Mixed practice</a><button class="btn" data-act="more">Keep drilling ${esc(u.short)}</button></div></div>`;
      MAIN.querySelector('[data-act=more]').onclick = () => { Q.keepGoing = true; nextQ(); };
    }
  });
}
// ---------- Mixed ----------
function viewMix() {
  touchSession(); save();
  bindQuiz();
  newQuiz({
    mode: 'mix', lastUnit: null,
    pick() {
      let us = D.units.filter(u => u.id !== Q.lastUnit);
      const u = wpick(us, x => x.weight * (1.08 - unitMastery(x.id)));
      Q.lastUnit = u.id;
      const t = wpick(TAGS[u.id], tg => 1.08 - tagMastery(u.id, tg));
      return chooseItem(u.id, t);
    },
    render() {
      MAIN.innerHTML = `<div class="qhead"><div><h1>Mixed practice</h1><p class="sub" style="margin:0">Interleaved across units, weighted by exam points you have not locked yet. ${Q.right} right, ${Q.wrong} missed.</p></div><a class="btn sm" href="#home">Done</a></div>` + qCard(Q.cur);
    }
  });
}
// ---------- Pretest ----------
function viewPretest(uid) {
  const u = UNIT[uid]; if (!u) return viewLearnPick();
  const tags = TAGS[uid]; const picks = [];
  shuffle(tags).forEach(t => { const p = shuffle(BYTAG[uid + '|' + t]); if (p[0]) picks.push(p[0]); });
  let extra = shuffle(D.items.filter(i => i.unit === uid && !picks.includes(i)));
  while (picks.length < 6 && extra.length) picks.push(extra.shift());
  const list = picks.slice(0, 6);
  bindQuiz();
  newQuiz({
    mode: 'pretest', idx: 0,
    pick() { return list[Q.idx++] || null; },
    render() { MAIN.innerHTML = `<div class="qhead"><div><h1>Pretest · ${esc(u.name)}</h1><p class="sub" style="margin:0">Guess if you have to. Trying first makes the explanation stick. Question ${Q.idx} of ${list.length}.</p></div><a class="btn sm" href="#home">Exit</a></div>` + qCard(Q.cur); },
    done() {
      st.pretest[uid] = { ts: now(), score: Q.right, n: list.length }; save();
      MAIN.innerHTML = `<h1>Pretest done: ${Q.right}/${list.length}</h1><p class="sub">Now learn it while the misses are fresh.</p><div class="row"><a class="btn pri" href="#unit-${uid}">Learn ${esc(u.short)}</a><a class="btn" href="#home">Dashboard</a></div>`;
    }
  });
}
// ---------- Retry misses ----------
function viewRetry() {
  const ids = Object.keys(st.att).filter(id => ITEM[id] && lastOk(id) === 0);
  const list = shuffle(ids).slice(0, 15).map(id => ITEM[id]);
  if (!list.length) { MAIN.innerHTML = '<h1>No open misses</h1><p class="sub">Every item you missed has been answered correctly since.</p><a class="btn" href="#errors">Back</a>'; return; }
  bindQuiz();
  newQuiz({
    mode: 'retry', idx: 0,
    pick() { return list[Q.idx++] || null; },
    render() { MAIN.innerHTML = `<div class="qhead"><div><h1>Retry my misses</h1><p class="sub" style="margin:0">${Q.idx} of ${list.length}</p></div><a class="btn sm" href="#errors">Exit</a></div>` + qCard(Q.cur); },
    done() { MAIN.innerHTML = `<h1>Retry done: ${Q.right}/${list.length}</h1><div class="row"><a class="btn pri" href="#errors">Error log</a><a class="btn" href="#mix">Mixed practice</a></div>`; }
  });
}

// ---------- scratch pad ----------
function padHTML() {
  return `<div class="pad-tools"><button class="btn sm" data-pad="pen">Pen</button><button class="btn sm" data-pad="erase">Eraser</button><button class="btn sm" data-pad="undo">Undo</button><button class="btn sm" data-pad="clear">Clear</button><span class="kbd" style="align-self:center">Draw with a finger, stylus or mouse</span></div>
  <div class="pad-wrap"><canvas id="pad"></canvas></div>`;
}
function initPad() {
  const cv = $('#pad'); if (!cv) return;
  const ctx = cv.getContext('2d'); let strokes = [], cur = null, mode = 'pen';
  function size() { const r = cv.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(); }
  function draw() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    strokes.forEach(s => { ctx.beginPath(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = s.m === 'erase' ? '#ffffff' : '#111'; ctx.lineWidth = s.m === 'erase' ? 22 : 2.4;
      s.p.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); });
  }
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); cur = { m: mode, p: [pos(e)] }; strokes.push(cur); });
  cv.addEventListener('pointermove', e => { if (!cur) return; const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e]; evs.forEach(ev => cur.p.push(pos(ev))); draw(); });
  const end = () => { cur = null; };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  document.querySelectorAll('[data-pad]').forEach(b => b.onclick = () => {
    const a = b.dataset.pad; if (a === 'pen' || a === 'erase') mode = a; else if (a === 'undo') { strokes.pop(); draw(); } else if (a === 'clear') { strokes = []; draw(); }
    document.querySelectorAll('[data-pad=pen],[data-pad=erase]').forEach(x => x.classList.toggle('pri', x.dataset.pad === mode));
  });
  $('[data-pad=pen]').classList.add('pri');
  size(); window.addEventListener('resize', size);
  return () => window.removeEventListener('resize', size);
}
function rxRow(row) {
  if (!row || !row.length) return '';
  return `<div class="rxrow">${row.map(x => isImg(x) ? IMG(x) : `<span class="op">${esc(x)}</span>`).join('')}</div>`;
}
// ---------- drills ----------
function drillState(id) {
  const a = st.drills[id] || []; if (!a.length) return ['not tried', ''];
  const perfect = a.filter(x => x.boxes.every(Boolean));
  let n = 0, lastT = -Infinity; perfect.map(x => x.ts).sort((p, q) => p - q).forEach(t => { if (t - lastT >= GAP) { n++; lastT = t; } });
  const last = a[a.length - 1]; const sc = last.boxes.filter(Boolean).length + '/' + last.boxes.length;
  return [n >= 2 ? 'locked · ' + sc : 'last ' + sc + (n ? ' · ' + n + ' clean session' + (n > 1 ? 's' : '') : ''), n >= 2 ? 'ok' : (last.boxes.every(Boolean) ? 'acc' : 'warn')];
}
function viewDrills() {
  const tagCounts = {};
  Object.values(st.drills).flat().forEach(a => (a.tags || []).forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1));
  const top = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 4);
  MAIN.innerHTML = `<h1>Blank-page drills</h1><p class="sub">Mechanism points are the biggest lock (≈19 per exam). Draw the whole thing from a blank page, reveal, then self-grade each box with no forgiveness and tag what went wrong. A drill locks after two clean attempts in separate sessions.</p>
  ${top.length ? `<div class="callout"><b>Your most frequent drill errors:</b> ${top.map(([t, n]) => `${esc(t)} (${n})`).join(', ')}</div>` : ''}
  <div class="list">${D.drills.map(d => { const [s, c] = drillState(d.id); return `<a class="li" href="#drill-${d.id}"><div><div class="t">${esc(d.title)}</div><div class="s">${d.boxes.length} boxes</div></div><span class="pill ${c}">${esc(s)}</span></a>`; }).join('')}</div>
  <h2>Reference: the arrow template</h2><div class="paper"><img src="${D.template}" alt="Acid-catalyzed addition template with curved arrows"></div>`;
}
function viewDrill(id) {
  const d = D.drills.find(x => x.id === id); if (!d) return viewDrills();
  touchSession(); save();
  const t0 = now(); let revealed = false;
  MAIN.innerHTML = `<div class="qhead"><div><h1>${esc(d.title)}</h1></div><div class="row"><span class="pill" id="clock">0:00</span><a class="btn sm" href="#drills">All drills</a></div></div>
    <div class="card"><div class="q">${d.prompt}</div>${d.img ? `<div class="figs"><div class="fig"><div class="paper">${IMG(d.img)}</div></div></div>` : ''}
    <p class="kbd">Work on paper or below. Do not reveal until every step is down.</p>${padHTML()}
    <div class="row" style="margin-top:12px"><button class="btn pri" id="rev">Reveal the solution</button></div></div><div id="sol"></div>`;
  const unpad = initPad();
  const tick = setInterval(() => { const s = Math.floor((now() - t0) / 1000); const c = $('#clock'); if (c) c.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }, 1000);
  cleanup = () => { clearInterval(tick); unpad && unpad(); };
  $('#rev').onclick = () => {
    if (revealed) return; revealed = true; $('#rev').disabled = true;
    const sol = d.solution.map((s, k) => `<div class="step"><div class="n">${esc(s.title)}</div><div>${s.text}</div>${rxRow(s.row)}</div>`).join('');
    $('#sol').innerHTML = `<h2>Solution</h2>${d.template ? `<div class="paper" style="margin-bottom:10px"><img src="${D.template}" alt="Worked arrow-pushing template"></div>` : ''}${sol}
      <h2>Grade every box (no forgiveness)</h2><div class="card">${d.boxes.map((b, k) => `<label class="check"><input type="checkbox" data-box="${k}"><span>${esc(b)}</span></label>`).join('')}</div>
      <h2>Tag what went wrong</h2><div class="row">${d.tags.map((t, k) => `<button class="tagbtn" data-tag="${k}">${esc(t)}</button>`).join('')}</div>
      <div class="row" style="margin-top:14px"><button class="btn pri" id="savedrill">Save attempt</button></div>`;
    document.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => b.classList.toggle('on'));
    $('#savedrill').onclick = () => {
      const boxes = [...document.querySelectorAll('[data-box]')].map(x => x.checked);
      const tags = [...document.querySelectorAll('[data-tag].on')].map(x => d.tags[+x.dataset.tag]);
      (st.drills[id] = st.drills[id] || []).push({ ts: now(), boxes, tags, secs: Math.round((now() - t0) / 1000) });
      tags.forEach(t => st.errors.push({ ts: now(), kind: 'drill', id, unit: d.unit, tag: t }));
      save(); toast(boxes.every(Boolean) ? 'Clean attempt saved' : 'Saved. Redo it later from blank.'); location.hash = '#drills';
    };
    $('#sol').scrollIntoView({ behavior: 'smooth' });
  };
}
// ---------- worked examples (faded) ----------
function wState(id) { return st.worked[id] || (st.worked[id] = { level: 0, retired: false, runs: 0 }); }
function viewWorkedList() {
  MAIN.innerHTML = `<h1>Faded worked examples</h1><p class="sub">First pass shows every step: explain each one to yourself before tapping “check my explanation”. Each time you finish the hidden steps unaided, one more step is hidden. When you solve the whole thing unaided, it retires.</p>
  <div class="list">${D.worked.map(w => { const s = wState(w.id); return `<a class="li" href="#w-${w.id}"><div><div class="t">${esc(w.title)}</div><div class="s">${esc(UNIT[w.unit].short)} · ${w.steps.length} steps</div></div><span class="pill ${s.retired ? 'ok' : (s.level ? 'acc' : '')}">${s.retired ? 'retired' : (s.level ? s.level + ' of ' + w.steps.length + ' steps hidden' : 'full example')}</span></a>`; }).join('')}</div>`;
  save();
}
function viewWorked(id) {
  const w = D.worked.find(x => x.id === id); if (!w) return viewWorkedList();
  const s = wState(id); const n = w.steps.length; const hide = Math.min(s.level, n); const firstHidden = n - hide;
  const res = {};
  const stepHTML = (st_, k) => {
    if (k < firstHidden) return `<div class="step"><div class="n">Step ${k + 1}</div><div><b>${esc(st_.do)}</b></div>
      <div class="hidden-why" id="why${k}">Say why out loud first.</div><button class="btn sm" data-why="${k}" style="margin-top:6px">Check my explanation</button></div>`;
    return `<div class="step"><div class="n">Step ${k + 1} · your turn</div><div><b>${esc(st_.do)}</b></div><div id="ans${k}" class="hidden-why">Work it out, then reveal.</div>
      <div class="row" style="margin-top:6px"><button class="btn sm" data-rev="${k}">Reveal</button><button class="btn sm" data-got="${k}" disabled>Got it unaided</button><button class="btn sm" data-miss="${k}" disabled>Missed</button></div></div>`;
  };
  MAIN.innerHTML = `<div class="qhead"><div><h1>${esc(w.title)}</h1><p class="sub" style="margin:0">${hide ? hide + ' step' + (hide > 1 ? 's' : '') + ' hidden' : 'Full worked example'}${s.retired ? ' · retired' : ''}</p></div><a class="btn sm" href="#worked">All examples</a></div>
    <div class="card"><div class="q">${esc(w.setup)}</div>${w.img ? `<div class="figs"><div class="fig"><div class="paper">${IMG(w.img)}</div></div></div>` : ''}</div>
    ${w.steps.map(stepHTML).join('')}
    ${hide ? padHTML() : ''}
    <div class="row" style="margin-top:14px"><button class="btn pri" id="finish">${hide ? 'Finish' : 'I explained every step → hide one next time'}</button></div>`;
  const unpad = hide ? initPad() : null; cleanup = () => { unpad && unpad(); };
  const reveal = k => `<div>${w.steps[k].why}</div>${rxRow(w.steps[k].row)}`;
  MAIN.querySelectorAll('[data-why]').forEach(b => b.onclick = () => { const k = +b.dataset.why; $('#why' + k).classList.remove('hidden-why'); $('#why' + k).innerHTML = reveal(k); b.remove(); });
  MAIN.querySelectorAll('[data-rev]').forEach(b => b.onclick = () => { const k = +b.dataset.rev; const el = $('#ans' + k); el.classList.remove('hidden-why'); el.innerHTML = reveal(k); b.disabled = true; MAIN.querySelector(`[data-got="${k}"]`).disabled = false; MAIN.querySelector(`[data-miss="${k}"]`).disabled = false; });
  MAIN.querySelectorAll('[data-got],[data-miss]').forEach(b => b.onclick = () => { const k = +(b.dataset.got ?? b.dataset.miss); res[k] = b.dataset.got !== undefined; MAIN.querySelector(`[data-got="${k}"]`).classList.toggle('pri', res[k]); MAIN.querySelector(`[data-miss="${k}"]`).classList.toggle('pri', !res[k]); });
  $('#finish').onclick = () => {
    s.runs++;
    if (!hide) { s.level = 1; toast('Next time the last step is hidden'); }
    else {
      const ks = Object.keys(res); if (ks.length < hide) { toast('Mark each hidden step first'); s.runs--; return; }
      const allGot = ks.every(k => res[k]);
      if (allGot && hide >= n) { s.retired = true; toast('Solved unaided. Retired.'); }
      else if (allGot) { s.level = hide + 1; toast('One more step hidden next time'); }
      else { s.level = Math.max(1, hide - 1); st.errors.push({ ts: now(), kind: 'worked', id, unit: w.unit, tag: 'faded step missed' }); toast('Stepping back one level'); }
    }
    save(); location.hash = '#worked';
  };
}
// ---------- contrast pairs ----------
let CI = 0;
function viewContrast() {
  const order = D.contrast.slice().sort((a, b) => ((st.contrast[a.id] || []).length - (st.contrast[b.id] || []).length));
  const c = order[CI % order.length];
  const sel = { a: null, b: null };
  const side = (k, o) => `<div class="card"><div class="lab pill">${esc(o.label)}</div><div style="font-weight:600;margin-top:6px">${esc(o.text)}</div>${o.img ? `<div class="paper" style="margin-top:8px">${IMG(o.img)}</div>` : ''}
    <div class="opts">${c.options.map((op, i) => `<button class="opt" data-side="${k}" data-i="${i}">${esc(op)}</button>`).join('')}</div></div>`;
  MAIN.innerHTML = `<div class="qhead"><div><h1>Contrast pairs</h1><p class="sub" style="margin:0">Two cases that differ by one feature. Answer both, then find the feature.</p></div><span class="pill">${(CI % order.length) + 1} / ${order.length}</span></div>
    <div class="card" style="margin-top:12px"><div class="pill acc">${esc(UNIT[c.unit].short)}</div><h3 style="margin-top:8px">${esc(c.title)}</h3><div class="q">${esc(c.q)}</div></div>
    <div class="contrast">${side('a', c.a)}${side('b', c.b)}</div>
    <div class="row" style="margin-top:12px"><button class="btn pri" id="cchk" disabled>Check both</button><button class="btn" id="cnext">Skip →</button></div><div id="cfb"></div>`;
  const upd = () => { $('#cchk').disabled = sel.a === null || sel.b === null; };
  MAIN.querySelectorAll('.opt').forEach(b => b.onclick = () => { const k = b.dataset.side; sel[k] = +b.dataset.i; MAIN.querySelectorAll(`.opt[data-side="${k}"]`).forEach(x => x.classList.toggle('sel', x === b)); upd(); });
  $('#cnext').onclick = () => { CI++; viewContrast(); };
  $('#cchk').onclick = () => {
    const okA = sel.a === c.ansA, okB = sel.b === c.ansB;
    MAIN.querySelectorAll('.opt').forEach(x => { x.disabled = true; const k = x.dataset.side, i = +x.dataset.i; const ans = k === 'a' ? c.ansA : c.ansB; if (i === ans) x.classList.add('right'); else if (i === sel[k]) x.classList.add('wrong'); });
    (st.contrast[c.id] = st.contrast[c.id] || []).push({ ts: now(), okA, okB });
    if (!(okA && okB)) st.errors.push({ ts: now(), kind: 'contrast', id: c.id, unit: c.unit, tag: c.title });
    save();
    $('#cfb').innerHTML = `<div class="fb ${okA && okB ? 'ok' : 'bad'}"><div class="t">${okA && okB ? 'Both right' : 'Check the difference'}</div><div><b>The one feature:</b> ${esc(c.diff)}</div><div style="margin-top:6px">${esc(c.explain)}</div></div>`;
    $('#cchk').disabled = true; $('#cnext').textContent = 'Next pair →';
  };
}
// ---------- strategy ----------
function viewStrategy() {
  const units = D.units.slice().sort((a, b) => b.weight - a.weight);
  MAIN.innerHTML = `<h1>Exam strategy</h1><p class="sub">Tue Nov 3 · 6:15–8:30 PM with 1.5× time (135 min) · ${esc(D.exam.room)} · room opens ${esc(D.exam.opens)}. Bring a pen and your MCard. The pKa table and periodic table are provided.</p>
  <div class="grid g3">
    <div class="card"><h3>Pass 1 · ≈70 min</h3>Lock boxes only, in exam order. Anything that is not a lock format gets a mark in the margin and you move on.</div>
    <div class="card"><h3>Pass 2 · ≈30 min</h3>Check every lock box against its checklist below. Charges, arrows, front atom, wording of counts.</div>
    <div class="card"><h3>Pass 3 · ≈35 min</h3>Limbo boxes. Best attempt on each, never blank. Partial credit lives here.</div>
  </div>
  <h2>Lock list (points per past exam)</h2>
  <div class="card" style="overflow-x:auto"><table><thead><tr><th>Format</th><th class="num">Pts</th><th>On</th><th class="num">You</th></tr></thead><tbody>
    ${units.map(u => `<tr><td><b>${esc(u.name)}</b><br><span class="kbd">${esc(u.what)}</span></td><td class="num">${u.weight}</td><td>${esc(u.exams)}</td><td class="num">${pct(unitMastery(u.id))}</td></tr>`).join('')}
    <tr><td>Limbo (new formats, structure from data, odd naming)</td><td class="num">≈15</td><td>varies</td><td class="num">—</td></tr></tbody></table></div>
  <h2>Checklists to run in pass 2</h2>
  <div class="grid g2">${units.map(u => `<div class="card"><h3>${esc(u.name)}</h3><ul class="tight">${u.checks.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}</div>
  <h2>Mechanism template</h2><div class="paper"><img src="${D.template}" alt="Acid-catalyzed addition template"></div>
  <h2>Why the app works this way</h2><div class="card"><ul class="tight">
    <li><b>Successive relearning:</b> ${GOAL} correct per concept in each session, across ${NEED_SESS} sessions spaced 3+ hours apart. Spacing dots show it.</li>
    <li><b>Interleaving:</b> Mixed practice never repeats a unit back to back, so you practice choosing the method, not just running it.</li>
    <li><b>Contrast pairs:</b> two cases that differ by one feature, so you learn which cue changes the answer.</li>
    <li><b>Blank-page generation:</b> drills make you produce the whole mechanism before seeing it, with error tags for the error log.</li>
    <li><b>Faded worked examples:</b> self-explain every step, then the steps disappear one at a time until you solve it alone.</li>
    <li><b>Pretesting:</b> a cold attempt before studying a unit makes the explanation stick.</li>
    <li>Rereading and highlighting are not in here on purpose.</li></ul></div>`;
}
// ---------- errors ----------
function viewErrors() {
  const items = st.errors.filter(e => e.kind === 'item');
  const byTag = {};
  items.forEach(e => { const k = e.unit + '|' + e.tag; byTag[k] = (byTag[k] || 0) + 1; });
  const open = Object.keys(st.att).filter(id => ITEM[id] && lastOk(id) === 0).length;
  const other = {}; st.errors.filter(e => e.kind !== 'item').forEach(e => { other[e.tag] = (other[e.tag] || 0) + 1; });
  const rows = Object.entries(byTag).sort((a, b) => b[1] - a[1]).map(([k, n]) => { const [u, t] = k.split('|'); return `<tr><td>${esc(UNIT[u] ? UNIT[u].short : u)}</td><td>${esc(D.tagnames[t] || t)}</td><td class="num">${n}</td><td class="num">${pct(tagAcc(u, t))}</td><td><a class="btn sm" href="#unit-${u}">Learn</a></td></tr>`; }).join('');
  MAIN.innerHTML = `<h1>Error log</h1><p class="sub">Where the points are leaking. Misses stay open until you answer that exact question correctly.</p>
  <div class="row"><a class="btn pri" href="#retry">Retry my open misses (${open})</a></div>
  <h2>Missed concepts</h2>${rows ? `<div class="card" style="overflow-x:auto"><table><thead><tr><th>Unit</th><th>Concept</th><th class="num">Misses</th><th class="num">Recent acc.</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="sub">Nothing missed yet.</p>'}
  <h2>Drill, contrast and worked-example errors</h2>${Object.keys(other).length ? `<div class="card"><ul class="tight">${Object.entries(other).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<li>${esc(t)} · ${n}</li>`).join('')}</ul></div>` : '<p class="sub">None logged yet.</p>'}`;
}
// ---------- settings ----------
function viewSettings() {
  MAIN.innerHTML = `<h1>Progress & settings</h1><p class="sub">Progress lives in this browser only. To move it to another device, copy the export here and paste it there.</p>
  <div class="card"><h3>Theme</h3><div class="row"><button class="btn sm" data-th="">System</button><button class="btn sm" data-th="light">Light</button><button class="btn sm" data-th="dark">Dark</button></div></div>
  <div class="card" style="margin-top:10px"><h3>Export</h3><textarea id="exp" readonly>${esc(JSON.stringify(st))}</textarea><div class="row" style="margin-top:8px"><button class="btn sm" id="copy">Copy</button></div></div>
  <div class="card" style="margin-top:10px"><h3>Import</h3><textarea id="imp" placeholder="Paste an export here"></textarea><div class="row" style="margin-top:8px"><button class="btn sm" id="doimp">Import (replaces this browser’s progress)</button></div></div>
  <div class="card" style="margin-top:10px"><h3>Reset</h3><button class="btn sm" id="reset">Erase all progress in this browser</button></div>
  <p class="kbd" style="margin-top:14px">${D.items.length} questions · ${D.contrast.length} contrast pairs · ${D.drills.length} drills · ${D.worked.length} faded examples. Structures and stereo labels were generated and checked with RDKit.</p>`;
  MAIN.querySelectorAll('[data-th]').forEach(b => b.onclick = () => { st.theme = b.dataset.th || null; save(); applyTheme(); toast('Theme set'); });
  $('#copy').onclick = () => { const t = $('#exp'); t.select(); try { navigator.clipboard.writeText(t.value).then(() => toast('Copied'), () => { document.execCommand('copy'); toast('Copied'); }); } catch (e) { document.execCommand('copy'); toast('Copied'); } };
  $('#doimp').onclick = () => { try { const o = JSON.parse($('#imp').value); if (!o || o.v !== 1) throw 0; st = Object.assign(blank(), o); save(); applyTheme(); toast('Imported'); route(); } catch (e) { toast('That is not a valid export'); } };
  $('#reset').onclick = () => { if ($('#reset').dataset.armed) { st = blank(); save(); applyTheme(); toast('Erased'); route(); } else { $('#reset').dataset.armed = 1; $('#reset').textContent = 'Tap again to erase everything'; } };
}
route();
setInterval(() => { if (!Q || !Q.cur) renderNav((location.hash || '#home').slice(1).split('-')[0]); }, 60000);
})();
