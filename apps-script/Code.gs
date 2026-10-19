/**
 * SIC – Captura de Leads (evento) · backend em Google Apps Script.
 *
 * Vive dentro da planilha (Extensões > Apps Script) e é publicado como "App da Web"
 * executando como nao-responda@coopedu.app.br. Faz o papel de backend:
 *   - recebe do totem os eventos (cadastro, sorteio, revelação, resgate) e grava nas abas;
 *   - devolve ao totem as regras de premiação (Prêmios, Config, Mensagens);
 *   - envia o e-mail de boas-vindas (com cupom, quando houver);
 *   - atende o /painel (login, números, setup do dia).
 *
 * Segredos ficam em Propriedades do Script (nunca na planilha nem no site):
 *   TOTEM_KEY     chave que o totem envia em cada requisição
 *   PAINEL_USUARIO / PAINEL_SENHA  login do /painel (defina a senha em Propriedades do Script)
 */

var TZ = 'America/Sao_Paulo';
var TOKEN_HORAS = 6;

var SHEETS = {
  Leads: ['LeadId', 'Data/hora', 'Dia do evento', 'Representante', 'Cooperativa', 'Ramo', 'Cooperados', 'UF sede', 'Cidade sede', 'Estados de atuação', 'Telefone', 'E-mail', 'Consentimento LGPD', 'Recebido na planilha', 'E-mail de boas-vindas'],
  'Participações': ['GameId', 'LeadId', 'Representante', 'Sorteado em', 'Dia do evento', 'Resultado', 'PrêmioId', 'Prêmio', 'Cupom', 'Mensagem exibida', 'Revelado em', 'Status do resgate', 'Resgatado em', 'Operador'],
  Cupons: ['Código', 'PrêmioId', 'Desconto', 'LeadId', 'GameId', 'Representante', 'Emitido em', 'Válido até', 'Status', 'Utilizado em', 'Operador', 'Enviado por e-mail'],
  'Prêmios': ['PrêmioId', 'Nome', 'Tipo', 'Parceiro', 'Desconto', 'Prefixo do cupom', 'Chance', 'Teto Dia 1', 'Teto Dia 2', 'Estoque total', 'Ativo', 'Saíram Dia 1', 'Saíram Dia 2', 'Saíram no total', 'Restante do estoque', 'Descrição', 'Condições do cupom'],
  Config: ['Chave', 'Valor', 'Descrição'],
  Mensagens: ['Id', 'Categoria', 'Título', 'Situação (problema)', 'Solução SIC', 'Ativa', 'Vezes exibida'],
  Log: ['Data/hora', 'Operação', 'GameId', 'LeadId', 'Detalhe', 'Origem', 'EventoId']
};

var DEFAULT_PRIZES = [
  ['GIFT', 'Brinde SIC', 'Brinde físico', '', '', '', 0.15, 20, 20, 40, 'Sim', 'Brinde físico retirado no estande do SIC.', ''],
  ['DISCOUNT_5', '5% na assinatura', 'Cupom', '', 0.05, 'SIC-5OFF-', 0.10, 15, 15, '', 'Sim', '5% de desconto na assinatura do SIC.', 'Válido para novos contratos do SIC assinados dentro da validade do cupom. Não cumulativo com outras promoções.'],
  ['SETUP_10', '10% na implantação e setup', 'Cupom', '', 0.10, 'SIC-SETUP10-', 0.05, 5, 5, '', 'Sim', '10% de desconto na implantação e setup do SIC.', 'Válido sobre o valor de implantação e setup em novos contratos assinados dentro da validade do cupom. Não cumulativo.'],
  ['NO_PRIZE', 'Sem premiação', '—', '', '', '', 0.70, '', '', '', 'Sim', 'Recebe a chance dos prêmios que baterem o teto do dia ou esgotarem.', '']
];

var DEFAULT_CONFIG = [
  ['dia1_data', '', 'Data do Dia 1 do evento'],
  ['dia2_data', '', 'Data do Dia 2 do evento'],
  ['validade_cupom_dias', 30, 'Dias de validade do cupom a partir da emissão'],
  ['reinicio_sem_premio_s', 15, 'Segundos até a tela voltar ao início quando não há prêmio'],
  ['reinicio_com_premio_s', 60, 'Segundos até a tela voltar ao início quando há prêmio'],
  ['inatividade_s', 60, 'Segundos sem toque no meio do cadastro antes de voltar ao início'],
  ['pin_equipe_totem', '1234', 'PIN do painel "Equipe" dentro do totem'],
  ['email_ativo', 'Sim', 'Liga/desliga o e-mail de boas-vindas'],
  ['email_remetente_nome', 'SIC – Sistema Integrado de Cooperativas', 'Nome que aparece como remetente'],
  ['email_logo_url', '', 'URL pública do logo (ex.: https://SEU-SITE.vercel.app/assets/logo-tag.png)'],
  ['link_instagram', 'https://www.instagram.com/sistemasic/', 'Link do Instagram no e-mail'],
  ['link_site', 'https://sic.coop.br/', 'Link do site no e-mail'],
  ['config_atualizada_em', '', 'Preenchido automaticamente quando o /painel salva'],
  ['config_atualizada_por', '', 'Preenchido automaticamente quando o /painel salva']
];

var DEFAULT_MESSAGES = [
  ['M01', 'eSocial', 'Não foi dessa vez!', 'Seu eSocial travou e você perdeu o prazo!', 'Com o SIC, menos burocracia e mais controle das obrigações da sua cooperativa!'],
  ['M02', 'Nota Fiscal', 'Que pena!', 'Um erro no preenchimento manual da nota fiscal obrigou você a refazer tudo!', 'Automatize a emissão de notas fiscais com o SIC!'],
  ['M03', 'Folha de pagamento', 'Não foi dessa vez!', 'A folha não fechou e os cooperados estão cobrando o pagamento!', 'Simplifique a geração da folha e os pagamentos com o SIC!'],
  ['M04', 'Planilhas', 'Que pena!', 'Sua planilha corrompeu bem na hora de fechar o mês!', 'Com o SIC, sua gestão não depende de planilhas intermináveis!'],
  ['M05', 'Pagamentos', 'Não foi dessa vez!', 'O banco rejeitou seu arquivo CNAB e você terá que começar novamente!', 'Integre seus pagamentos e elimine processos manuais com o SIC!'],
  ['M06', 'Cadastros duplicados', 'Que pena!', 'Você cadastrou o mesmo cooperado três vezes e agora não sabe qual registro está correto!', 'Centralize a gestão dos cooperados em um só lugar com o SIC!'],
  ['M07', 'Contratos', 'Não foi dessa vez!', 'A diretoria pediu um contrato e ninguém sabe onde ele foi salvo!', 'Com o SIC, seus contratos ficam organizados e acessíveis!'],
  ['M08', 'Retrabalho', 'Que pena!', 'Você ganhou mais uma tarde digitando as mesmas informações em sistemas diferentes!', 'Com o SIC, integre processos e reduza o retrabalho!'],
  ['M09', 'Conciliação bancária', 'Não foi dessa vez!', 'O saldo do banco não bateu com sua planilha!', 'Facilite a conferência financeira com a integração bancária do SIC!'],
  ['M10', 'Informações descentralizadas', 'Que pena!', 'Cada setor apresentou um número diferente na reunião!', 'Com o SIC, todos trabalham com informações centralizadas!'],
  ['M11', 'Produtividade', 'Não foi dessa vez!', 'Você passou três horas copiando dados de uma planilha para outra!', 'Automatize processos e ganhe tempo com o SIC!'],
  ['M12', 'Obrigações fiscais', 'Que pena!', 'Uma obrigação ficou esquecida e o prazo venceu!', 'Organize suas rotinas e acompanhe as pendências com o SIC!'],
  ['M13', 'Gestão de cooperados', 'Não foi dessa vez!', 'Um cooperado ficou de fora da folha porque seu cadastro estava desatualizado!', 'Centralize os dados e simplifique a gestão dos cooperados com o SIC!'],
  ['M14', 'Relatórios', 'Que pena!', 'A diretoria pediu um relatório urgente e os dados estão espalhados em cinco planilhas!', 'Tenha indicadores centralizados e acessíveis com o SIC!'],
  ['M15', 'Processos manuais', 'Não foi dessa vez!', 'Sua equipe passou o dia inteiro fazendo tarefas que poderiam ser automáticas!', 'Modernize sua cooperativa e ganhe eficiência com o SIC!']
];

/* ============================== SETUP ============================== */

/** Rode UMA vez pelo editor (botão Executar). Cria as abas, valores padrão e as chaves secretas. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(SHEETS).forEach(function (name) { ensureSheet_(ss, name, SHEETS[name]); });

  var pr = ss.getSheetByName('Prêmios');
  if (pr.getLastRow() < 2) writePrizeRows_(pr, DEFAULT_PRIZES.map(function (p) { return p; }));
  var cf = ss.getSheetByName('Config');
  if (cf.getLastRow() < 2) cf.getRange(2, 1, DEFAULT_CONFIG.length, 3).setValues(DEFAULT_CONFIG);
  var ms = ss.getSheetByName('Mensagens');
  if (ms.getLastRow() < 2) writeMessageRows_(ms, DEFAULT_MESSAGES.map(function (m) { return m.concat(['Sim']); }));
  ensureResumo_(ss);

  var first = ss.getSheets()[0];
  if (first.getName() !== 'Leads' && first.getLastRow() === 0 && !SHEETS[first.getName()] && first.getName() !== 'Resumo') ss.deleteSheet(first);

  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOTEM_KEY')) props.setProperty('TOTEM_KEY', randomKey_(32));
  if (!props.getProperty('PAINEL_USUARIO')) props.setProperty('PAINEL_USUARIO', 'SIC');
  if (!props.getProperty('PAINEL_SENHA')) props.setProperty('PAINEL_SENHA', randomKey_(12)); // troque em Propriedades do Script
  Logger.log('TOTEM_KEY = ' + props.getProperty('TOTEM_KEY'));
  Logger.log('Painel: usuário ' + props.getProperty('PAINEL_USUARIO') + ' (senha em Propriedades do Script › PAINEL_SENHA)');
  Logger.log('Pronto. Agora publique: Implantar > Nova implantação > App da Web.');
}

/** Envia os dois modelos (com cupom e sem prêmio) para a própria conta logada no editor. Útil para aprovar o layout. */
function testarEmail() {
  var para = Session.getActiveUser().getEmail(), cfg = readConfig_();
  sendWelcome_({ nome: 'Maria Exemplo', email: para }, { kind: 'coupon', code: 'SIC-SETUP10-EXMP', name: '10% na implantação e setup', desc: '10% de desconto na implantação e setup do SIC.', conditions: 'Válido sobre o valor de implantação e setup em novos contratos assinados dentro da validade do cupom. Não cumulativo.', validUntil: new Date(Date.now() + 30 * 864e5) }, cfg);
  sendWelcome_({ nome: 'Maria Exemplo', email: para }, null, cfg);
  Logger.log('2 e-mails de teste enviados para ' + para + (siteUrl_() ? '' : ' (sem imagens: o site ainda não foi publicado/acessado)'));
}

function ensureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setFontColor('#ffffff').setBackground('#0d2231');
    sh.setFrozenRows(1);
  }
  return sh;
}

/* Colunas calculadas (só para leitura humana; o sistema não depende delas).
   Planilhas em português separam argumentos com ponto e vírgula. setF_ grava com vírgula e, se a planilha
   acusar erro, regrava com ponto e vírgula; a escolha fica guardada em FORMULA_SEP. */
var P_ = "'Participações'!";

function semi_(f) { return f.map(function (r) { return r.map(function (x) { return x ? String(x).replace(/,/g, ';') : x; }); }); }
function setF_(range, f) {
  var props = PropertiesService.getScriptProperties(), sep = props.getProperty('FORMULA_SEP');
  if (sep === ';') return range.setFormulas(semi_(f));
  range.setFormulas(f);
  if (sep === ',') return;
  SpreadsheetApp.flush();
  var bad = range.getDisplayValues().some(function (r) { return r.some(function (v) { return /^#ERR/i.test(v); }); });
  if (bad) { range.setFormulas(semi_(f)); props.setProperty('FORMULA_SEP', ';'); }
  else props.setProperty('FORMULA_SEP', ',');
}

function ensureResumo_(ss, rebuild) {
  var sh = ss.getSheetByName('Resumo');
  if (sh && !rebuild) return;
  if (sh) sh.clear(); else sh = ss.insertSheet('Resumo');
  var rows = [['Resumo do evento', '']], forms = [['']];
  function block(title, labels, f) {
    rows.push(['', '']); forms.push(['']);
    rows.push([title, 'Total']); forms.push(['']);
    labels.forEach(function (l) { rows.push([l, '']); forms.push([f(rows.length)]); });
  }
  block('Leads', ['Dia 1', 'Dia 2', 'Ensaio'], function (i) { return '=COUNTIF(Leads!$C:$C,A' + i + ')'; });
  block('Leads por ramo', ['Agropecuário', 'Consumo', 'Crédito', 'Infraestrutura', 'Saúde', 'Trabalho, produção de bens e serviços', 'Transporte'], function (i) { return '=COUNTIF(Leads!$F:$F,A' + i + ')'; });
  block('Resultados da raspadinha', ['Premiado', 'Não premiado'], function (i) { return '=COUNTIF(' + P_ + '$F:$F,A' + i + ')'; });
  block('Resgates', ['Pendente', 'Resgatado'], function (i) { return '=COUNTIF(' + P_ + '$L:$L,A' + i + ')'; });
  block('E-mails', ['Enviado', 'Aguardando', 'Erro'], function (i) { return '=COUNTIF(Leads!$O:$O,A' + i + '&"*")'; });
  sh.getRange(1, 1, rows.length, 2).setValues(rows);
  forms.forEach(function (f, i) { if (f[0]) setF_(sh.getRange(i + 1, 2), [f]); });
  sh.getRange(1, 1).setFontWeight('bold').setFontSize(12);
  sh.setColumnWidth(1, 300);
}

/** Corrige as colunas calculadas (Prêmios, Mensagens, Resumo) se a planilha mostrar #ERROR!. Não mexe em leads nem em regras.
    Pode ser rodada pelo editor ou pelo App da Web (ação fixFormulas, com login do painel). Cada aba é tratada à parte. */
function corrigirFormulas() {
  PropertiesService.getScriptProperties().deleteProperty('FORMULA_SEP'); // detecta de novo o separador desta planilha
  var ss = SpreadsheetApp.getActiveSpreadsheet(), log = [];
  function step(name, fn) { try { log.push(name + ': ' + fn()); } catch (err) { log.push(name + ': ERRO ' + (err && err.message || err)); } }
  step('Prêmios', function () { var sh = ss.getSheetByName('Prêmios'), n = sh.getLastRow() - 1; if (n > 0) writePrizeFormulas_(sh, n); return n + ' linhas'; });
  step('Mensagens', function () { var sh = ss.getSheetByName('Mensagens'), n = sh.getLastRow() - 1; if (n > 0) writeMessageFormulas_(sh, n); return n + ' linhas'; });
  step('Resumo', function () { ensureResumo_(ss, true); return 'refeito'; });
  log.push('Separador: ' + PropertiesService.getScriptProperties().getProperty('FORMULA_SEP'));
  Logger.log(log.join(' | '));
  return log;
}

/* ============================== HTTP ============================== */

function doGet() { return json_({ ok: true, app: 'sic-leads', time: new Date().toISOString() }); }

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'JSON inválido' }); }
  try {
    var a = req.action;
    if (a === 'config' || a === 'events') {
      if (!checkTotem_(req.key)) return json_({ ok: false, error: 'Chave do totem inválida' });
      rememberSite_(req.site);
      return json_(a === 'config' ? actionConfig_() : actionEvents_(req.events || []));
    }
    if (a === 'login') return json_(actionLogin_(req));
    if (a === 'dashboard' || a === 'saveSetup' || a === 'testEmail' || a === 'fixFormulas') {
      var who = checkToken_(req.token);
      if (!who) return json_({ ok: false, error: 'Sessão expirada', auth: false });
      rememberSite_(req.site);
      if (a === 'dashboard') return json_(actionDashboard_());
      if (a === 'saveSetup') return json_(actionSaveSetup_(req, who));
      if (a === 'fixFormulas') { var lock = LockService.getScriptLock(); lock.waitLock(25000); try { return json_({ ok: true, log: corrigirFormulas() }); } finally { lock.releaseLock(); } }
      return json_(actionTestEmail_(req));
    }
    return json_({ ok: false, error: 'Ação desconhecida' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function checkTotem_(key) { var k = PropertiesService.getScriptProperties().getProperty('TOTEM_KEY'); return !!k && key === k; }

function actionLogin_(req) {
  var cache = CacheService.getScriptCache();
  var fails = Number(cache.get('login-fails') || 0);
  if (fails >= 8) return { ok: false, error: 'Muitas tentativas. Aguarde 5 minutos.' };
  var props = PropertiesService.getScriptProperties();
  var usuario = String(props.getProperty('PAINEL_USUARIO') || 'SIC'), senha = props.getProperty('PAINEL_SENHA');
  var u = String(req.usuario || '').trim();
  if (!senha || u.toLowerCase() !== usuario.toLowerCase() || String(req.senha || '') !== senha) {
    cache.put('login-fails', String(fails + 1), 300);
    return { ok: false, error: 'Usuário ou senha incorretos.' };
  }
  var nome = usuario;
  var token = Utilities.getUuid();
  cache.put('tok:' + token, nome, TOKEN_HORAS * 3600);
  return { ok: true, token: token, nome: nome };
}

function checkToken_(t) {
  if (!t) return null;
  var c = CacheService.getScriptCache(), who = c.get('tok:' + t);
  if (who) c.put('tok:' + t, who, TOKEN_HORAS * 3600);
  return who;
}

/* ============================== LEITURA ============================== */

function sheet_(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name); }

function rows_(name) {
  var sh = sheet_(name), n = sh.getLastRow() - 1, w = SHEETS[name].length;
  return n > 0 ? sh.getRange(2, 1, n, w).getValues() : [];
}

function fmtDate_(v) { return v instanceof Date ? Utilities.formatDate(v, TZ, 'yyyy-MM-dd') : String(v || ''); }
function iso_(v) { return v instanceof Date ? v.toISOString() : (v ? String(v) : ''); }
function pct_(v) { var n = Number(v); if (v === '' || v === null || isNaN(n)) return 0; return n <= 1 ? Math.round(n * 10000) / 100 : n; }
function numOrNull_(v) { return v === '' || v === null || isNaN(Number(v)) ? null : Number(v); }
function yes_(v) { return /^(sim|true|1|s)$/i.test(String(v).trim()); }

function readConfig_() {
  var o = {};
  rows_('Config').forEach(function (r) { if (r[0]) o[r[0]] = r[1]; });
  return o;
}

function readPrizes_() {
  return rows_('Prêmios').filter(function (r) { return r[0]; }).map(function (r) {
    return {
      id: String(r[0]), name: String(r[1]), kind: /cupom/i.test(r[2]) ? 'coupon' : (r[0] === 'NO_PRIZE' ? 'none' : 'gift'),
      partner: String(r[3] || ''), pct: pct_(r[4]), prefix: String(r[5] || ''), prob: pct_(r[6]),
      cap1: numOrNull_(r[7]), cap2: numOrNull_(r[8]), stock: numOrNull_(r[9]), active: yes_(r[10]),
      desc: String(r[15] || ''), conditions: String(r[16] || '')
    };
  });
}

function readMessages_() {
  return rows_('Mensagens').filter(function (r) { return r[0]; }).map(function (r) {
    return { id: String(r[0]), category: String(r[1]), title: String(r[2]), problem: String(r[3]), solution: String(r[4]), active: yes_(r[5]) };
  });
}

/** Contagem de sorteios por prêmio e por data (yyyy-MM-dd), usada pelo totem para respeitar tetos. */
function prizeCounts_() {
  var counts = {};
  rows_('Participações').forEach(function (r) {
    var id = String(r[6]); if (!id) return;
    var d = fmtDate_(r[3]);
    var c = counts[id] || (counts[id] = { total: 0, byDate: {} });
    c.total++; c.byDate[d] = (c.byDate[d] || 0) + 1;
  });
  return counts;
}

function publicConfig_(cfg) {
  return {
    day1: fmtDate_(cfg.dia1_data), day2: fmtDate_(cfg.dia2_data),
    couponDays: Number(cfg.validade_cupom_dias) || 30,
    resetSeconds: Number(cfg.reinicio_sem_premio_s) || 15,
    prizeResetSeconds: Number(cfg.reinicio_com_premio_s) || 60,
    idleSeconds: Number(cfg.inatividade_s) || 60,
    pin: String(cfg.pin_equipe_totem || '1234'),
    updatedAt: iso_(cfg.config_atualizada_em), updatedBy: String(cfg.config_atualizada_por || '')
  };
}

function actionConfig_() {
  var cfg = readConfig_();
  return { ok: true, config: publicConfig_(cfg), prizes: readPrizes_(), messages: readMessages_(), counts: prizeCounts_(), serverTime: new Date().toISOString() };
}

/* ============================== EVENTOS DO TOTEM ============================== */

function actionEvents_(events) {
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var log = ss.getSheetByName('Log');
    var done = {};
    var n = log.getLastRow() - 1;
    if (n > 0) log.getRange(2, 7, n, 1).getValues().forEach(function (r) { if (r[0]) done[r[0]] = 1; });
    var ctx = { cfg: readConfig_(), prizes: indexBy_(readPrizes_(), 'id'), idx: {} };
    var acked = [], errors = [];
    events.slice(0, 100).forEach(function (ev) {
      if (!ev || !ev.id) return;
      if (done[ev.id]) { acked.push(ev.id); return; }
      try {
        var detail = handleEvent_(ss, ev, ctx);
        log.appendRow([new Date(ev.at || Date.now()), labelOf_(ev.kind), (ev.data && ev.data.gameId) || '', (ev.data && ev.data.leadId) || '', detail || '', 'totem', ev.id]);
        done[ev.id] = 1; acked.push(ev.id);
      } catch (err) {
        errors.push({ id: ev.id, error: String(err && err.message || err) });
      }
    });
    return { ok: true, acked: acked, errors: errors };
  } finally { lock.releaseLock(); }
}

function labelOf_(k) { return { lead: 'Cadastro', draw: 'Sorteio', reveal: 'Revelação', close: 'Encerrado sem revelar', redeem: 'Resgate' }[k] || k; }

function indexBy_(list, k) { var o = {}; list.forEach(function (x) { o[x[k]] = x; }); return o; }

/** Linha (1-based) de um id na coluna A, com cache por lote. */
function findRow_(ss, name, id, ctx) {
  var key = name;
  if (!ctx.idx[key]) {
    var sh = ss.getSheetByName(name), n = sh.getLastRow() - 1, m = {};
    if (n > 0) sh.getRange(2, 1, n, 1).getValues().forEach(function (r, i) { if (r[0]) m[r[0]] = i + 2; });
    ctx.idx[key] = m;
  }
  return ctx.idx[key][id] || 0;
}
function remember_(ctx, name, id, row) { if (ctx.idx[name]) ctx.idx[name][id] = row; }

function handleEvent_(ss, ev, ctx) {
  var d = ev.data || {};
  if (ev.kind === 'lead') {
    if (findRow_(ss, 'Leads', d.leadId, ctx)) return 'já existia';
    var sh = ss.getSheetByName('Leads');
    sh.appendRow([d.leadId, new Date(d.ts), d.dayLabel || '', d.nome, d.cooperativa, d.ramo, d.cooperados, d.uf, d.cidade, (d.atuacao || []).join(', '),
      d.telefone, d.email, d.consent ? 'Sim' : 'Não', new Date(), d.noGame ? 'Aguardando envio' : 'Aguardando sorteio']);
    remember_(ctx, 'Leads', d.leadId, sh.getLastRow());
    if (d.noGame) sendForLead_(ss, d.leadId, null, ctx);
    return d.nome + ' · ' + d.cooperativa;
  }
  if (ev.kind === 'draw') {
    if (findRow_(ss, 'Participações', d.gameId, ctx)) return 'já existia';
    var p = ctx.prizes[d.type] || {};
    var gs = ss.getSheetByName('Participações');
    gs.appendRow([d.gameId, d.leadId, d.nome || '', new Date(d.drawnAt), d.dayLabel || '', d.prize ? 'Premiado' : 'Não premiado', d.type, d.typeLabel || p.name || d.type,
      d.couponCode || '', d.messageId ? d.messageId + ' · ' + (d.messageCategory || '') : '', '', d.prize ? 'Pendente' : '—', '', '']);
    remember_(ctx, 'Participações', d.gameId, gs.getLastRow());
    if (d.couponCode && !findRow_(ss, 'Cupons', d.couponCode, ctx)) {
      var cs = ss.getSheetByName('Cupons');
      cs.appendRow([d.couponCode, d.type, (Number(d.pct) || 0) / 100, d.leadId, d.gameId, d.nome || '', new Date(d.drawnAt), d.expiresAt ? new Date(d.expiresAt) : '', 'Disponível', '', '', 'Não']);
      cs.getRange(cs.getLastRow(), 3).setNumberFormat('0%');
      remember_(ctx, 'Cupons', d.couponCode, cs.getLastRow());
    }
    return (d.typeLabel || d.type) + (d.couponCode ? ' · ' + d.couponCode : '');
  }
  if (ev.kind === 'reveal' || ev.kind === 'close') {
    var row = findRow_(ss, 'Participações', d.gameId, ctx);
    if (!row) throw new Error('Participação ainda não recebida');
    var g = ss.getSheetByName('Participações');
    if (ev.kind === 'reveal') g.getRange(row, 11).setValue(new Date(ev.at));
    var vals = g.getRange(row, 1, 1, 14).getValues()[0];
    var prize = null;
    if (vals[8]) {
      var p2 = ctx.prizes[vals[6]] || {};
      var crow = findRow_(ss, 'Cupons', vals[8], ctx);
      var valid = crow ? ss.getSheetByName('Cupons').getRange(crow, 8).getValue() : '';
      prize = { kind: 'coupon', code: vals[8], name: p2.name || vals[7], desc: p2.desc || '', conditions: p2.conditions || '', validUntil: valid, row: crow };
    } else if (vals[5] === 'Premiado' && EMAIL_COM_BRINDE) {
      prize = { kind: 'gift', gameId: vals[0] };
    }
    sendForLead_(ss, vals[1], prize, ctx);
    return vals[7];
  }
  if (ev.kind === 'redeem') {
    var r = findRow_(ss, 'Participações', d.gameId, ctx);
    if (!r) throw new Error('Participação ainda não recebida');
    var ps = ss.getSheetByName('Participações');
    ps.getRange(r, 12, 1, 3).setValues([['Resgatado', new Date(d.redeemedAt || ev.at), d.operator || '']]);
    var code = ps.getRange(r, 9).getValue();
    if (code) {
      var cr = findRow_(ss, 'Cupons', code, ctx);
      if (cr) ss.getSheetByName('Cupons').getRange(cr, 9, 1, 3).setValues([['Resgatado', new Date(d.redeemedAt || ev.at), d.operator || '']]);
    }
    return ps.getRange(r, 8).getValue() + ' · ' + (d.operator || '');
  }
  throw new Error('Tipo de evento desconhecido: ' + ev.kind);
}

/** Envia o e-mail de boas-vindas uma única vez por lead. O bloco do prêmio só entra quando houver cupom (ou brinde, se ligado). */
function sendForLead_(ss, leadId, coupon, ctx) {
  var row = findRow_(ss, 'Leads', leadId, ctx);
  if (!row) throw new Error('Lead ainda não recebido');
  var sh = ss.getSheetByName('Leads');
  var v = sh.getRange(row, 1, 1, 15).getValues()[0];
  if (/^Enviado|^Desativado|^Sem consentimento/.test(String(v[14]))) return;
  var cfg = ctx.cfg, status;
  if (!yes_(cfg.email_ativo)) status = 'Desativado';
  else if (v[12] !== 'Sim') status = 'Sem consentimento';
  else if (MailApp.getRemainingDailyQuota() < 1) status = 'Erro: cota diária de e-mail esgotada';
  else {
    try {
      sendWelcome_({ nome: v[3], email: v[11] }, coupon, cfg);
      status = 'Enviado ' + Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm');
      if (coupon && coupon.row) ss.getSheetByName('Cupons').getRange(coupon.row, 12).setValue('Sim');
    } catch (err) { status = 'Erro: ' + String(err && err.message || err).slice(0, 120); }
  }
  sh.getRange(row, 15).setValue(status);
}

/* ============================== E-MAIL ============================== */

/* Brinde físico no e-mail: desligado por decisão do evento (brindes são geridos na hora no estande).
   Mude para true se quiser que quem ganhou brinde receba a versão "Prêmio da raspadinha". */
var EMAIL_COM_BRINDE = false;

function esc_(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** Endereço público do site (aprendido automaticamente das requisições do totem/painel). As imagens do e-mail vêm de lá. */
function siteUrl_() { return String(PropertiesService.getScriptProperties().getProperty('SITE_URL') || ''); }
function rememberSite_(site) {
  site = String(site || '').replace(/\/+$/, '');
  if (!/^https:\/\/[^\s"'<>]+$/.test(site)) return;
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SITE_URL') !== site) props.setProperty('SITE_URL', site);
}

/** prize: { kind: 'coupon', code, name, desc, conditions, validUntil } | { kind: 'gift', gameId } | null */
function sendWelcome_(lead, prize, cfg) {
  var first = String(lead.nome || '').trim().split(/\s+/)[0] || '';
  var subject = prize && prize.kind === 'coupon' ? 'Seu cupom do SIC está aqui, ' + first + '!'
    : prize && prize.kind === 'gift' ? 'Você ganhou um brinde do SIC, ' + first + '!'
    : 'Obrigado pela visita, ' + first + '!';
  MailApp.sendEmail({
    to: lead.email, subject: subject,
    name: String(cfg.email_remetente_nome || 'SIC – Sistema Integrado de Cooperativas'),
    htmlBody: buildEmailHtml_(first, prize, cfg),
    body: buildEmailText_(first, prize, cfg)
  });
}

function fmtValid_(v) { return v ? Utilities.formatDate(new Date(v), TZ, 'dd/MM/yyyy') : ''; }

function buildEmailText_(first, prize, cfg) {
  var t = 'Olá, ' + first + '! Que bom ter você por aqui.\n\nObrigado por visitar o estande do SIC. Foi um prazer conhecer você e a sua cooperativa!\n\n' +
    'O SIC integra folha, pagamentos via PIX, nota fiscal e eSocial em um só sistema, pensado para a rotina das cooperativas. Em breve nossa equipe entra em contato para conversar sobre o que faz sentido para vocês.\n\n';
  if (prize && prize.kind === 'coupon') t += 'SEU CUPOM DA RASPADINHA: ' + prize.code + '\n' + (prize.desc || prize.name) + '\nVálido até ' + fmtValid_(prize.validUntil) + '. ' + (prize.conditions || '') + '\nPara usar, informe o código à nossa equipe comercial.\n\n';
  if (prize && prize.kind === 'gift') t += 'PRÊMIO DA RASPADINHA: você ganhou um brinde exclusivo do SIC! Participação ' + prize.gameId + '. Se ainda não retirou, apresente este e-mail no estande do SIC durante o evento.\n\n';
  t += 'Site: ' + (cfg.link_site || 'https://sic.coop.br/') + '\nInstagram: ' + (cfg.link_instagram || 'https://www.instagram.com/sistemasic/') + '\n\nEquipe SIC';
  return t;
}

/* Layout "E-mails SIC – pós-evento" (Claude Design): cabeçalho escuro, faixa verde, bloco do prêmio, 4 recursos, botões, rodapé LGPD. */
function buildEmailHtml_(first, prize, cfg) {
  var F = 'font-family:Arial, Helvetica, sans-serif;', LH = 'mso-line-height-rule:exactly;';
  var base = siteUrl_(), img = function (p) { return base ? base + '/assets/' + p : ''; };
  var site = esc_(cfg.link_site || 'https://sic.coop.br/'), ig = esc_(cfg.link_instagram || 'https://www.instagram.com/sistemasic/');
  var siteLabel = site.replace(/^https?:\/\//, '').replace(/\/$/, '');
  var kind = prize ? prize.kind : 'none';
  var preheader = kind === 'coupon' ? 'Seu cupom da raspadinha do SIC está aqui. Obrigado pela visita ao estande!'
    : kind === 'gift' ? 'Você ganhou um brinde exclusivo do SIC. Obrigado pela visita ao estande!'
    : 'Obrigado pela visita ao estande do SIC. Em breve nossa equipe fala com você.';
  var pad = '&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;';

  var logo = base
    ? '<img src="' + img('logo-tag-branca.png') + '" width="170" height="40" alt="SIC – Sistema Integrado de Cooperativas" style="display:block;width:170px;height:40px;border:0;outline:none;text-decoration:none;' + F + 'font-size:22px;font-weight:bold;color:#ffffff;">'
    : '<div style="' + F + 'font-size:28px;line-height:34px;font-weight:bold;color:#ffffff;">SIC</div>';

  var prizeBlock = '';
  if (kind !== 'none') {
    var inner = kind === 'coupon'
      ? '<div style="' + F + 'font-size:12px;line-height:16px;' + LH + 'font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#8DC63F;">Seu cupom da raspadinha</div>' +
        '<div style="font-family:\'Courier New\', Courier, monospace;font-size:32px;line-height:40px;' + LH + 'font-weight:bold;letter-spacing:2px;color:#ffffff;padding:10px 0 6px;">' + esc_(prize.code) + '</div>' +
        '<div style="' + F + 'font-size:18px;line-height:24px;' + LH + 'font-weight:bold;color:#ffffff;">' + esc_(prize.desc || prize.name) + '</div>' +
        (prize.validUntil ? '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px;"><tr><td bgcolor="#8DC63F" style="background:#8DC63F;border-radius:999px;padding:6px 14px;' + F + 'font-size:13px;line-height:16px;' + LH + 'font-weight:bold;color:#0d2231;">Válido até ' + fmtValid_(prize.validUntil) + '</td></tr></table>' : '') +
        (prize.conditions ? '<div style="' + F + 'font-size:13px;line-height:20px;' + LH + 'color:#B5C7D4;padding-top:14px;">' + esc_(prize.conditions) + '</div>' : '') +
        '<div style="' + F + 'font-size:13px;line-height:20px;' + LH + 'color:#B5C7D4;padding-top:8px;">Para usar, informe o código à nossa equipe comercial.</div>'
      : '<div style="' + F + 'font-size:12px;line-height:16px;' + LH + 'font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#8DC63F;">Prêmio da raspadinha</div>' +
        '<div style="' + F + 'font-size:26px;line-height:32px;' + LH + 'font-weight:bold;color:#ffffff;padding:10px 0 6px;">Você ganhou um brinde exclusivo do SIC!</div>' +
        '<div style="' + F + 'font-size:14px;line-height:21px;' + LH + 'color:#B5C7D4;">Participação <span style="color:#ffffff;font-weight:bold;">' + esc_(prize.gameId) + '</span>. Se ainda não retirou, apresente este e-mail no estande do SIC durante o evento.</div>';
    prizeBlock =
      '<tr><td bgcolor="#ffffff" style="background:#ffffff;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="padding:8px 40px 8px;" class="px">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td bgcolor="#0d2231" style="background:#0d2231;border-radius:18px;padding:6px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="border:2px dashed #8DC63F;border-radius:14px;padding:24px 26px;">' + inner +
      '</td></tr></table></td></tr></table></td></tr></table></td></tr>';
  }

  function feature(icon, title, text) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td style="background:#F4F9FC;border-radius:12px;padding:16px 16px 14px;border-top:3px solid #8DC63F;">' +
      (base ? '<img src="' + img('email/' + icon) + '" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;outline:none;margin:0 0 12px;">' : '') +
      '<div style="' + F + 'font-size:15px;line-height:20px;' + LH + 'font-weight:bold;color:#0d2231;">' + title + '</div>' +
      '<div style="' + F + 'font-size:13px;line-height:19px;' + LH + 'color:#3D5566;padding-top:4px;">' + text + '</div></td></tr></table>';
  }
  var cell = function (html) { return '<td width="50%" valign="top" style="width:50%;padding:0 6px 12px;">' + html + '</td>'; };
  var features =
    '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:' + (kind === 'none' ? '8px' : '28px') + ' 34px 8px;" class="px">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">' +
    '<tr>' + cell(feature('icon-folha.png', 'Folha de pagamento', 'Produção e rateio dos cooperados em um só lugar.')) + cell(feature('icon-pix.png', 'Pagamentos via PIX', 'Direto do sistema, sem arquivo de remessa.')) + '</tr>' +
    '<tr>' + cell(feature('icon-nf.png', 'Nota fiscal', 'Emissão integrada ao faturamento.')) + cell(feature('icon-esocial.png', 'eSocial', 'Eventos enviados e acompanhados no SIC.')) + '</tr>' +
    '</table></td></tr>';

  function button(href, label, icon, bg, fg) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="' + bg + '" style="border-radius:999px;background:' + bg + ';">' +
      '<a href="' + href + '" target="_blank" style="display:block;padding:14px 26px 14px 22px;' + F + 'font-size:15px;line-height:18px;' + LH + 'font-weight:bold;color:' + fg + ';text-decoration:none;border-radius:999px;">' +
      (base ? '<img src="' + img('email/' + icon) + '" width="20" height="20" alt="" style="display:inline-block;width:20px;height:20px;border:0;vertical-align:middle;margin:-2px 10px 0 0;">' : '') +
      '<span style="vertical-align:middle;color:' + fg + ';">' + label + '</span></a></td></tr></table>';
  }

  return '<!DOCTYPE html><html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">' +
    '<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>SIC – Obrigado pela visita</title>' +
    '<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->' +
    '<style>body{margin:0 !important;padding:0 !important;width:100% !important;}a{color:#1C7EB7;}' +
    '@media only screen and (max-width:620px){.px{padding-left:22px !important;padding-right:22px !important;}.h1{font-size:28px !important;line-height:34px !important;}.stack{display:block !important;width:100% !important;}.btn-gap{display:block !important;height:12px !important;width:100% !important;}}</style>' +
    '</head><body style="margin:0;padding:0;background:#EEF3F7;">' +
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#EEF3F7;opacity:0;">' + preheader + pad + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#EEF3F7" style="width:100%;background:#EEF3F7;"><tr><td align="center" style="padding:32px 12px;">' +
    '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">' +
    '<tr><td bgcolor="#0d2231" style="background:#0d2231;border-radius:20px 20px 0 0;padding:32px 40px 0;" class="px">' + logo + '</td></tr>' +
    '<tr><td bgcolor="#0d2231" style="background:#0d2231;padding:28px 40px 34px;" class="px">' +
    '<div class="h1" style="' + F + 'font-size:34px;line-height:40px;' + LH + 'font-weight:bold;color:#ffffff;">Olá, ' + esc_(first) + '!<br><span style="color:#8DC63F;">Que bom ter você por aqui.</span></div>' +
    '<div style="' + F + 'font-size:16px;line-height:25px;' + LH + 'color:#C7D6E1;padding-top:14px;">Obrigado por visitar o estande do SIC. Foi um prazer conhecer você e a sua cooperativa!</div></td></tr>' +
    '<tr><td bgcolor="#8DC63F" style="background:#8DC63F;height:6px;line-height:6px;font-size:6px;' + LH + '">&nbsp;</td></tr>' +
    '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:32px 40px ' + (kind === 'none' ? '16px' : '24px') + ';" class="px">' +
    '<div style="' + F + 'font-size:16px;line-height:25px;' + LH + 'color:#3D5566;">O SIC integra <strong style="color:#0d2231;">folha, pagamentos via PIX, nota fiscal e eSocial</strong> em um só sistema, pensado para a rotina das cooperativas. Em breve nossa equipe entra em contato para conversar sobre o que faz sentido para vocês.</div></td></tr>' +
    prizeBlock + features +
    '<tr><td bgcolor="#ffffff" style="background:#ffffff;padding:20px 40px 8px;" class="px"><div style="' + F + 'font-size:16px;line-height:24px;' + LH + 'color:#3D5566;">Enquanto isso, acompanhe o SIC de perto:</div></td></tr>' +
    '<tr><td bgcolor="#ffffff" align="left" style="background:#ffffff;padding:14px 40px 40px;border-radius:0 0 20px 20px;" class="px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
    '<td class="stack">' + button(site, 'Conheça o site', 'icon-site.png', '#8DC63F', '#0d2231') + '</td>' +
    '<td class="btn-gap" width="12" style="width:12px;font-size:0;line-height:0;">&nbsp;</td>' +
    '<td class="stack">' + button(ig, 'Siga no Instagram', 'icon-instagram.png', '#0d2231', '#ffffff') + '</td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:24px 40px 8px;" class="px">' +
    '<div style="' + F + 'font-size:12px;line-height:19px;' + LH + 'color:#3D5566;">Você recebeu esta mensagem porque se cadastrou no estande do SIC e autorizou o contato, conforme a LGPD. Este é um endereço automático e não recebe respostas. Para falar com a gente ou pedir a exclusão dos seus dados, acesse <a href="' + site + '" style="color:#1C7EB7;text-decoration:underline;">' + siteLabel + '</a>.</div>' +
    '<div style="' + F + 'font-size:12px;line-height:19px;' + LH + 'color:#7F97A8;padding-top:10px;">SIC – Sistema Integrado de Cooperativas</div>' +
    '</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>';
}

/* ============================== PAINEL ============================== */

function actionDashboard_() {
  var leads = rows_('Leads').map(function (r) {
    return { id: r[0], ts: iso_(r[1]), day: r[2], nome: r[3], cooperativa: r[4], ramo: r[5], cooperados: r[6], uf: r[7], cidade: r[8], atuacao: r[9], telefone: r[10], email: r[11], consent: r[12], email_status: r[14] };
  });
  var games = rows_('Participações').map(function (r) {
    return { id: r[0], leadId: r[1], nome: r[2], drawnAt: iso_(r[3]), day: r[4], result: r[5], type: r[6], label: r[7], coupon: r[8], message: r[9], revealedAt: iso_(r[10]), redeem: r[11], redeemedAt: iso_(r[12]), operator: r[13] };
  });
  var coupons = rows_('Cupons').map(function (r) {
    return { code: r[0], type: r[1], leadId: r[3], gameId: r[4], nome: r[5], issuedAt: iso_(r[6]), validUntil: iso_(r[7]), status: r[8], usedAt: iso_(r[9]), emailed: r[11] };
  });
  var log = rows_('Log').slice(-60).reverse().map(function (r) { return { at: iso_(r[0]), kind: r[1], gameId: r[2], leadId: r[3], detail: r[4], origin: r[5] }; });
  var cfg = readConfig_();
  return {
    ok: true, leads: leads, games: games, coupons: coupons, log: log,
    prizes: readPrizes_(), messages: readMessages_(), counts: prizeCounts_(), config: publicConfig_(cfg),
    raw: { email_ativo: yes_(cfg.email_ativo), email_logo_url: String(cfg.email_logo_url || ''), link_instagram: String(cfg.link_instagram || ''), link_site: String(cfg.link_site || '') },
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl(), emailQuota: MailApp.getRemainingDailyQuota(), serverTime: new Date().toISOString()
  };
}

function actionSaveSetup_(req, who) {
  var prizes = req.prizes || [], c = req.config || {}, msgs = req.messages;
  var sum = prizes.reduce(function (s, p) { return s + (Number(p.prob) || 0); }, 0);
  if (Math.abs(sum - 100) > 0.001) return { ok: false, error: 'A soma das chances precisa ser exatamente 100% (está em ' + (Math.round(sum * 100) / 100) + '%).' };
  if (!prizes.some(function (p) { return p.id === 'NO_PRIZE'; })) return { ok: false, error: 'O item "Sem premiação" não pode ser removido.' };
  var seen = {};
  for (var i = 0; i < prizes.length; i++) {
    var p = prizes[i];
    if (!p.id || seen[p.id]) return { ok: false, error: 'Prêmio com código repetido ou vazio.' };
    seen[p.id] = 1;
    if (!String(p.name || '').trim()) return { ok: false, error: 'Todo prêmio precisa de um nome.' };
    if ((Number(p.prob) || 0) < 0) return { ok: false, error: 'Chance não pode ser negativa.' };
  }
  if (c.pin != null && !/^\d{4,8}$/.test(String(c.pin))) return { ok: false, error: 'O PIN do totem precisa ter de 4 a 8 dígitos.' };

  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var oldPrizes = indexBy_(readPrizes_(), 'id');
    writePrizeRows_(ss.getSheetByName('Prêmios'), prizes.map(function (p) {
      var old = oldPrizes[p.id] || {};
      var kind = p.id === 'NO_PRIZE' ? '—' : ((p.kind || old.kind) === 'coupon' ? 'Cupom' : 'Brinde físico');
      return [p.id, String(p.name).trim(), kind, p.partner || '', kind === 'Cupom' ? (Number(p.pct) || 0) / 100 : '', kind === 'Cupom' ? (p.prefix || old.prefix || '') : '',
        (Number(p.prob) || 0) / 100, nz_(p.cap1), nz_(p.cap2), nz_(p.stock), p.active ? 'Sim' : 'Não', p.desc || '', p.conditions || ''];
    }));
    var map = { day1: 'dia1_data', day2: 'dia2_data', couponDays: 'validade_cupom_dias', resetSeconds: 'reinicio_sem_premio_s', prizeResetSeconds: 'reinicio_com_premio_s', idleSeconds: 'inatividade_s', pin: 'pin_equipe_totem', email_ativo: 'email_ativo', email_logo_url: 'email_logo_url', link_instagram: 'link_instagram', link_site: 'link_site' };
    var upd = {};
    Object.keys(map).forEach(function (k) {
      if (c[k] === undefined) return;
      var v = c[k];
      if (k === 'day1' || k === 'day2') v = v ? new Date(v + 'T12:00:00') : '';
      if (k === 'email_ativo') v = v ? 'Sim' : 'Não';
      upd[map[k]] = v;
    });
    upd.config_atualizada_em = new Date();
    upd.config_atualizada_por = who;
    var cs = ss.getSheetByName('Config'), cn = cs.getLastRow() - 1;
    var keys = cn > 0 ? cs.getRange(2, 1, cn, 1).getValues().map(function (r) { return r[0]; }) : [];
    Object.keys(upd).forEach(function (k) {
      var i = keys.indexOf(k);
      if (i >= 0) cs.getRange(i + 2, 2).setValue(upd[k]);
      else { cs.appendRow([k, upd[k], '']); keys.push(k); }
    });
    ['dia1_data', 'dia2_data'].forEach(function (k) { var i = keys.indexOf(k); if (i >= 0) cs.getRange(i + 2, 2).setNumberFormat('dd/mm/yyyy'); });
    if (msgs && msgs.length) {
      writeMessageRows_(ss.getSheetByName('Mensagens'), msgs.map(function (m) {
        var title = m.title === 'Que pena!' ? 'Que pena!' : 'Não foi dessa vez!';
        return [m.id, m.category || '', title, m.problem || '', m.solution || '', m.active ? 'Sim' : 'Não'];
      }));
    }
    ss.getSheetByName('Log').appendRow([new Date(), 'Configuração', '', '', 'Setup salvo pelo painel', 'painel · ' + who, 'CFG-' + Utilities.getUuid()]);
  } finally { lock.releaseLock(); }
  return actionDashboard_();
}

function nz_(v) { return v === '' || v === null || v === undefined || isNaN(Number(v)) ? '' : Number(v); }

function actionTestEmail_(req) {
  var to = String(req.to || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, error: 'E-mail inválido.' };
  var cfg = readConfig_();
  var coupon = req.withCoupon ? { kind: 'coupon', code: 'SIC-SETUP10-EXMP', name: '10% na implantação e setup', desc: '10% de desconto na implantação e setup do SIC.', conditions: 'Válido sobre o valor de implantação e setup em novos contratos assinados dentro da validade do cupom. Não cumulativo.', validUntil: new Date(Date.now() + (Number(cfg.validade_cupom_dias) || 30) * 864e5) } : null;
  sendWelcome_({ nome: req.nome || 'Maria Exemplo', email: to }, coupon, cfg);
  return { ok: true };
}

/* ============================== ESCRITA DE TABELAS ============================== */

function writePrizeRows_(sh, rows) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, SHEETS['Prêmios'].length).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, 11).setValues(rows.map(function (p) { return p.slice(0, 11); }));
  sh.getRange(2, 16, rows.length, 2).setValues(rows.map(function (p) { return [p[11], p[12]]; }));
  writePrizeFormulas_(sh, rows.length);
  sh.getRange(2, 5, rows.length, 1).setNumberFormat('0%');
  sh.getRange(2, 7, rows.length, 1).setNumberFormat('0.0%');
}

function writePrizeFormulas_(sh, n) {
  var f = [];
  for (var i = 0; i < n; i++) {
    var r = i + 2;
    f.push([
      '=COUNTIFS(' + P_ + '$G:$G,$A' + r + ',' + P_ + '$E:$E,"Dia 1")',
      '=COUNTIFS(' + P_ + '$G:$G,$A' + r + ',' + P_ + '$E:$E,"Dia 2")',
      '=COUNTIF(' + P_ + '$G:$G,$A' + r + ')',
      '=IF(J' + r + '="","sem limite",J' + r + '-N' + r + ')'
    ]);
  }
  setF_(sh.getRange(2, 12, n, 4), f);
}

function writeMessageRows_(sh, rows) {
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, SHEETS.Mensagens.length).clearContent();
  if (!rows.length) return;
  sh.getRange(2, 1, rows.length, 6).setValues(rows.map(function (m) { return m.slice(0, 6); }));
  writeMessageFormulas_(sh, rows.length);
}

function writeMessageFormulas_(sh, n) {
  var f = [];
  for (var i = 0; i < n; i++) f.push(['=COUNTIF(' + P_ + '$J:$J,A' + (i + 2) + '&" ·*")']);
  setF_(sh.getRange(2, 7, n, 1), f);
}

function randomKey_(n) {
  var a = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < n; i++) s += a.charAt(Math.floor(Math.random() * a.length));
  return s;
}
