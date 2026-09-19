// שרת פיתוח מקומי: מגיש את האתר, ומחבר את הטופס לגיליון מדומה (tests/fake-sheets.js)
// כדי שאפשר יהיה לבדוק שליחה/עדכון מקצה לקצה בלי לגעת בגיליון האמיתי.
//   node tools/dev-server.js          →  http://localhost:4173
//   GET  /mock-rows                   →  מה שנשמר בגיליון המדומה + סיכום
//   POST /mock-reset                  →  איפוס הגיליון המדומה
//   POST /mock-fail?on=1|0            →  לדמות תקלה בשרת
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createEnv } = require('../tests/fake-sheets');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.ics': 'text/calendar; charset=utf-8'
};

let env = createEnv();
let failing = false;

const send = (res, status, type, body) => {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
};
const sendJson = (res, obj, status = 200) => send(res, status, 'application/json; charset=utf-8', JSON.stringify(obj));

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/mock-rsvp' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => (failing ? sendJson(res, { ok: false }, 500) : sendJson(res, env.postRaw(body))));
    return;
  }
  if (url.pathname === '/mock-rows') return sendJson(res, { rows: env.rows(), summary: env.summary() });
  if (url.pathname === '/mock-reset') { env = createEnv(); failing = false; return sendJson(res, { ok: true }); }
  if (url.pathname === '/mock-fail') { failing = url.searchParams.get('on') === '1'; return sendJson(res, { failing }); }

  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'text/plain', 'not found');

  let content = fs.readFileSync(file);
  if (rel === '/js/config.js' && !url.searchParams.has('raw')) {
    // ?wa=1 בכתובת האתר משאיר את מצב הוואטסאפ (בלי endpoint) לבדיקה
    content += "\nif (!/[?&]wa=1/.test(location.search)) window.EVENT_CONFIG.rsvpEndpoint = '/mock-rsvp';\n";
  }
  send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', content);
}).listen(PORT, () => console.log('dev server: http://localhost:' + PORT));
