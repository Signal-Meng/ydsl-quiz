/* 运动生理学刷题 · app.js (零依赖) */
"use strict";

/* ================= 基础 ================= */
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const todayStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const KIND_NAME = { term: "名词解释", short: "简答", essay: "论述", analysis: "分析", tpl: "模板" };
const KIND_SCORE = { term: "每题 3~5 分", short: "每题 8~10 分", essay: "每题 15~20 分", analysis: "每题 15~25 分" };
const SRC_ORDER = { "分题型手册": 0, "真题": 1, "王瑞元·第六版": 2, "段锐·第四版": 3 };

const DATA = window.QUIZ_DATA;
const CARDS = DATA.cards;

/* ================= 状态 ================= */
const LS_KEY = "ydsx_quiz_v1";
let store = loadStore();
function loadStore() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { s = {}; }
  if (!s.srs) s.srs = {};
  if (!s.set) s.set = {};
  if (!s.today || s.today.d !== todayStr()) s.today = { d: todayStr(), n: 0 };
  if (!s.objWrong) s.objWrong = [];
  return s;
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(store)); } catch (e) { } }
function srsOf(id) { return store.srs[id] || (store.srs[id] = { b: 1, seen: 0, wrong: 0, due: "", star: 0, lr: 0 }); }

/* ================= 过滤 ================= */
function bookMatch(card, f) {
  if (f === "all") return true;
  return card.books.some(x =>
    f === "wy" ? x.b.startsWith("王瑞元") :
    f === "dr" ? x.b.startsWith("段锐") :
    f === "sc" ? x.b.includes("分题型手册") :
    f === "zt" ? x.b === "真题" : true);
}
function applyFilters(pool, f) {
  let out = pool.filter(c => bookMatch(c, f.book || "all"));
  if (f.ch && f.ch !== "all") out = out.filter(c => c.books.some(x => x.c === f.ch));
  if (f.freq) out = out.filter(c => c.freq === f.freq);
  if (f.kinds && f.kinds.length) out = out.filter(c => f.kinds.includes(c.kind));
  if (f.years && f.years.length) out = out.filter(c => (c.years || []).some(y => f.years.includes(y)));
  if (f.star) out = out.filter(c => (store.srs[c.id] || {}).star);
  if (f.wrong) out = out.filter(c => (store.srs[c.id] || {}).wrong > 0);
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter(c => (c.term || "").toLowerCase().includes(q) ||
      c.answers.some(a => ((a.title || "") + (a.body || "") + (a.def || "")).toLowerCase().includes(q)));
  }
  return out;
}
function chaptersOf(book) {
  const set = new Set();
  CARDS.forEach(c => { if (bookMatch(c, book)) c.books.forEach(x => { if (x.c) set.add(x.c); }); });
  return Array.from(set).sort((a, b) => a.localeCompare(b, "zh"));
}

/* ================= Leitner 排序 ================= */
function byDue(a, b) {
  const sa = store.srs[a.id] || {}, sb = store.srs[b.id] || {};
  const da = sa.due && sa.due <= todayStr() ? 0 : 1, db = sb.due && sb.due <= todayStr() ? 0 : 1;
  if (da !== db) return da - db;
  if ((sa.b || 1) !== (sb.b || 1)) return (sa.b || 1) - (sb.b || 1);
  return a.no - b.no;
}

/* ================= markdown-lite ================= */
function inline(s) {
  return esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy">')
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}
function renderTable(rows) {
  let h = "<table><tr>" + rows[0].map(c => "<th>" + inline(c.trim()) + "</th>").join("") + "</tr>";
  for (let i = 1; i < rows.length; i++) h += "<tr>" + rows[i].map(c => "<td>" + inline(c.trim()) + "</td>").join("") + "</tr>";
  return h + "</table>";
}
function mdLite(text) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [], tbl = [], list = [];
  const flushTbl = () => { if (tbl.length) { out.push(renderTable(tbl)); tbl.length = 0; } };
  const flushList = () => { if (list.length) { out.push("<ul>" + list.map(x => "<li>" + x + "</li>").join("") + "</ul>"); list.length = 0; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      flushList();
      const cells = line.slice(1, -1).split("|");
      if (!cells.every(c => /^\s*:?-{2,}/.test(c.trim()))) tbl.push(cells);
      continue;
    }
    flushTbl();
    if (!line) { flushList(); continue; }
    if (line.startsWith("```")) continue;
    if (line.startsWith(">")) { flushList(); out.push("<blockquote>" + inline(line.replace(/^>\s*/, "")) + "</blockquote>"); continue; }
    let m = line.match(/^[-*]\s+(.*)$/);
    if (m) { list.push(inline(m[1])); continue; }
    m = line.match(/^([①-⑳㉑-㉟])\s*(.*)$/);
    if (m) { flushList(); out.push('<p class="pt"><b>' + m[1] + "</b> " + inline(m[2]) + "</p>"); continue; }
    m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) { flushList(); out.push("<p><b>" + inline(m[1]) + "</b></p>"); continue; }
    m = line.match(/^(\d+)[.、]\s+(.*)$/);
    if (m) { list.push(inline(m[1] + ". " + m[2])); continue; }
    flushList();
    out.push("<p>" + inline(line) + "</p>");
  }
  flushTbl(); flushList();
  return out.join("");
}

/* ================= 答案展示 ================= */
function sortedAnswers(c) {
  return c.answers.slice().sort((a, b) => ((SRC_ORDER[a.src] ?? 9) - (SRC_ORDER[b.src] ?? 9)));
}
function answerHtml(c) {
  const parts = [];
  sortedAnswers(c).forEach((a, i) => {
    let body = "";
    if (a.def) {
      body = '<p class="def-main">' + inline(a.def) + "</p>" +
        (a.supp ? '<p class="supp">补充:' + inline(a.supp) + "</p>" : "");
    } else if (a.body) {
      body = '<div class="md">' + mdLite(a.body) + "</div>";
    }
    if (!body) return;
    parts.push(
      '<details class="src"' + (i === 0 ? " open" : "") + '><summary>📍 ' + esc(a.src) +
      (a.ch ? " · " + esc(a.ch) : "") + "</summary>" +
      '<div class="inner">' + body + "</div></details>");
  });
  return parts.join("") || '<p class="supp">(无参考答案)</p>';
}
function tagHtml(c) {
  const t = ['<span class="tag">' + KIND_NAME[c.kind] + "</span>"];
  if (c.freq === "高频") t.push('<span class="tag hot">高频</span>');
  if (c.freq === "中频") t.push('<span class="tag f2">中频</span>');
  if (c.freq === "低频") t.push('<span class="tag f1">低频</span>');
  if (c.stars) t.push('<span class="tag hot">' + "★".repeat(c.stars) + "</span>");
  (c.years || []).forEach(y => t.push('<span class="tag">真题 ' + y + "</span>"));
  return t.join("");
}
function cardFront(c) {
  if (c.kind === "term") return c.term;
  const a = sortedAnswers(c)[0] || {};
  return a.title || c.term || "";
}

/* ================= 视图框架 ================= */
const view = $("#view");
let S = null, OBJ = null;
function setHints(html) {
  const h = $("#hints");
  if (!html) { h.classList.add("hidden"); return; }
  h.innerHTML = html; h.classList.remove("hidden");
}
function goHome() { S = null; OBJ = null; renderHome(); setHints(""); refreshBadge(); }

/* ================= 首页 ================= */
function statCards() {
  const total = CARDS.length;
  let b3 = 0, dueN = 0;
  Object.values(store.srs).forEach(r => {
    if (r.b === 3) b3++;
    if (r.due && r.due <= todayStr() && r.b < 3) dueN++;
  });
  return { total, b3, dueN };
}
function modeBtn(m, ico, name, sub) {
  return `<button class="mode" data-mode="${m}"><span class="ico">${ico}</span><b>${name}</b><span>${sub}</span></button>`;
}
function renderHome() {
  const st = statCards();
  const c = DATA.meta.counts;
  const pct = st.total ? Math.round(st.b3 / st.total * 100) : 0;
  view.innerHTML = `
  <div class="hero">
    <h1>运动生理学 · 706 备考刷题</h1>
    <div class="sub">共 ${st.total} 卡 · 建库 ${DATA.meta.built} · 王瑞元第六版 + 段锐第四版 + 分题型手册 + 2014–2026 真题</div>
    <div class="statbar">
      <div class="stat"><b>${store.today.n}</b><span>今日已刷</span></div>
      <div class="stat"><b>${st.dueN}</b><span>今日待复习</span></div>
      <div class="stat"><b>${st.b3}</b><span>已掌握</span></div>
      <div class="stat"><b>${pct}%</b><span>总掌握率</span></div>
    </div>
    <div class="progress"><i style="width:${pct}%"></i></div>
  </div>
  <div class="sec-title">开始刷题</div>
  <div class="grid">
    ${modeBtn("terms", "📇", "名词解释闪卡", c.term + " 张 · 术语→定义")}
    ${modeBtn("terms-rev", "🔁", "名解反序", "看定义猜术语")}
    ${modeBtn("subj", "✍️", "主观题背诵", "简答 " + c.short + " · 论述 " + c.essay + " · 分析 " + c.analysis)}
    ${modeBtn("zt", "📅", "真题模式", "按年份刷 2014–2026")}
    ${modeBtn("paper", "📜", "真题整卷", "按年份模拟一套完整卷")}
    ${modeBtn("obj", "⚡", "客观题快刷", "自动生成选择 / 挖空")}
    ${modeBtn("review", "🎯", "错题 / 收藏", "专项重刷")}
  </div>
  <div class="sec-title">浏览</div>
  <div class="grid">
    ${modeBtn("browse", "📚", "考点索引", "按教材章节浏览全部卡片")}
    ${modeBtn("tpl", "🧰", "答题模板", "分析题四模板 + 研究设计八步")}
  </div>
  <div class="sec-title">数据</div>
  <div class="panel" style="display:flex;gap:.6rem;flex-wrap:wrap;align-items:center">
    <button class="btn ghost" id="btnExport">导出进度(JSON)</button>
    <button class="btn ghost" id="btnReset">清空刷题记录</button>
    <span style="font-size:.75rem;color:var(--muted)">进度保存在本机浏览器 localStorage</span>
  </div>`;
  $$("#view .mode").forEach(b => b.onclick = () => openSetup(b.dataset.mode));
  $("#btnExport").onclick = exportProg;
  $("#btnReset").onclick = resetProg;
}
function exportProg() {
  const blob = new Blob([JSON.stringify(store, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "运动生理学刷题进度_" + todayStr() + ".json";
  a.click(); URL.revokeObjectURL(a.href);
}
function resetProg() {
  if (!confirm("确定清空全部刷题记录与收藏?此操作不可恢复。")) return;
  store.srs = {}; store.today = { d: todayStr(), n: 0 }; store.objWrong = [];
  save(); renderHome(); refreshBadge();
}

/* ================= 配置页 ================= */
const DEFAULT_KINDS = { terms: ["term"], "terms-rev": ["term"], obj: ["term"], subj: ["short"], zt: ["short", "essay", "analysis"], review: [], browse: [] };
function openSetup(mode) {
  if (mode === "paper") { S = { mode: "paper", stage: "paper-picker" }; renderPaperPicker(); return; }
  const saved = store.set["f_" + mode] || {};
  const f = Object.assign({ book: "all", ch: "all", freq: "", kinds: (DEFAULT_KINDS[mode] || []).slice(), years: [], q: "", n: 20, rv: "wrong" }, saved);
  f.kinds = (f.kinds && f.kinds.length ? f.kinds : (DEFAULT_KINDS[mode] || []).slice());
  S = { mode, f, stage: "setup" };
  renderSetup();
}
function chip(label, k, v, n, on) {
  return `<button class="chip${on ? " on" : ""}" data-k="${k}" data-v="${esc(v)}">${n}</button>`;
}
function chipSet(label, items) {
  return `<div class="f-row"><label>${label}</label><div class="chips">${items.map(o => chip(label, o.k, o.v, o.n, o.on)).join("")}</div></div>`;
}
function poolFor(mode, f) {
  const ff = { book: f.book, ch: f.ch, freq: f.freq, kinds: f.kinds, years: f.years, q: f.q };
  if (mode === "review") ff[f.rv === "star" ? "star" : "wrong"] = 1;
  let pool = applyFilters(CARDS, ff);
  if (mode === "terms-rev" || mode === "obj") pool = pool.filter(c => c.def && c.def.length >= 8 && c.def.length <= 120);
  return pool;
}
function renderSetup() {
  const { mode, f } = S;
  const titles = { terms: "名词解释闪卡", "terms-rev": "名解反序", subj: "主观题背诵", zt: "真题模式", obj: "客观题快刷", review: "错题 / 收藏", browse: "考点索引", tpl: "答题模板" };
  const bookOpts = [
    { v: "all", n: "全部教材" }, { v: "wy", n: "王瑞元·第六版" }, { v: "dr", n: "段锐·第四版" },
    { v: "sc", n: "分题型手册" }, { v: "zt", n: "真题" }];
  const freqOpts = [{ v: "", n: "全部考频" }, { v: "高频", n: "仅高频" }, { v: "中频", n: "中频" }, { v: "低频", n: "低频" }];
  const kindOpts = [{ v: "term", n: "名词解释" }, { v: "short", n: "简答" }, { v: "essay", n: "论述" }, { v: "analysis", n: "分析" }, { v: "tpl", n: "模板" }];
  let body = "";

  if (mode === "subj" || mode === "zt") {
    const ks = mode === "subj" ? kindOpts.slice(1) : kindOpts.slice(0, 4);
    body += chipSet("题型(可多选)", ks.map(o => ({ k: "kind", v: o.v, n: o.n, on: f.kinds.includes(o.v) })));
  }
  if (mode !== "tpl") {
    body += chipSet("教材 / 来源", bookOpts.map(o => ({ k: "book", v: o.v, n: o.n, on: f.book === o.v })));
    if (f.book !== "all") {
      const chs = chaptersOf(f.book);
      body += chipSet("章节", [{ v: "all", n: "全部章节" }].concat(chs.map(x => ({ v: x, n: x })))
        .map(o => ({ k: "ch", v: o.v, n: o.n, on: f.ch === o.v })));
    }
    body += chipSet("考频", freqOpts.map(o => ({ k: "freq", v: o.v, n: o.n, on: (f.freq || "") === o.v })));
  }
  if (mode === "zt") {
    const years = Array.from(new Set(CARDS.flatMap(c => c.years || []))).sort();
    const cur = f.years.length ? String(f.years[0]) : "";
    body += chipSet("年份", [{ v: "", n: "全部" }].concat(years.map(y => ({ v: String(y), n: String(y) })))
      .map(o => ({ k: "year", v: o.v, n: o.n, on: cur === o.v })));
  }
  if (mode === "review") {
    body += chipSet("范围", [{ v: "wrong", n: "错题" }, { v: "star", n: "收藏" }]
      .map(o => ({ k: "rv", v: o.v, n: o.n, on: (f.rv || "wrong") === o.v })));
  }
  if (mode === "obj") {
    body += chipSet("题量", [10, 20, 30].map(x => ({ k: "n", v: String(x), n: x + " 题", on: (f.n || 20) === x })));
  }
  if (mode === "browse") {
    body = `<input class="search-box" id="searchBox" placeholder="搜索术语 / 题干 / 答案…" value="${esc(f.q)}">` + body;
  }

  let pool = [];
  if (mode === "tpl") pool = CARDS.filter(c => c.kind === "tpl");
  else if (mode !== "browse") pool = poolFor(mode, f);
  else pool = applyFilters(CARDS, { book: f.book, ch: f.ch, freq: f.freq, kinds: [], q: f.q });

  const goLabel = mode === "tpl" ? "查看模板" :
    mode === "browse" ? "进入索引 · " + pool.length + " 卡" : "开始 · 共 " + pool.length + " 卡";

  view.innerHTML = `
  <div class="panel">
    <h2>${titles[mode] || mode} · 设置</h2>
    ${body}
    <div class="center" style="margin-top:.9rem">
      ${pool.length ? `<button class="btn" id="btnGo">${goLabel}</button>` :
        `<span style="color:var(--muted);font-size:.85rem">当前筛选没有卡片,请调整条件</span>`}
      <button class="btn ghost" id="btnBack" style="margin-left:.5rem">返回</button>
    </div>
  </div>`;

  $$("#view .chip").forEach(b => b.onclick = () => onChip(b));
  const sb = $("#searchBox");
  if (sb) sb.oninput = () => {
    f.q = sb.value.trim();
    const p = applyFilters(CARDS, { book: f.book, ch: f.ch, freq: f.freq, kinds: [], q: f.q });
    const btn = $("#btnGo");
    if (btn) { btn.textContent = "进入索引 · " + p.length + " 卡"; btn.onclick = () => { store.set.f_browse = f; save(); renderBrowse(p); }; }
  };
  $("#btnBack").onclick = goHome;
  const go = $("#btnGo");
  if (go && !sb) go.onclick = () => {
    store.set["f_" + mode] = f; save();
    if (mode === "obj") startObj(pool, f.n || 20);
    else if (mode === "browse") renderBrowse(pool);
    else { S.pool = pool; startFlash(); }
  };
  else if (go && sb) go.onclick = () => {
    store.set.f_browse = f; save();
    renderBrowse(applyFilters(CARDS, { book: f.book, ch: f.ch, freq: f.freq, kinds: [], q: f.q }));
  };
}
function onChip(b) {
  const f = S.f, k = b.dataset.k, v = b.dataset.v;
  if (k === "kind") {
    const i = f.kinds.indexOf(v);
    if (i >= 0) { if (f.kinds.length > 1) f.kinds.splice(i, 1); }
    else f.kinds.push(v);
  }
  else if (k === "book") { f.book = v; f.ch = "all"; }
  else if (k === "ch") f.ch = v;
  else if (k === "freq") f.freq = v;
  else if (k === "year") f.years = v ? [+v] : [];
  else if (k === "rv") f.rv = v;
  else if (k === "n") f.n = +v;
  renderSetup();
}

/* ================= 闪卡会话 ================= */
function startFlash(keepOrder) {
  S.stage = "flash";
  S.queue = S.pool.slice();
  if (!keepOrder) S.queue.sort(byDue);
  S.idx = 0; S.flipped = false; S.done = 0; S.fails = new Map();
  renderCard();
  setHints("空格 翻面 · 1 不会 / 2 模糊 / 3 会 · S 收藏 · Esc 退出");
}
function curCard() { return S.queue[S.idx]; }
function renderCard() {
  const c = curCard();
  if (!c) return finishSession();
  const st = store.srs[c.id] || {};
  const rev = S.mode === "terms-rev";
  const front = c.kind === "term" ? (rev ? c.def : c.term) : cardFront(c);
  view.innerHTML = `
  <div class="sess-top">
    <div class="left">
      <div class="cnt">${S.idx + 1} / ${S.queue.length} · 本次已刷 ${S.done}</div>
      <div class="progress sm"><i style="width:${S.queue.length ? Math.round(S.idx / S.queue.length * 100) : 100}%"></i></div>
    </div>
    <button class="mini" id="btnQuit">退出</button>
  </div>
  <div class="flash-wrap">
    <div class="flash" id="flash">
      <div class="kind-tag">${tagHtml(c)}
        ${st.b && st.seen ? `<span class="tag">盒${st.b}${st.wrong ? " · 错" + st.wrong : ""}</span>` : ""}</div>
      <button class="star ${st.star ? "on" : ""}" id="btnStar" title="收藏">${st.star ? "★" : "☆"}</button>
      <div class="q-front ${c.kind === "term" ? "" : "small"}">${inline(front)}</div>
      ${S.flipped ? `<div class="a-back">
          ${rev ? `<p class="def-main"><b>${esc(c.term)}</b></p>` : ""}
          ${answerHtml(c)}
        </div>` : `<div class="tap-hint">想一想,然后点这里或按空格翻面</div>`}
    </div>
  </div>
  ${S.flipped ? `<div class="rate">
      <button class="r1" data-r="1">不会 (1)</button>
      <button class="r2" data-r="2">模糊 (2)</button>
      <button class="r3" data-r="3">会 (3)</button>
    </div>` : ""}`;
  $("#btnQuit").onclick = finishSession;
  $("#btnStar").onclick = () => { const r = srsOf(c.id); r.star = r.star ? 0 : 1; save(); renderCard(); };
  $("#flash").onclick = e => {
    if (e.target.closest("details") || e.target.closest("a") || e.target.closest("button") || e.target.closest("img")) return;
    if (!S.flipped) { S.flipped = true; renderCard(); }
  };
  $$(".rate button").forEach(b => b.onclick = () => rate(+b.dataset.r));
}
function rate(r) {
  const c = curCard();
  const rec = srsOf(c.id);
  rec.seen++; rec.lr = r;
  if (r === 1) {
    rec.wrong++; rec.b = 1; rec.due = todayStr();
    const n = (S.fails.get(c.id) || 0) + 1;
    S.fails.set(c.id, n);
    if (n <= 2) S.queue.push(c);
  } else if (r === 2) {
    rec.b = 2; rec.due = addDays(1);
  } else {
    rec.b = Math.min(3, (rec.b || 1) + 1);
    rec.due = rec.b === 3 ? addDays(7) : addDays(3);
  }
  store.today.n++; save();
  S.done++; S.idx++; S.flipped = false;
  refreshBadge();
  renderCard();
}
function finishSession() {
  const st = statCards();
  view.innerHTML = `
  <div class="panel result-card">
    <div class="big">✔</div>
    <h2>本轮完成</h2>
    <p>本轮共刷 ${S.done} 卡 · 今日累计 ${store.today.n} · 总掌握 ${st.b3}/${st.total}</p>
    <button class="btn" id="btnAgain">再刷一轮</button>
    <button class="btn ghost" id="btnHome2" style="margin-left:.5rem">返回首页</button>
  </div>`;
  setHints("");
  $("#btnAgain").onclick = () => openSetup(S.mode);
  $("#btnHome2").onclick = goHome;
}

/* ================= 客观题会话 ================= */
/* 词表:全部真实术语。挖空只挖真实术语,干扰项也只用真实术语。 */
let VOCAB = null, VOCAB_MAP = null;
function buildVocab() {
  if (VOCAB) return VOCAB;
  VOCAB_MAP = new Map();
  CARDS.forEach(c => {
    if (c.kind === "term" && c.term && c.term.length >= 2 && !VOCAB_MAP.has(c.term)) VOCAB_MAP.set(c.term, c);
  });
  VOCAB = Array.from(VOCAB_MAP.keys()).sort((a, b) => b.length - a.length);
  return VOCAB;
}
function findBlank(def, ownTerm) {
  const vocab = buildVocab();
  let best = null;
  for (const t of vocab) {           // 按长度降序,取定义中出现的最长真实术语
    if (t.length > 12) continue;
    if (def.includes(t) && (!best || t.length > best.length)) best = t;
  }
  if (ownTerm && ownTerm.length >= 2 && def.includes(ownTerm)) return ownTerm; // 优先挖术语本身
  return best;
}
function termDistractors(card, t, k) {
  const chSet = new Set((card.books || []).map(b => b.c).filter(Boolean));
  const same = [], rest = [];
  for (const [term, cc] of VOCAB_MAP) {
    if (term === t || Math.abs(term.length - t.length) > 2) continue;
    ((cc.books || []).some(b => chSet.has(b.c)) ? same : rest).push(term);
  }
  return shuffle(same).concat(shuffle(rest)).slice(0, k);
}
function distractorCards(c, cards, k) {
  const sameCh = cards.filter(x => x.id !== c.id && x.term !== c.term &&
    x.books.some(b => c.books.some(y => y.c && y.c === b.c)));
  const rest = shuffle(cards.filter(x => x.id !== c.id && x.term !== c.term && !sameCh.includes(x)));
  return shuffle(sameCh.slice(0, k * 2).concat(rest).slice(0, k));
}
function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n) + "…" : s; }
function mkMatch(c, cards) {
  const ds = termDistractors(c, c.term, 3);
  return { type: "match", card: c, stem: c.def, opts: shuffle([c.term].concat(ds)), ans: c.term };
}
function mkRev(c, cards) {
  const ds = distractorCards(c, cards, 3).map(x => trunc(x.def, 56)).filter(t => t !== trunc(c.def, 56)).slice(0, 3);
  return { type: "rev", card: c, stem: c.term, opts: shuffle([trunc(c.def, 56)].concat(ds)), ans: trunc(c.def, 56) };
}
function mkCloze(c, cards) {
  const t = findBlank(c.def, c.term);
  if (!t) return null;
  const stem = c.def.split(t).join("______");
  if (stem === c.def) return null;
  const ds = termDistractors(c, t, 3);
  if (ds.length < 3) return null;
  return { type: "cloze", card: c, stem, opts: shuffle([t].concat(ds)), ans: t };
}
function startObj(pool, n) {
  const cards = pool.filter(c => c.def && c.term);
  const order = shuffle(cards.slice()).slice(0, n);
  const qs = [];
  for (const c of order) {
    const roll = Math.random();
    if (roll < 0.4) qs.push(mkMatch(c, cards));
    else if (roll < 0.7) qs.push(mkRev(c, cards));
    else { const q = mkCloze(c, cards); qs.push(q || mkMatch(c, cards)); }
  }
  OBJ = { qs, i: 0, ok: 0, answered: false };
  S = { mode: "obj", stage: "obj" };
  renderObj();
  setHints("1-4 选择 · Enter 下一题 · Esc 退出");
}
function renderObj() {
  const q = OBJ.qs[OBJ.i];
  if (!q) return finishObj();
  const typeName = { match: "定义 → 选术语", rev: "术语 → 选定义", cloze: "挖空填词" }[q.type];
  view.innerHTML = `
  <div class="sess-top">
    <div class="left">
      <div class="cnt">${OBJ.i + 1} / ${OBJ.qs.length} · 已对 ${OBJ.ok}</div>
      <div class="progress sm"><i style="width:${Math.round(OBJ.i / OBJ.qs.length * 100)}%"></i></div>
    </div>
    <button class="mini" id="btnQuit">退出</button>
  </div>
  <div class="flash">
    <div class="obj-meta">⚡ ${typeName} · ${KIND_NAME[q.card.kind]}</div>
    <div class="q-stem">${inline(q.stem)}</div>
    <div class="opts">${q.opts.map((o, i) =>
      `<button class="opt" data-i="${i}"><span class="lab">${"ABCD"[i]}</span>${esc(o)}</button>`).join("")}
    </div>
    <div id="objFb"></div>
  </div>`;
  $("#btnQuit").onclick = finishObj;
  $$(".opt").forEach(b => b.onclick = () => answerObj(+b.dataset.i));
}
function answerObj(i) {
  if (OBJ.answered) return;
  OBJ.answered = true;
  const q = OBJ.qs[OBJ.i];
  const right = q.opts[i] === q.ans;
  if (right) OBJ.ok++;
  else store.objWrong.push({ id: q.card.id, t: todayStr() });
  const rec = srsOf(q.card.id);
  rec.seen++;
  if (right) { rec.b = Math.min(3, (rec.b || 1) + 1); rec.due = rec.b === 3 ? addDays(7) : addDays(3); }
  else { rec.wrong++; rec.b = 1; rec.due = todayStr(); }
  store.today.n++; save(); refreshBadge();
  $$(".opt").forEach((b, j) => {
    if (q.opts[j] === q.ans) b.classList.add("ok");
    else if (j === i) b.classList.add("no");
  });
  $("#objFb").innerHTML = `
    <p style="margin:.6rem 0 .3rem;font-weight:700;color:${right ? "var(--ok)" : "var(--bad)"}">
      ${right ? "✓ 正确" : "✗ 正确答案:" + esc(q.ans)}</p>
    <button class="btn" id="btnNext">${OBJ.i + 1 < OBJ.qs.length ? "下一题" : "看结果"}</button>`;
  $("#btnNext").onclick = nextObj;
  $("#btnNext").focus();
}
function nextObj() { OBJ.i++; OBJ.answered = false; renderObj(); }
function finishObj() {
  const pct = OBJ.qs.length ? Math.round(OBJ.ok / OBJ.qs.length * 100) : 0;
  view.innerHTML = `
  <div class="panel result-card">
    <div class="big">${pct} 分</div>
    <p>答对 ${OBJ.ok} / ${OBJ.qs.length}</p>
    <p style="font-size:.85rem">错题已记入错题本(首页「错题/收藏」可重刷)</p>
    <button class="btn" id="btnAgain">再来一组</button>
    <button class="btn ghost" id="btnHome2" style="margin-left:.5rem">返回首页</button>
  </div>`;
  setHints("");
  $("#btnAgain").onclick = () => openSetup("obj");
  $("#btnHome2").onclick = goHome;
}

/* ================= 真题整卷 ================= */
function paperCardsOf(year) {
  const order = { term: 0, short: 1, essay: 2, analysis: 3 };
  return CARDS.filter(c => order[c.kind] !== undefined && (c.years || []).includes(year))
    .sort((a, b) => (order[a.kind] - order[b.kind]) || (a.no - b.no));
}
function renderPaperPicker() {
  const years = Array.from(new Set(CARDS.flatMap(c => c.years || []))).sort((a, b) => b - a);
  view.innerHTML = `
  <div class="panel">
    <h2>真题整卷 · 选择年份</h2>
    <div class="sub" style="color:var(--muted);font-size:.85rem;margin-bottom:.7rem">按题型分组还原卷面;分值为该题型的惯例参考分</div>
    <div class="grid">${years.map(y => {
    const n = paperCardsOf(y).length;
    return `<button class="mode" data-year="${y}"><span class="ico">📄</span><b>${y} 年卷</b><span>${n} 题</span></button>`;
  }).join("")}</div>
    <div class="center" style="margin-top:.9rem"><button class="btn ghost" id="btnBack">返回</button></div>
  </div>`;
  $("#btnBack").onclick = goHome;
  $$("#view .mode").forEach(b => b.onclick = () => renderPaper(+b.dataset.year));
}
function renderPaper(year) {
  S = { mode: "paper", stage: "paper", year };
  const cards = paperCardsOf(year);
  const secNo = ["一", "二", "三", "四"];
  const secs = [];
  ["term", "short", "essay", "analysis"].forEach(k => {
    const list = cards.filter(c => c.kind === k);
    if (list.length) secs.push({ k, list });
  });
  let qn = 0;
  view.innerHTML = `
  <div class="sess-top">
    <div class="left"><div class="cnt">${year} 年真题 · 共 ${cards.length} 题</div></div>
    <button class="mini" id="btnQuit">返回</button>
  </div>
  <div class="paper-head">
    <b>${year} 年运动生理学试卷(整理版)</b>
    <div style="font-size:.8rem;color:var(--muted);margin-top:.3rem">
      ${secs.map(s => KIND_NAME[s.k] + "×" + s.list.length).join(" · ")} · 分值为题型惯例参考
    </div>
    <div style="margin-top:.7rem">
      <button class="btn" id="btnPaperGo">按卷面顺序整卷刷</button>
      <button class="btn ghost" id="btnPaperShuffle" style="margin-left:.4rem">乱序刷</button>
    </div>
  </div>
  ${secs.map((s, i) => `
    <div class="paper-sec">${secNo[i]}、${KIND_NAME[s.k]}(共 ${s.list.length} 题,${KIND_SCORE[s.k]})</div>
    ${s.list.map(c => {
    qn++;
    const st = store.srs[c.id] || {};
    const front = cardFront(c);
    return `<details class="pq" data-id="${c.id}">
        <summary><span class="no">${qn}.</span><span style="flex:1">${esc(trunc(front, 80))}</span>
          ${c.freq === "高频" ? '<span class="st" style="color:var(--brand);font-size:.72rem">高频</span>' : ""}
          <span class="score">${(st.b === 3 ? "✓ " : "") + (st.star ? "★" : "")}</span>
        </summary>
        <div class="inner">
          ${answerHtml(c)}
          <button class="btn ghost mini pv-star" data-id="${c.id}">${st.star ? "★ 已收藏" : "☆ 收藏"}</button>
        </div>
      </details>`;
  }).join("")}`).join("")}`;
  $("#btnQuit").onclick = goHome;
  $("#btnPaperGo").onclick = () => {
    S = { mode: "zt", f: { book: "zt", ch: "all", freq: "", kinds: ["term", "short", "essay", "analysis"], years: [year], q: "" }, stage: "setup" };
    S.pool = cards.slice(); S.paperOrder = true;
    startFlash(true);
  };
  $("#btnPaperShuffle").onclick = () => {
    S = { mode: "zt", f: { book: "zt", ch: "all", freq: "", kinds: ["term", "short", "essay", "analysis"], years: [year], q: "" }, stage: "setup" };
    S.pool = shuffle(cards.slice()); S.paperOrder = true;
    startFlash(true);
  };
  $$(".pv-star").forEach(b => b.onclick = e => {
    e.stopPropagation();
    const r = srsOf(b.dataset.id);
    r.star = r.star ? 0 : 1; save();
    b.textContent = r.star ? "★ 已收藏" : "☆ 收藏";
  });
}

/* ================= 浏览(考点索引) ================= */
function renderBrowse(pool) {
  S.stage = "browse";
  const groups = new Map();
  pool.forEach(c => {
    const b = c.books[0] || {};
    const key = (b.b || "未分组") + "|" + (b.c || "未分章");
    if (!groups.has(key)) groups.set(key, { bk: b.b || "未分组", ch: b.c || "未分章", list: [] });
    groups.get(key).list.push(c);
  });
  const arr = Array.from(groups.values()).sort((a, b) => a.bk.localeCompare(b.bk) || a.ch.localeCompare(b.ch, "zh"));
  view.innerHTML = `
  <div class="sess-top">
    <div class="left"><div class="cnt">共 ${pool.length} 卡 · 点击条目查看答案</div></div>
    <button class="mini" id="btnQuit">返回</button>
  </div>
  ${arr.map((g, i) => `
    <details class="chap" ${i === 0 ? "open" : ""}>
      <summary><span>${esc(g.bk)} · ${esc(g.ch)}</span><span class="n">${g.list.length}</span></summary>
      <div class="list">${g.list.map(c => {
    const st = store.srs[c.id] || {};
    return `<div class="row-item" data-id="${c.id}">
          <span class="k">${KIND_NAME[c.kind]}</span>
          <span class="t" style="flex:1">${esc(trunc(cardFront(c), 60))}</span>
          ${c.freq === "高频" ? '<span class="st">高频</span>' : ""}
          ${st.star ? '<span class="st">★</span>' : ""}
          ${st.b === 3 ? '<span class="done">✓</span>' : ""}
        </div>`;
  }).join("")}</div>
    </details>`).join("")}`;
  $("#btnQuit").onclick = goHome;
  $$(".row-item").forEach(r => r.onclick = () => previewCard(r.dataset.id));
}
function previewCard(id) {
  const c = CARDS.find(x => x.id === id);
  if (!c) return;
  const st = srsOf(c.id);
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center";
  div.innerHTML = `
    <div style="background:var(--card);border-radius:18px 18px 0 0;max-width:860px;width:100%;max-height:86vh;overflow:auto;padding:1.1rem 1.1rem 2rem">
      <div class="kind-tag">${tagHtml(c)}</div>
      <div class="q-front small">${inline(cardFront(c))}</div>
      ${c.kind === "term" && c.def ? '<p class="def-main">' + inline(c.def) + "</p>" : ""}
      ${answerHtml(c)}
      <div class="center" style="margin-top:1rem">
        <button class="btn ghost" id="pvStar">${st.star ? "★ 已收藏" : "☆ 收藏"}</button>
        <button class="btn" id="pvClose">关闭</button>
      </div>
    </div>`;
  document.body.appendChild(div);
  div.onclick = e => { if (e.target === div) div.remove(); };
  $("#pvClose", div).onclick = () => div.remove();
  $("#pvStar", div).onclick = () => { st.star = st.star ? 0 : 1; save(); div.remove(); };
}

/* ================= 键盘 ================= */
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (!S) return;
  if (S.stage === "flash") {
    if (e.key === " ") { e.preventDefault(); if (!S.flipped) { S.flipped = true; renderCard(); } }
    else if (S.flipped && ["1", "2", "3"].includes(e.key)) rate(+e.key);
    else if (e.key.toLowerCase() === "s") { const c = curCard(); if (c) { const r = srsOf(c.id); r.star = r.star ? 0 : 1; save(); renderCard(); } }
    else if (e.key === "Escape") finishSession();
  } else if (S.stage === "obj" && OBJ) {
    if (["1", "2", "3", "4"].includes(e.key) && !OBJ.answered) answerObj(+e.key - 1);
    else if (e.key === "Enter" && OBJ.answered) nextObj();
    else if (e.key === "Escape") finishObj();
  }
});

/* ================= 主题 / 顶栏 ================= */
function applyTheme() {
  document.documentElement.dataset.theme = store.set.theme === "dark" ? "dark" : "";
  $("#btnDark").textContent = store.set.theme === "dark" ? "🌙" : "🌓";
}
$("#btnDark").onclick = () => {
  store.set.theme = store.set.theme === "dark" ? "light" : "dark";
  save(); applyTheme();
};
$("#btnHome").onclick = goHome;
function refreshBadge() { $("#todayBadge").textContent = "今日 " + store.today.n; }

/* ================= 启动 ================= */
(function init() {
  applyTheme();
  refreshBadge();
  renderHome();
})();
