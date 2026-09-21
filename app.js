/* whatsapp-analyzer / app.js — UI sin dependencias. Todo local. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    fileName: '', messages: [], groups: [], group: '', result: null, authors: [],
    support: [], monthFiltered: [], filtered: [], page: 0, perPage: 100,
    month: '', gran: 'week', chartBuckets: [], chartBound: false
  };

  function monthLabel(key) {
    var p = String(key).split('-');
    return new Date(+p[0], +p[1] - 1, 1).toLocaleString('es', { month: 'short', year: 'numeric' });
  }

  function fmtDate(d) {
    if (!d) return '—';
    d = d instanceof Date ? d : new Date(d);
    return d.toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDur(min) {
    if (min == null) return '—';
    if (min < 1) return '< 1 min';
    if (min < 60) return (Math.round(min * 10) / 10) + ' min';
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    if (h < 48) return h + ' h ' + m + ' min';
    return Math.floor(h / 24) + ' d ' + (h % 24) + ' h';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- carga ----------
  var drop = $('dropZone'), input = $('fileInput');
  drop.addEventListener('click', function () { input.click(); });
  drop.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') input.click(); });
  ['dragover', 'dragenter'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = '#22c55e'; });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.style.borderColor = ''; });
  });
  drop.addEventListener('drop', function (e) {
    if (e.dataTransfer.files.length) loadFiles(Array.prototype.slice.call(e.dataTransfer.files));
  });
  input.addEventListener('change', function () {
    if (input.files.length) loadFiles(Array.prototype.slice.call(input.files));
    input.value = '';
  });
  $('btnReset').addEventListener('click', function () {
    $('dashboard').hidden = true; drop.style.display = ''; $('btnReset').hidden = true;
    state.messages = []; state.groups = []; state.group = ''; state.result = null;
  });

  function shortName(name) {
    var b = String(name).replace(/\.txt$/i, '').trim() || 'grupo';
    return b.length > 40 ? b.slice(0, 40) + '…' : b;
  }

  function loadFiles(files) {
    files = files.filter(function (f) { return /\.txt$/i.test(f.name) || f.type === 'text/plain'; });
    if (!files.length) { alert('Elige archivos .txt exportados de WhatsApp.'); return; }
    $('loadProgress').hidden = false;
    var reads = files.map(function (f) {
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve({ name: f.name, text: r.result }); };
        r.onerror = reject;
        r.readAsText(f, 'utf-8');
      });
    });
    Promise.all(reads).then(function (docs) {
      try {
        var used = {};
        state.messages = [];
        state.groups = docs.map(function (d) {
          var g = shortName(d.name), base = g, k = 2;
          while (used[g]) g = base + ' (' + (k++) + ')';
          used[g] = 1;
          var msgs = WAParser.parseChat(d.text);
          if (!msgs.length) throw new Error('Sin mensajes reconocidos en ' + d.name);
          msgs.forEach(function (m) { m.grp = g; });
          state.messages = state.messages.concat(msgs);
          return { name: g, file: d.name, count: msgs.length };
        });
        state.messages.sort(function (a, b) { return a.dt - b.dt; });
        state.group = '';
        var sugg = WAParser.suggestSupport(state.messages, 8).map(function (s) { return s.name; });
        state.support = sugg;
        state.authors = uniqueAuthors(state.messages);
        $('loadProgress').hidden = true;
        drop.style.display = 'none';
        $('dashboard').hidden = false;
        $('btnReset').hidden = false;
        $('fileName').textContent = docs.length > 1 ? docs.length + ' archivos' : docs[0].name;
        $('fileMeta').textContent = state.messages.length.toLocaleString('es-GT') + ' mensajes · ' +
          state.groups.map(function (g) { return g.name + ' (' + g.count.toLocaleString('es-GT') + ')'; }).join(' · ');
        buildRoster();
        recompute();
      } catch (err) {
        $('loadProgress').hidden = true;
        alert('Error: ' + err.message);
      }
    }, function () {
      $('loadProgress').hidden = true;
      alert('No se pudieron leer los archivos.');
    });
  }

  function uniqueAuthors(msgs) {
    var seen = {}, out = [];
    msgs.forEach(function (m) {
      if (m.author && !WAParser.isSystem(m) && !seen[m.author]) { seen[m.author] = 1; out.push(m.author); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, 'es'); });
  }

  // ---------- ejemplo ----------
  $('btnDemo').addEventListener('click', function () {
    var demo = [
      '23/12/2025, 2:04 p. m. - +502 3312 0954: 15159299 ME APOYAS CON ACTIVACION DE MTA NO SINCRONIZA',
      '23/12/2025, 2:06 p. m. - Katerin Lopez: Listo',
      '23/12/2025, 2:10 p. m. - Chinq: 15174172 regularizar por favor',
      '23/12/2025, 2:11 p. m. - +502 3312 4675: .',
      '23/12/2025, 2:12 p. m. - Katerin Lopez: Listo se actualiza, mismo codigo',
      '23/12/2025, 3:00 p. m. - +502 3312 4121: 15179999 me ayudas activando mta porfa',
      '23/12/2025, 3:05 p. m. - +502 3312 6431: Sigue sin funcionar el código de bbi 15179999',
      '23/12/2025, 5:00 p. m. - Luis: listo, cm: 89691870 para 15179999',
      '24/12/2025, 9:00 a. m. - +502 3312 0882: Ot 16265379 apoyo activando el mta'
    ].join('\n');
    state.fileName = 'ejemplo.txt';
    state.messages = WAParser.parseChat(demo);
    state.messages.forEach(function (m) { m.grp = 'ejemplo'; });
    state.groups = [{ name: 'ejemplo', file: 'ejemplo.txt', count: state.messages.length }];
    state.group = '';
    state.support = ['Katerin Lopez', 'Luis'];
    state.authors = uniqueAuthors(state.messages);
    drop.style.display = 'none';
    $('dashboard').hidden = false;
    $('btnReset').hidden = false;
    $('fileName').textContent = 'ejemplo.txt (datos de prueba)';
    $('fileMeta').textContent = state.messages.length + ' mensajes de ejemplo';
    buildRoster();
    recompute();
  });

  // ---------- roster ----------
  function buildRoster() {
    var box = $('rosterList'); box.innerHTML = '';
    state.authors.forEach(function (a) {
      var lab = document.createElement('label');
      var cb = document.createElement('input');
      cb.type = 'checkbox'; cb.value = a;
      cb.checked = state.support.indexOf(a) !== -1;
      cb.addEventListener('change', function () {
        if (cb.checked) state.support.push(a);
        else state.support = state.support.filter(function (x) { return x !== a; });
        $('rosterCount').textContent = state.support.length;
        recompute();
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(a));
      box.appendChild(lab);
    });
    $('rosterCount').textContent = state.support.length;
  }
  $('btnRoster').addEventListener('click', function () {
    var p = $('rosterPanel'); p.hidden = !p.hidden;
  });

  // ---------- cómputo ----------
  $('optWindow').addEventListener('change', recompute);
  $('optSupportOnly').addEventListener('change', recompute);
  $('optPlusOne').addEventListener('change', recompute);
  $('fMonth').addEventListener('change', function () { state.month = this.value; renderAll(); });
  $('fGroup').addEventListener('change', function () { state.group = this.value; renderAll(); });
  $('optGran').addEventListener('change', function () { state.gran = this.value; renderChart(); });

  function recompute() {
    if (!state.messages.length) return;
    // Análisis separado por grupo: las respuestas nunca cruzan de un grupo a otro.
    var opts = {
      windowHours: parseInt($('optWindow').value, 10),
      supportOnly: $('optSupportOnly').checked,
      supportSet: state.support,
      plusOne: $('optPlusOne').checked
    };
    var merged = [];
    state.groups.forEach(function (g) {
      var gm = state.messages.filter(function (m) { return m.grp === g.name; });
      var r = WAParser.analyze(gm, opts);
      r.tickets.forEach(function (t) { t.grp = g.name; });
      merged = merged.concat(r.tickets);
    });
    merged.sort(function (a, b) { return b.requestedAt - a.requestedAt; });
    state.result = { tickets: merged };
    buildGroupOptions();
    buildMonthOptions();
    renderAll();
  }

  function buildGroupOptions() {
    var sel = $('fGroup'), cur = state.group;
    var names = state.groups.map(function (g) { return g.name; });
    sel.innerHTML = '<option value="">Todos (' + names.length + ' grupos)</option>' + names.map(function (n) {
      return '<option value="' + esc(n) + '"' + (n === cur ? ' selected' : '') + '>' + esc(n) + '</option>';
    }).join('');
    if (cur && names.indexOf(cur) === -1) state.group = '';
  }

  function buildMonthOptions() {
    var seen = {}, keys = [];
    state.result.tickets.forEach(function (t) {
      var k = WAParser.monthKey(t.requestedAt);
      if (!seen[k]) { seen[k] = 1; keys.push(k); }
    });
    keys.sort();
    var sel = $('fMonth'), cur = state.month;
    sel.innerHTML = '<option value="">Todos</option>' + keys.map(function (k) {
      return '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + esc(monthLabel(k)) + '</option>';
    }).join('');
    if (cur && !seen[cur]) state.month = '';
  }

  function renderAll() {
    if (!state.result) return;
    var pool = state.group
      ? state.result.tickets.filter(function (t) { return t.grp === state.group; })
      : state.result.tickets;
    state.monthFiltered = state.month
      ? pool.filter(function (t) { return WAParser.monthKey(t.requestedAt) === state.month; })
      : pool;
    var scope = (state.group ? ' · ' + state.group : '') + (state.month ? ' · ' + monthLabel(state.month) : '');
    var s = WAParser.summarize(state.monthFiltered);
    s.windowHours = parseInt($('optWindow').value, 10);
    renderKpis(s, scope);
    renderTops(WAParser.topFrom(state.monthFiltered, 'requester', 10),
               WAParser.topFrom(state.monthFiltered, 'responder', 10));
    state.page = 0;
    applyFilters();
    renderChart();
  }

  function renderKpis(s, suffix) {
    var el = $('kpis');
    el.innerHTML =
      kpi(s.total.toLocaleString('es-GT'), 'tickets con código' + suffix) +
      kpi(s.responded.toLocaleString('es-GT') + ' (' + s.responseRate + '%)', 'respondidos', 'good') +
      kpi(s.pending.toLocaleString('es-GT'), 'pendientes', s.pending ? 'bad' : '') +
      kpi(fmtDur(s.medianMinutes), 'mediana 1ª respuesta') +
      kpi(fmtDur(s.p90Minutes), 'p90 1ª respuesta', 'warn') +
      kpi(fmtDur(s.avgMinutes), 'promedio 1ª respuesta');
    function kpi(v, l, cls) {
      return '<div class="kpi ' + (cls || '') + '"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>';
    }
  }

  function renderTops(topReq, topResp) {
    $('topReq').innerHTML = topReq.map(function (r) {
      return '<li>' + esc(r.name) + ' <span>(' + r.count + ' tickets)</span></li>';
    }).join('') || '<li class="muted">Sin datos</li>';
    $('topResp').innerHTML = topResp.map(function (r) {
      return '<li>' + esc(r.name) + ' <span>(' + r.count + ' respuestas)</span></li>';
    }).join('') || '<li class="muted">Sin datos</li>';
  }

  function renderChart() {
    var res = state.result;
    if (!res) return;
    var cv = $('chart'), ctx = cv.getContext('2d');
    var W = cv.width = Math.max(300, cv.parentElement.clientWidth), H = cv.height = 190;
    var padB = 24, padT = 20;
    ctx.clearRect(0, 0, W, H);
    var msgs = state.messages.filter(function (m) {
      return !WAParser.isSystem(m) && (!state.group || m.grp === state.group);
    });
    if (!msgs.length) return;
    var cticks = state.group
      ? res.tickets.filter(function (t) { return t.grp === state.group; })
      : res.tickets;
    var buckets = state.gran === 'month'
      ? monthBuckets(msgs, cticks)
      : weekBuckets(msgs, cticks);
    state.chartBuckets = buckets;
    var max = 1;
    buckets.forEach(function (b) { max = Math.max(max, b.msgs); });
    // leyenda
    ctx.font = '11px system-ui'; ctx.textAlign = 'left';
    ctx.fillStyle = '#2563eb'; ctx.fillRect(4, 4, 10, 10);
    ctx.fillStyle = '#93a1b3'; ctx.fillText('mensajes', 18, 13);
    ctx.fillStyle = '#22c55e'; ctx.fillRect(100, 4, 10, 10);
    ctx.fillStyle = '#93a1b3'; ctx.fillText('tickets nuevos', 114, 13);
    var bw = W / buckets.length;
    buckets.forEach(function (b, i) {
      var dim = state.month && b.months.indexOf(state.month) === -1;
      ctx.globalAlpha = dim ? 0.25 : 1;
      var h = (b.msgs / max) * (H - padB - padT);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(i * bw + 1, H - padB - h, Math.max(1, bw - 2), h);
      var th = (b.ticks / max) * (H - padB - padT);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(i * bw + 1, H - padB - Math.max(2, th), Math.max(1, bw - 2), Math.max(2, th));
      ctx.globalAlpha = 1;
      if (b.showLabel && bw > 22) {
        ctx.fillStyle = '#93a1b3'; ctx.font = '10px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(b.label, i * bw + bw / 2, H - 8);
        ctx.textAlign = 'left';
      }
    });
    bindChartTip();
  }

  function weekBuckets(msgs, tickets) {
    var t0 = msgs[0].dt.getTime(), t1 = msgs[msgs.length - 1].dt.getTime();
    var n = Math.min(52, Math.max(4, Math.round((t1 - t0) / (7 * 864e5)) || 4));
    var span = Math.max(1, t1 - t0);
    var out = [];
    for (var i = 0; i < n; i++) out.push({ msgs: 0, ticks: 0, months: {}, start: t0 + (span * i) / n });
    function idx(t) { return Math.min(n - 1, Math.floor(((t - t0) / span) * n)); }
    msgs.forEach(function (m) {
      var b = out[idx(m.dt.getTime())];
      b.msgs++;
      b.months[WAParser.monthKey(m.dt)] = 1;
    });
    tickets.forEach(function (t) { out[idx(new Date(t.requestedAt).getTime())].ticks++; });
    var prevMk = null;
    return out.map(function (b, i) {
      var d = new Date(b.start);
      var mk = WAParser.monthKey(d);
      var show = i === 0 || mk !== prevMk;
      prevMk = mk;
      var lab = ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
      return { label: lab, full: 'Semana del ' + d.toLocaleString('es', { day: 'numeric', month: 'short' }),
        msgs: b.msgs, ticks: b.ticks, months: Object.keys(b.months), showLabel: show };
    });
  }

  function monthBuckets(msgs, tickets) {
    var d0 = msgs[0].dt, d1 = msgs[msgs.length - 1].dt;
    var keys = [], cur = new Date(d0.getFullYear(), d0.getMonth(), 1);
    var end = new Date(d1.getFullYear(), d1.getMonth(), 1);
    while (cur <= end) {
      keys.push(WAParser.monthKey(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    var map = {};
    keys.forEach(function (k) { map[k] = { msgs: 0, ticks: 0 }; });
    msgs.forEach(function (m) { map[WAParser.monthKey(m.dt)].msgs++; });
    tickets.forEach(function (t) { map[WAParser.monthKey(t.requestedAt)].ticks++; });
    return keys.map(function (k) {
      return { label: monthLabel(k), full: monthLabel(k), msgs: map[k].msgs,
        ticks: map[k].ticks, months: [k], showLabel: true };
    });
  }

  function bindChartTip() {
    if (state.chartBound) return;
    state.chartBound = true;
    var cv = $('chart'), tip = $('chartTip');
    cv.addEventListener('mousemove', function (e) {
      var n = state.chartBuckets.length;
      if (!n) return;
      var r = cv.getBoundingClientRect();
      var i = Math.floor(((e.clientX - r.left) / r.width) * n);
      i = Math.max(0, Math.min(n - 1, i));
      var b = state.chartBuckets[i];
      tip.innerHTML = '<b>' + esc(b.full) + '</b><br>' +
        'Mensajes: <b>' + b.msgs.toLocaleString('es-GT') + '</b><br>' +
        'Tickets nuevos: <b>' + b.ticks.toLocaleString('es-GT') + '</b>';
      var wr = cv.parentElement.getBoundingClientRect();
      var lx = e.clientX - wr.left + 14, ly = e.clientY - wr.top + 14;
      if (lx + 190 > wr.width) lx -= 200;
      tip.style.left = lx + 'px';
      tip.style.top = ly + 'px';
      tip.hidden = false;
    });
    cv.addEventListener('mouseleave', function () { tip.hidden = true; });
  }

  // ---------- tabla ----------
  ['fSearch', 'fStatus', 'fConf'].forEach(function (id) {
    $(id).addEventListener('input', function () { state.page = 0; applyFilters(); });
    $(id).addEventListener('change', function () { state.page = 0; applyFilters(); });
  });
  $('pgPrev').addEventListener('click', function () { if (state.page > 0) { state.page--; renderTable(); } });
  $('pgNext').addEventListener('click', function () {
    if ((state.page + 1) * state.perPage < state.filtered.length) { state.page++; renderTable(); }
  });

  function applyFilters() {
    var q = $('fSearch').value.trim().toLowerCase();
    var st = $('fStatus').value, cf = $('fConf').value;
    var base = state.monthFiltered;
    state.filtered = base.filter(function (t) {
      if (st && t.status !== st) return false;
      if (cf && t.confidence !== cf && t.status !== 'pendiente') return false;
      if (q && (t.code + ' ' + (t.grp || '') + ' ' + t.requester + ' ' + (t.responder || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    renderTable();
  }

  function renderTable() {
    var tb = $('tblBody');
    var start = state.page * state.perPage;
    var rows = state.filtered.slice(start, start + state.perPage);
    $('tblCount').textContent = '· ' + state.filtered.length.toLocaleString('es-GT') + ' de ' +
      state.monthFiltered.length.toLocaleString('es-GT') + (state.month ? ' (' + monthLabel(state.month) + ')' : '');
    $('pgInfo').textContent = state.filtered.length
      ? ('Página ' + (state.page + 1) + ' de ' + Math.ceil(state.filtered.length / state.perPage))
      : 'Sin resultados';
    $('pgPrev').disabled = state.page === 0;
    $('pgNext').disabled = (state.page + 1) * state.perPage >= state.filtered.length;
    tb.innerHTML = rows.map(function (t, i) {
      var idx = state.result.tickets.indexOf(t);
      return '<tr><td><strong>' + esc(t.code) + '</strong></td><td>' + esc(t.grp || '—') + '</td><td>' + esc(t.requester) + '</td>' +
        '<td>' + esc(fmtDate(t.requestedAt)) + '</td><td>' + esc(t.responder || '—') + '</td>' +
        '<td>' + esc(fmtDur(t.minutesToResponse)) + '</td>' +
        '<td><span class="pill ' + (t.status === 'respondido' ? 'ok' : 'pend') + '">' + t.status + '</span></td>' +
        '<td class="conf">' + esc(t.confidence || '—') + '</td>' +
        '<td><button class="btn ghost" data-i="' + idx + '">Ver</button></td></tr>';
    }).join('');
    tb.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { showDetail(state.result.tickets[+b.dataset.i]); });
    });
  }

  // ---------- detalle ----------
  function showDetail(t) {
    $('dTitle').textContent = 'Ticket ' + t.code + ' · ' + (t.grp || '') + ' · ' + t.status;
    var tl = timeline(t);
    $('dBody').innerHTML =
      '<p><strong>Solicita:</strong> ' + esc(t.requester) + ' · ' + esc(fmtDate(t.requestedAt)) + '</p>' +
      '<p><strong>Solicitud:</strong></p><div class="tl-item"><div class="txt">' + esc(t.requestText) + '</div></div>' +
      (t.responder
        ? '<p><strong>Primera respuesta:</strong> ' + esc(t.responder) + ' · ' + esc(fmtDate(t.respondedAt)) +
          ' · <strong>' + esc(fmtDur(t.minutesToResponse)) + '</strong> después (confianza ' + esc(t.confidence) + ')</p>' +
          '<div class="tl-item"><div class="txt">' + esc(t.responseText || '') + '</div></div>'
        : '<p><strong>Sin respuesta</strong> dentro de la ventana de ' + esc($('optWindow').value) + ' h.</p>') +
      '<h3>Línea de tiempo del ticket (' + tl.length + ' menciones)</h3><div class="tl">' +
      tl.map(function (m) {
        return '<div class="tl-item"><div class="who">' + esc(m.author) + '</div><div class="when">' +
          esc(fmtDate(m.dt)) + '</div><div class="txt">' + esc(m.body.slice(0, 600)) + '</div></div>';
      }).join('') + '</div>';
    $('drawer').hidden = false;
  }
  $('drawerClose').addEventListener('click', function () { $('drawer').hidden = true; });
  $('drawer').addEventListener('click', function (e) { if (e.target === $('drawer')) $('drawer').hidden = true; });

  function timeline(t) {
    var out = [];
    state.messages.forEach(function (m) {
      if (WAParser.isSystem(m)) return;
      if (t.grp && m.grp !== t.grp) return;
      if (WAParser.ticketsOf(m.body).indexOf(t.code) !== -1) out.push(m);
    });
    out.sort(function (a, b) { return a.dt - b.dt; });
    return out.slice(0, 60);
  }

  // ---------- export ----------
  function download(name, content, type) {
    var blob = new Blob([content], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function csvCell(v) {
    v = v == null ? '' : String(v);
    return '"' + v.replace(/"/g, '""') + '"';
  }
  $('btnCsv').addEventListener('click', function () {
    if (!state.result) return;
    var head = 'codigo,grupo,solicitante,fecha_solicitud,respondedor,fecha_respuesta,minutos_respuesta,estado,confianza,menciones\n';
    var body = state.filtered.map(function (t) {
      return [t.code, t.grp || '', t.requester, fmtDate(t.requestedAt), t.responder || '', t.respondedAt ? fmtDate(t.respondedAt) : '',
        t.minutesToResponse == null ? '' : t.minutesToResponse, t.status, t.confidence || '', t.messageCount]
        .map(csvCell).join(',');
    }).join('\n');
    var tag = (state.group ? '-' + state.group : '') + (state.month ? '-' + state.month : '');
    download('tickets-whatsapp' + tag + '.csv', '﻿' + head + body, 'text/csv;charset=utf-8');
  });
  $('btnJson').addEventListener('click', function () {
    if (!state.result) return;
    var tag = (state.group ? '-' + state.group : '') + (state.month ? '-' + state.month : '');
    download('tickets-whatsapp' + tag + '.json', JSON.stringify({ archivo: state.fileName, grupo: state.group || 'todos', mes: state.month || 'todos', mas1min: $('optPlusOne').checked, stats: WAParser.summarize(state.filtered), tickets: state.filtered }, null, 1), 'application/json');
  });
})();
