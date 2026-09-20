/* whatsapp-analyzer / app.js — UI sin dependencias. Todo local. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    fileName: '', messages: [], result: null, authors: [],
    support: [], filtered: [], page: 0, perPage: 100
  };

  function fmtDate(d) {
    if (!d) return '—';
    d = d instanceof Date ? d : new Date(d);
    return d.toLocaleString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function fmtDur(min) {
    if (min == null) return '—';
    if (min < 1) return Math.round(min * 60) + ' s';
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
    if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', function () { if (input.files.length) loadFile(input.files[0]); });
  $('btnReset').addEventListener('click', function () {
    $('dashboard').hidden = true; drop.style.display = ''; $('btnReset').hidden = true;
    input.value = ''; state.messages = []; state.result = null;
  });

  function loadFile(file) {
    $('loadProgress').hidden = false;
    var reader = new FileReader();
    reader.onload = function () {
      setTimeout(function () {
        try {
          var text = reader.result;
          var msgs = WAParser.parseChat(text);
          if (!msgs.length) throw new Error('No se reconocieron mensajes. ¿Es el .txt exportado de WhatsApp?');
          state.fileName = file.name;
          state.messages = msgs;
          var sugg = WAParser.suggestSupport(msgs, 8).map(function (s) { return s.name; });
          state.support = sugg;
          state.authors = uniqueAuthors(msgs);
          $('loadProgress').hidden = true;
          drop.style.display = 'none';
          $('dashboard').hidden = false;
          $('btnReset').hidden = false;
          $('fileName').textContent = file.name;
          $('fileMeta').textContent = msgs.length.toLocaleString('es-GT') + ' mensajes · ' +
            fmtDate(msgs[0].dt) + ' → ' + fmtDate(msgs[msgs.length - 1].dt);
          buildRoster();
          recompute();
        } catch (err) {
          $('loadProgress').hidden = true;
          alert('Error: ' + err.message);
        }
      }, 30);
    };
    reader.onerror = function () { $('loadProgress').hidden = true; alert('No se pudo leer el archivo.'); };
    reader.readAsText(file, 'utf-8');
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

  function recompute() {
    if (!state.messages.length) return;
    var res = WAParser.analyze(state.messages, {
      windowHours: parseInt($('optWindow').value, 10),
      supportOnly: $('optSupportOnly').checked,
      supportSet: state.support
    });
    state.result = res;
    state.page = 0;
    renderKpis(res.stats);
    renderTops(res);
    renderChart(res);
    applyFilters();
  }

  function renderKpis(s) {
    var el = $('kpis');
    el.innerHTML =
      kpi(s.total.toLocaleString('es-GT'), 'tickets con código') +
      kpi(s.responded.toLocaleString('es-GT') + ' (' + s.responseRate + '%)', 'respondidos', 'good') +
      kpi(s.pending.toLocaleString('es-GT'), 'pendientes', s.pending ? 'bad' : '') +
      kpi(fmtDur(s.medianMinutes), 'mediana 1ª respuesta') +
      kpi(fmtDur(s.p90Minutes), 'p90 1ª respuesta', 'warn') +
      kpi(fmtDur(s.avgMinutes), 'promedio 1ª respuesta');
    function kpi(v, l, cls) {
      return '<div class="kpi ' + (cls || '') + '"><b>' + esc(v) + '</b><span>' + esc(l) + '</span></div>';
    }
  }

  function renderTops(res) {
    $('topReq').innerHTML = res.topRequesters.slice(0, 10).map(function (r) {
      return '<li>' + esc(r.name) + ' <span>(' + r.count + ' tickets)</span></li>';
    }).join('') || '<li class="muted">Sin datos</li>';
    $('topResp').innerHTML = res.topResponders.slice(0, 10).map(function (r) {
      return '<li>' + esc(r.name) + ' <span>(' + r.count + ' respuestas)</span></li>';
    }).join('') || '<li class="muted">Sin datos</li>';
  }

  function renderChart(res) {
    var cv = $('chart'), ctx = cv.getContext('2d');
    var W = cv.width = cv.parentElement.clientWidth - 32, H = cv.height = 160;
    ctx.clearRect(0, 0, W, H);
    // buckets semanales
    var msgs = state.messages.filter(function (m) { return !WAParser.isSystem(m); });
    if (!msgs.length) return;
    var t0 = msgs[0].dt.getTime(), t1 = msgs[msgs.length - 1].dt.getTime();
    var n = Math.min(52, Math.max(4, Math.round((t1 - t0) / (7 * 864e5)) || 4));
    var counts = new Array(n).fill(0), ticks = new Array(n).fill(0);
    msgs.forEach(function (m) {
      var i = Math.min(n - 1, Math.floor(((m.dt.getTime() - t0) / Math.max(1, t1 - t0)) * n));
      counts[i]++;
    });
    res.tickets.forEach(function (t) {
      var i = Math.min(n - 1, Math.floor(((new Date(t.requestedAt).getTime() - t0) / Math.max(1, t1 - t0)) * n));
      ticks[i]++;
    });
    var max = Math.max.apply(null, counts.concat([1]));
    var bw = W / n;
    for (var i = 0; i < n; i++) {
      var h = (counts[i] / max) * (H - 20);
      ctx.fillStyle = '#2563eb';
      ctx.fillRect(i * bw + 1, H - 14 - h, bw - 2, h);
      var th = (ticks[i] / max) * (H - 20);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(i * bw + 1, H - 14 - th, bw - 2, Math.max(2, th));
    }
    ctx.fillStyle = '#93a1b3';
    ctx.font = '11px system-ui';
    ctx.fillText('■ mensajes   ■ tickets nuevos', 4, 12);
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
    state.filtered = state.result.tickets.filter(function (t) {
      if (st && t.status !== st) return false;
      if (cf && t.confidence !== cf && t.status !== 'pendiente') return false;
      if (q && (t.code + ' ' + t.requester + ' ' + (t.responder || '')).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    renderTable();
  }

  function renderTable() {
    var tb = $('tblBody');
    var start = state.page * state.perPage;
    var rows = state.filtered.slice(start, start + state.perPage);
    $('tblCount').textContent = '· ' + state.filtered.length.toLocaleString('es-GT') + ' de ' +
      state.result.tickets.length.toLocaleString('es-GT');
    $('pgInfo').textContent = state.filtered.length
      ? ('Página ' + (state.page + 1) + ' de ' + Math.ceil(state.filtered.length / state.perPage))
      : 'Sin resultados';
    $('pgPrev').disabled = state.page === 0;
    $('pgNext').disabled = (state.page + 1) * state.perPage >= state.filtered.length;
    tb.innerHTML = rows.map(function (t, i) {
      var idx = state.result.tickets.indexOf(t);
      return '<tr><td><strong>' + esc(t.code) + '</strong></td><td>' + esc(t.requester) + '</td>' +
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
    $('dTitle').textContent = 'Ticket ' + t.code + ' · ' + t.status;
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
    var head = 'codigo,solicitante,fecha_solicitud,respondedor,fecha_respuesta,minutos_respuesta,estado,confianza,menciones\n';
    var body = state.filtered.map(function (t) {
      return [t.code, t.requester, fmtDate(t.requestedAt), t.responder || '', t.respondedAt ? fmtDate(t.respondedAt) : '',
        t.minutesToResponse == null ? '' : t.minutesToResponse, t.status, t.confidence || '', t.messageCount]
        .map(csvCell).join(',');
    }).join('\n');
    download('tickets-whatsapp.csv', '﻿' + head + body, 'text/csv;charset=utf-8');
  });
  $('btnJson').addEventListener('click', function () {
    if (!state.result) return;
    download('tickets-whatsapp.json', JSON.stringify({ archivo: state.fileName, stats: state.result.stats, tickets: state.filtered }, null, 1), 'application/json');
  });
})();
