import appCss from './index.css?raw'
import type { LogEntry } from './types'

function embedJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTextLogs(entries: LogEntry[], filename: string) {
  const text = entries.map((e) => e.raw).join('\n\n')
  downloadBlob(text, filename, 'text/plain;charset=utf-8')
}

export function downloadStandaloneHtml(entries: LogEntry[], filename: string) {
  downloadBlob(buildStandaloneHtml(entries), filename, 'text/html;charset=utf-8')
}

export function buildStandaloneHtml(entries: LogEntry[]): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Log Fitter · 日志查看</title>
  <style>
${appCss}

.log-row {
  position: relative;
  transform: none !important;
  width: 100%;
}
.log-list-static {
  flex: 1;
  min-height: 0;
  overflow: auto;
  background: #16181c;
}
  </style>
</head>
<body>
  <div class="app">
    <header class="toolbar">
      <div class="brand">
        <span class="logo" aria-hidden="true"></span>
        <div>
          <h1>Log Fitter</h1>
          <p>双击打开的独立日志查看器</p>
        </div>
      </div>
      <div class="toolbar-actions">
        <button type="button" class="btn" id="btnTxt">导出 TXT</button>
      </div>
    </header>
    <section class="filters">
      <label class="search">
        <span class="search-icon">⌕</span>
        <input id="q" placeholder="过滤日志（消息 / 堆栈 / 标签）" spellcheck="false" />
      </label>
      <label class="toggle" id="togCase"><input type="checkbox" /> Aa</label>
      <label class="toggle" id="togRe"><input type="checkbox" /> .*</label>
      <label class="toggle" id="togInv"><input type="checkbox" /> 反向</label>
      <label class="toggle" id="togCol"><input type="checkbox" /> 折叠相同</label>
      <label class="select">标签
        <select id="tag"><option value="all">全部</option></select>
      </label>
      <div class="level-toggles" id="levels"></div>
    </section>
    <main class="workspace">
      <div class="log-list-static" id="list"></div>
      <section class="detail" id="detail" style="height:220px">
        <div class="splitter" id="splitter"></div>
        <div class="detail-empty" id="detailEmpty">选择一条日志，查看完整内容与堆栈</div>
        <div class="detail-body" id="detailBody" hidden>
          <header class="detail-meta" id="detailMeta"></header>
          <pre class="detail-raw" id="detailRaw"></pre>
        </div>
      </section>
    </main>
    <footer class="status">
      <span>独立 HTML · 可双击打开</span>
      <span id="stat"></span>
      <span>↑↓ 选择</span>
    </footer>
  </div>
  <script>
  window.__LOGS__ = ${embedJson(entries)};
  ${standaloneViewerSource()}
  </script>
</body>
</html>
`
}

function standaloneViewerSource(): string {
  return `
(function () {
  var LEVELS = ['verbose', 'debug', 'info', 'warning', 'error'];
  var LABEL = { verbose: 'Verbose', debug: 'Debug', info: 'Info', warning: 'Warning', error: 'Error' };
  var SHORT = { verbose: 'V', debug: 'D', info: 'I', warning: 'W', error: 'E' };
  var entries = window.__LOGS__ || [];
  var state = {
    q: '', regex: false, caseSensitive: false, invert: false, collapse: false, tag: 'all',
    levels: { verbose: true, debug: true, info: true, warning: true, error: true },
    selected: entries[0] ? entries[0].id : null,
    detailH: 220
  };

  var listEl = document.getElementById('list');
  var tagEl = document.getElementById('tag');
  var levelsEl = document.getElementById('levels');
  var qEl = document.getElementById('q');
  var statEl = document.getElementById('stat');
  var detail = document.getElementById('detail');
  var detailEmpty = document.getElementById('detailEmpty');
  var detailBody = document.getElementById('detailBody');
  var detailMeta = document.getElementById('detailMeta');
  var detailRaw = document.getElementById('detailRaw');

  var tags = Array.from(new Set(entries.map(function (e) { return e.tag; }).filter(Boolean))).sort();
  tags.forEach(function (t) {
    var o = document.createElement('option');
    o.value = t; o.textContent = t; tagEl.appendChild(o);
  });

  LEVELS.forEach(function (lv) {
    var n = entries.filter(function (e) { return e.level === lv; }).length;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'level-btn ' + lv + ' on';
    b.innerHTML = '<i></i>' + LABEL[lv] + '<b>' + n + '</b>';
    b.onclick = function () {
      state.levels[lv] = !state.levels[lv];
      b.classList.toggle('on', state.levels[lv]);
      render();
    };
    levelsEl.appendChild(b);
  });

  function bindToggle(id, key) {
    var el = document.getElementById(id);
    var input = el.querySelector('input');
    el.onclick = function (e) {
      if (e.target !== input) input.checked = !input.checked;
      state[key] = input.checked;
      el.classList.toggle('on', input.checked);
      render();
    };
  }
  bindToggle('togCase', 'caseSensitive');
  bindToggle('togRe', 'regex');
  bindToggle('togInv', 'invert');
  bindToggle('togCol', 'collapse');
  tagEl.onchange = function () { state.tag = tagEl.value; render(); };
  qEl.oninput = function () { state.q = qEl.value; render(); };

  document.getElementById('btnTxt').onclick = function () {
    var text = apply().rows.map(function (r) { return r.entry.raw; }).join('\\n\\n');
    var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'filtered-logs.txt';
    a.click();
  };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function apply() {
    var q = state.q.trim();
    var matcher = null;
    var error = null;
    if (q) {
      try {
        if (state.regex) {
          var re = new RegExp(q, state.caseSensitive ? '' : 'i');
          matcher = function (t) { return re.test(t); };
        } else if (state.caseSensitive) {
          matcher = function (t) { return t.indexOf(q) !== -1; };
        } else {
          var low = q.toLowerCase();
          matcher = function (t) { return t.toLowerCase().indexOf(low) !== -1; };
        }
      } catch (e) { error = '正则表达式无效'; }
    }
    var filtered = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!state.levels[e.level]) continue;
      if (state.tag !== 'all' && e.tag !== state.tag) continue;
      if (matcher) {
        var hit = matcher(e.timestamp + ' ' + e.tag + ' ' + e.message + ' ' + e.raw);
        if (state.invert ? hit : !hit) continue;
      }
      filtered.push(e);
    }
    var rows = [];
    if (!state.collapse) {
      rows = filtered.map(function (entry) { return { entry: entry, count: 1 }; });
    } else {
      for (var j = 0; j < filtered.length; j++) {
        var item = filtered[j];
        var key = item.level + '\\0' + item.tag + '\\0' + item.message;
        var last = rows[rows.length - 1];
        if (last && last.key === key) { last.count++; continue; }
        rows.push({ key: key, entry: item, count: 1 });
      }
    }
    return { rows: rows, matched: filtered.length, error: error };
  }

  function render() {
    var res = apply();
    var html = '';
    if (!res.rows.length) {
      html = '<div class="log-empty-filter">没有匹配的日志，试试放宽过滤条件。</div>';
    } else {
      for (var i = 0; i < res.rows.length; i++) {
        var row = res.rows[i];
        var e = row.entry;
        var sel = e.id === state.selected ? ' selected' : '';
        var alt = i % 2 ? ' alt' : '';
        html += '<button type="button" class="log-row level-' + e.level + sel + alt + '" data-id="' + e.id + '">'
          + '<span class="lvl lvl-' + e.level + '">' + SHORT[e.level] + '</span>'
          + '<span class="log-time">' + esc(e.timestamp || '—') + '</span>'
          + '<span class="log-tag' + (e.tag ? '' : ' dim') + '">' + esc(e.tag || '—') + '</span>'
          + '<span class="log-msg">' + esc(e.message) + '</span>'
          + (row.count > 1 ? '<span class="log-count">' + row.count + '</span>' : '')
          + '</button>';
      }
    }
    listEl.innerHTML = html;
    statEl.textContent = '显示 ' + res.matched + ' / ' + entries.length + ' 条';
    showDetail();
  }

  function showDetail() {
    var e = null;
    for (var i = 0; i < entries.length; i++) if (entries[i].id === state.selected) e = entries[i];
    if (!e) {
      detailEmpty.hidden = false;
      detailBody.hidden = true;
      return;
    }
    detailEmpty.hidden = true;
    detailBody.hidden = false;
    var src = e.sourceFile ? ('<span class="source">' + esc(e.sourceFile) + (e.sourceLine ? ':' + e.sourceLine : '') + '</span>') : '';
    detailMeta.innerHTML = '<span class="lvl lvl-' + e.level + '">' + LABEL[e.level] + '</span>'
      + (e.timestamp ? '<span>' + esc(e.timestamp) + '</span>' : '')
      + (e.tag ? '<span class="chip">' + esc(e.tag) + '</span>' : '')
      + src
      + '<button type="button" class="btn ghost" id="copyBtn">复制</button>';
    detailRaw.textContent = e.raw;
    var copyBtn = document.getElementById('copyBtn');
    if (copyBtn) copyBtn.onclick = function () { navigator.clipboard.writeText(e.raw); };
  }

  listEl.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('.log-row') : null;
    if (!btn) return;
    state.selected = Number(btn.getAttribute('data-id'));
    render();
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.target && (ev.target.tagName === 'INPUT' || ev.target.tagName === 'TEXTAREA')) return;
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    var rows = apply().rows;
    if (!rows.length) return;
    var idx = -1;
    for (var i = 0; i < rows.length; i++) if (rows[i].entry.id === state.selected) idx = i;
    if (ev.key === 'ArrowDown') idx = Math.min(rows.length - 1, idx + 1);
    else idx = Math.max(0, idx <= 0 ? 0 : idx - 1);
    state.selected = rows[idx].entry.id;
    render();
    var sel = listEl.querySelector('.selected');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest' });
  });

  var splitter = document.getElementById('splitter');
  splitter.onpointerdown = function (ev) {
    ev.preventDefault();
    var startY = ev.clientY;
    var startH = state.detailH;
    function move(e) {
      state.detailH = Math.max(120, Math.min(480, startH + (startY - e.clientY)));
      detail.style.height = state.detailH + 'px';
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  render();
})();
`
}
