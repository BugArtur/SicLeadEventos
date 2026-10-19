/* Servidor de desenvolvimento: roda o apps-script/Code.gs DE VERDADE em Node, com uma imitação
   mínima dos serviços do Google (planilha em memória, e-mails gravados em dev/emails/).
   Também serve o site e entrega um config.js apontando para este backend.

   Uso:  node dev/mock-server.js   ->  http://localhost:8790  (totem)  e  /painel/
   Login do painel: SIC / teste   ·   GET /__dump mostra as abas da planilha simulada.
   GET /__email?tipo=cupom|brinde|nenhum mostra o e-mail de boas-vindas. */
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), PORT = Number(process.env.PORT || 8790);
const MAIL_DIR = path.join(__dirname, 'emails');

/* ---------- imitação dos serviços do Apps Script ---------- */
const sheets = {};
const blank = v => v === '' || v === null || v === undefined;
function makeSheet(name) {
  const rows = [];
  const sh = {
    rows, getName: () => name,
    getLastRow() { for (let i = rows.length - 1; i >= 0; i--) if ((rows[i] || []).some(v => !blank(v))) return i + 1; return 0; },
    getRange(r, c, nr = 1, nc = 1) {
      const rg = {
        getValues() { const out = []; for (let i = 0; i < nr; i++) { const row = rows[r - 1 + i] || []; const o = []; for (let j = 0; j < nc; j++) o.push(blank(row[c - 1 + j]) ? '' : row[c - 1 + j]); out.push(o); } return out; },
        getValue() { return rg.getValues()[0][0]; },
        setValues(v) { for (let i = 0; i < nr; i++) { rows[r - 1 + i] = rows[r - 1 + i] || []; for (let j = 0; j < nc; j++) rows[r - 1 + i][c - 1 + j] = v[i][j]; } return rg; },
        setValue(v) { return rg.setValues([[v]]); },
        clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (rows[r - 1 + i]) rows[r - 1 + i][c - 1 + j] = ''; return rg; },
        setNumberFormat: () => rg, setFontWeight: () => rg, setFontColor: () => rg, setBackground: () => rg, setFontSize: () => rg
      };
      return rg;
    },
    appendRow(v) { rows[sh.getLastRow()] = v.slice(); return sh; },
    setFrozenRows: () => sh, setColumnWidth: () => sh
  };
  return sh;
}
const ss = {
  getSheetByName: n => sheets[n] || null,
  insertSheet: n => (sheets[n] = makeSheet(n)),
  getSheets: () => Object.values(sheets), deleteSheet: s => { delete sheets[s.getName()]; },
  setSpreadsheetTimeZone: () => {}, getUrl: () => 'https://docs.google.com/spreadsheets/d/SIMULADA'
};
const props = {}, cache = {};
const fmt = (d, tz, f) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(d)).map(x => [x.type, x.value]));
  return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
};
let mailCount = 0;
const G = {
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  MailApp: {
    getRemainingDailyQuota: () => 1500 - mailCount,
    sendEmail(o) {
      mailCount++;
      fs.mkdirSync(MAIL_DIR, { recursive: true });
      const f = path.join(MAIL_DIR, String(mailCount).padStart(3, '0') + '-' + o.to.replace(/[^a-z0-9@.]/gi, '_') + '.html');
      fs.writeFileSync(f, `<!-- Para: ${o.to} | De: ${o.name} | Assunto: ${o.subject} -->\n` + o.htmlBody);
      console.log('[e-mail]', o.to, '·', o.subject);
    }
  },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  Utilities: { getUuid: () => crypto.randomUUID(), formatDate: fmt },
  Logger: { log: (...a) => console.log('[Logger]', ...a) },
  Session: { getActiveUser: () => ({ getEmail: () => 'nao-responda@coopedu.app.br' }) },
  console, Date, JSON, Math, Number, String, Object, Array, isNaN, Error
};
vm.createContext(G);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script', 'Code.gs'), 'utf8'), G, { filename: 'Code.gs' });
G.setup();
props.TOTEM_KEY = 'chave-dev';
props.PAINEL_SENHA = 'teste'; // senha só do ambiente de desenvolvimento
props.SITE_URL = 'http://localhost:' + PORT; // no Google só https é aceito; aqui liberamos para ver as imagens do e-mail

/* ---------- HTTP ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.css': 'text/css', '.json': 'application/json' };
http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && url === '/api') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const delay = Number(process.env.API_DELAY || 300);
      setTimeout(() => {
        if (process.env.API_DOWN === '1' || fs.existsSync(path.join(__dirname, 'API_DOWN'))) { res.writeHead(503); return res.end('fora do ar'); }
        const out = G.doPost({ postData: { contents: body } });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(out.s);
      }, delay);
    });
    return;
  }
  if (url === '/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    return res.end(`window.SIC_CONFIG = { apiUrl: 'http://localhost:${PORT}/api', totemKey: 'chave-dev' };`);
  }
  if (url === '/__email') {
    const tipo = new URL(req.url, 'http://x').searchParams.get('tipo') || 'cupom';
    const prize = tipo === 'cupom' ? { kind: 'coupon', code: 'SIC-SETUP10-S2YE', name: '10% na implantação e setup', desc: '10% de desconto na implantação e setup do SIC.', conditions: 'Válido sobre o valor de implantação e setup em novos contratos assinados dentro da validade do cupom. Não cumulativo.', validUntil: new Date(Date.now() + 30 * 864e5) }
      : tipo === 'brinde' ? { kind: 'gift', gameId: 'G-7KQ2MX' } : null;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(G.buildEmailHtml_('Carla', prize, G.readConfig_()));
  }
  if (url === '/__dump') {
    const out = {}; Object.values(sheets).forEach(s => { out[s.getName()] = s.rows.slice(0, s.getLastRow()); });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(out, null, 1));
  }
  let f = path.join(ROOT, url);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log('Dev em http://localhost:' + PORT + '  (painel: /painel/ · SIC / teste)'));
