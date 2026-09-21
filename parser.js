/**
 * whatsapp-analyzer / parser.js
 * Parser puro (sin DOM) del export .txt de WhatsApp + análisis por ticket/código.
 * Funciona en navegador y en Node (para pruebas).
 * Todo el procesamiento es local: el archivo nunca sale del equipo.
 */
(function (factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else globalThis.WAParser = api;
})(function () {
  'use strict';

  // Línea de mensaje: 23/12/2025, 2:03 p. m. - Autor: texto
  // (WhatsApp usa espacios finos U+202F / NBSP alrededor de "p. m.")
  var MSG_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s+(\d{1,2}):(\d{2})\s*([ap])\.\s*m\.\s*-\s+([\s\S]*)$/i;

  // Tickets: 8-9 dígitos empezando con 15 o 16, con prefijos 00 o GTM- opcionales.
  // Se normaliza quitando los ceros iniciales (0015171462 -> 15171462).
  var TICKET_RE = /(?:GTM-)?0*(1[56]\d{6,7})/gi;

  // Mensajes de sistema que no son conversación
  var SYSTEM_RE = /^(Se elimin[oó] este mensaje|Se edit[oó] este mensaje|Los mensajes y las llamadas est[aá]n cifrados)/i;

  // Patrones de respuesta de soporte en la primera línea del mensaje
  var CONFIRM_RE = /^(listo|lista|ok|okay|hecho|ya\b|ya qued|qued[oó]|resuelto|solucionado|terminado|enterado|recibido|visto|va\b|voy|revisado|revisando|apoyo|te apoyo|dame|p[aá]same|qu[eé] error|cu[aá]l es|manda|env[ií]a)/i;
  var EQUIP_RE = /\b(ca|cm|bbi|mta|emta|ont|oha|ot|ct|as400|intraway|retirar|baja|activaci[oó]n|c[oó]digo|serial|mac|anexo|grilla|t[cv]|poste|extensor|supervisor|aut)\b[:\s]/i;

  function normalizeSpaces(s) {
    return String(s == null ? '' : s).replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ');
  }

  function parseDate(dd, mm, yyyy, hh, mi, ap) {
    var h = parseInt(hh, 10);
    var pm = String(ap).toLowerCase() === 'p';
    if (pm && h !== 12) h += 12;
    if (!pm && h === 12) h = 0;
    return new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10), h, parseInt(mi, 10), 0);
  }

  /** Convierte el texto del .txt en lista de {dt, author|null, body}. Une líneas continuación. */
  function parseChat(text) {
    var lines = String(text).split(/\r?\n/);
    var msgs = [];
    var cur = null;
    for (var i = 0; i < lines.length; i++) {
      var line = normalizeSpaces(lines[i]);
      if (!line.trim()) continue;
      var m = line.match(MSG_RE);
      if (m) {
        if (cur) msgs.push(cur);
        var rest = m[7];
        var ci = rest.indexOf(':');
        var author, body;
        if (ci === -1) { author = null; body = rest.trim(); }
        else { author = rest.slice(0, ci).trim(); body = rest.slice(ci + 1).trim(); }
        cur = { dt: parseDate(m[1], m[2], m[3], m[4], m[5], m[6]), author: author || null, body: body };
      } else if (cur) {
        cur.body += '\n' + line.trim();
      }
    }
    if (cur) msgs.push(cur);
    msgs.sort(function (a, b) { return a.dt - b.dt; });
    return msgs;
  }

  function isSystem(msg) {
    if (!msg.author) return true;
    return SYSTEM_RE.test(msg.body.split('\n')[0].trim());
  }

  function ticketsOf(body) {
    var out = [];
    var seen = {};
    TICKET_RE.lastIndex = 0;
    var m;
    while ((m = TICKET_RE.exec(body)) !== null) {
      var t = m[1];
      if (!seen[t]) { seen[t] = 1; out.push(t); }
      if (m.index === TICKET_RE.lastIndex) TICKET_RE.lastIndex++;
    }
    return out;
  }

  /**
   * ¿Este mensaje puede ser respuesta al ticket?
   * - Si repite el mismo ticket: sí (confianza alta).
   * - Si abre otro ticket distinto: no (es otra solicitud).
   * - Si no trae ticket: sí solo si parece confirmación/gestión (confianza media).
   */
  function responseInfo(msg, ticket) {
    var first = msg.body.split('\n')[0].trim();
    var ts = ticketsOf(msg.body);
    if (ts.indexOf(ticket) !== -1) return { ok: true, confidence: 'alta' };
    if (ts.length > 0) return { ok: false };
    if (CONFIRM_RE.test(first)) return { ok: true, confidence: 'alta' };
    if (EQUIP_RE.test(first) && /\d{5,}/.test(first)) return { ok: true, confidence: 'media' };
    if (first.length <= 120) return { ok: true, confidence: 'media' };
    return { ok: false };
  }

  /**
   * Analiza tickets.
   * options: { windowHours (def 24), supportOnly (def false), supportSet: Set/array de respondedores válidos }
   * Devuelve { tickets: [...], stats, authors }.
   * Cada ticket: { code, requester, requestedAt, requestText, responder, respondedAt,
   *   minutesToResponse, messageCount, mentions, status: 'respondido'|'pendiente', confidence }
   */
  function analyze(messages, options) {
    options = options || {};
    var windowHours = options.windowHours != null ? options.windowHours : 24;
    var supportOnly = !!options.supportOnly;
    var supportSet = null;
    if (options.supportSet) {
      supportSet = {};
      options.supportSet.forEach(function (a) { supportSet[String(a).toLowerCase()] = 1; });
    }
    var windowMs = windowHours * 3600 * 1000;

    var chat = messages.filter(function (m) { return !isSystem(m); });
    var firstByTicket = {}; // code -> {idx, msg}
    var mentions = {};      // code -> count
    chat.forEach(function (m, i) {
      var ts = ticketsOf(m.body);
      ts.forEach(function (t) {
        mentions[t] = (mentions[t] || 0) + 1;
        if (!firstByTicket[t]) firstByTicket[t] = { idx: i, msg: m };
      });
    });

    var tickets = Object.keys(firstByTicket).map(function (code) {
      var f = firstByTicket[code];
      var found = null;
      for (var j = f.idx + 1; j < chat.length; j++) {
        var m = chat[j];
        if (m.dt - f.msg.dt > windowMs) break;
        if (m.author === f.msg.author) continue;
        if (supportSet && !supportSet[String(m.author).toLowerCase()]) continue;
        // Sin filtro de soporte, un mensaje que abre otro ticket no es respuesta; con filtro sí se omite igual.
        var ri = responseInfo(m, code);
        if (!ri.ok) {
          var ts = ticketsOf(m.body);
          if (ts.length && ts.indexOf(code) === -1) continue; // otra solicitud: seguir buscando
          // Mensaje largo sin relación: se cuenta como "ruido" solo si no hay filtro de soporte;
          // con filtro de soporte igual se ignora para no atribuir mal.
          continue;
        }
        found = { msg: m, confidence: ri.confidence };
        break;
      }
      var minutes = found ? Math.round(((found.msg.dt - f.msg.dt) / 60000) * 10) / 10 : null;
      // El export solo trae hora:minuto. Si cayó en el mismo minuto, el tiempo real
      // está entre 0 y 1 min: se imputa 0.5 (punto medio) para no subestimar promedios.
      // En pantalla se muestra "< 1 min".
      if (minutes === 0) minutes = 0.5;
      // Criterio opcional de exploración: sumar 1 min a todos los tiempos.
      if (minutes != null && options.plusOne) minutes = Math.round((minutes + 1) * 10) / 10;
      return {
        code: code,
        requester: f.msg.author,
        requestedAt: f.msg.dt,
        requestText: f.msg.body.slice(0, 280),
        responder: found ? found.msg.author : null,
        respondedAt: found ? found.msg.dt : null,
        responseText: found ? found.msg.body.split('\n')[0].slice(0, 280) : null,
        minutesToResponse: minutes,
        messageCount: mentions[code] || 0,
        status: found ? 'respondido' : 'pendiente',
        confidence: found ? found.confidence : null
      };
    });

    tickets.sort(function (a, b) { return b.requestedAt - a.requestedAt; });

    var responded = tickets.filter(function (t) { return t.status === 'respondido'; });
    var diffs = responded.map(function (t) { return t.minutesToResponse; }).sort(function (a, b) { return a - b; });
    function pct(q) {
      if (!diffs.length) return null;
      return diffs[Math.min(diffs.length - 1, Math.floor(q * diffs.length))];
    }
    var avg = diffs.length ? diffs.reduce(function (a, b) { return a + b; }, 0) / diffs.length : null;

    var byRequester = {};
    var byResponder = {};
    tickets.forEach(function (t) {
      byRequester[t.requester] = (byRequester[t.requester] || 0) + 1;
      if (t.responder) byResponder[t.responder] = (byResponder[t.responder] || 0) + 1;
    });
    function top(obj, n) {
      return Object.keys(obj).map(function (k) { return { name: k, count: obj[k] }; })
        .sort(function (a, b) { return b.count - a.count; }).slice(0, n || 10);
    }

    return {
      tickets: tickets,
      stats: {
        total: tickets.length,
        responded: responded.length,
        pending: tickets.length - responded.length,
        responseRate: tickets.length ? Math.round((responded.length / tickets.length) * 1000) / 10 : 0,
        avgMinutes: avg != null ? Math.round(avg * 10) / 10 : null,
        medianMinutes: pct(0.5),
        p90Minutes: pct(0.9),
        windowHours: windowHours,
        rangeStart: chat.length ? chat[0].dt : null,
        rangeEnd: chat.length ? chat[chat.length - 1].dt : null,
        chatMessages: chat.length
      },
      topRequesters: top(byRequester, 15),
      topResponders: top(byResponder, 15)
    };
  }

  /** Sugiere roster de soporte: autores con muchas respuestas y pocas solicitudes. */
  function suggestSupport(messages, limit) {
    var chat = messages.filter(function (m) { return !isSystem(m); });
    var opened = {};
    var confirmed = {};
    chat.forEach(function (m) {
      var ts = ticketsOf(m.body);
      if (ts.length) opened[m.author] = (opened[m.author] || 0) + 1;
      var first = m.body.split('\n')[0].trim();
      if (CONFIRM_RE.test(first) && first.length < 80) confirmed[m.author] = (confirmed[m.author] || 0) + 1;
    });
    var score = Object.keys(confirmed).map(function (a) {
      return { name: a, confirms: confirmed[a], opened: opened[a] || 0,
        ratio: confirmed[a] / Math.max(1, opened[a] || 0) };
    }).sort(function (a, b) { return b.confirms - a.confirms; });
    return score.slice(0, limit || 10);
  }

  /** Resume un subconjunto de tickets (ej. filtrado por mes) con las mismas métricas. */
  function summarize(tickets) {
    var responded = tickets.filter(function (t) { return t.status === 'respondido'; });
    var diffs = responded.map(function (t) { return t.minutesToResponse; }).sort(function (a, b) { return a - b; });
    function pct(q) {
      if (!diffs.length) return null;
      return diffs[Math.min(diffs.length - 1, Math.floor(q * diffs.length))];
    }
    var avg = diffs.length ? diffs.reduce(function (a, b) { return a + b; }, 0) / diffs.length : null;
    return {
      total: tickets.length,
      responded: responded.length,
      pending: tickets.length - responded.length,
      responseRate: tickets.length ? Math.round((responded.length / tickets.length) * 1000) / 10 : 0,
      avgMinutes: avg != null ? Math.round(avg * 10) / 10 : null,
      medianMinutes: pct(0.5),
      p90Minutes: pct(0.9)
    };
  }

  function topFrom(tickets, field, n) {
    var obj = {};
    tickets.forEach(function (t) {
      var k = t[field];
      if (k) obj[k] = (obj[k] || 0) + 1;
    });
    return Object.keys(obj).map(function (k) { return { name: k, count: obj[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, n || 10);
  }

  /** Clave YYYY-MM de una fecha (para filtro/agrupación mensual). */
  function monthKey(d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
  }

  return {
    parseChat: parseChat,
    ticketsOf: ticketsOf,
    analyze: analyze,
    summarize: summarize,
    topFrom: topFrom,
    monthKey: monthKey,
    suggestSupport: suggestSupport,
    isSystem: isSystem
  };
});
