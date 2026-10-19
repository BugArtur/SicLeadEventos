/* Raspadinha SIC — motor do jogo (camada de serviço).
   O sorteio acontece no totem (funciona sem internet). As regras (prêmios, chances, tetos por dia,
   estoque, mensagens) vêm da planilha via SICSync.applyRemote e ficam em cache local.
   Cada operação é transacional (estado copiado, alterado e gravado de uma vez; em caso de erro, nada muda).
   Regra de teto: prêmio que bate o teto do dia ou esgota o estoque sai do sorteio e a chance dele vai para "Sem premiação". */
(() => {
  if (window.SICGame) return;
  const KEY = 'sic-game-v1', SKEY = 'sic-game-session';
  const T1 = 'Não foi dessa vez!', T2 = 'Que pena!';
  const MSGS = [
    ['eSocial', T1, 'Seu eSocial travou e você perdeu o prazo!', 'Com o SIC, menos burocracia e mais controle das obrigações da sua cooperativa!', 'alert'],
    ['Nota Fiscal', T2, 'Um erro no preenchimento manual da nota fiscal obrigou você a refazer tudo!', 'Automatize a emissão de notas fiscais com o SIC!', 'receipt'],
    ['Folha de pagamento', T1, 'A folha não fechou e os cooperados estão cobrando o pagamento!', 'Simplifique a geração da folha e os pagamentos com o SIC!', 'wallet'],
    ['Planilhas', T2, 'Sua planilha corrompeu bem na hora de fechar o mês!', 'Com o SIC, sua gestão não depende de planilhas intermináveis!', 'sheet'],
    ['Pagamentos', T1, 'O banco rejeitou seu arquivo CNAB e você terá que começar novamente!', 'Integre seus pagamentos e elimine processos manuais com o SIC!', 'bank'],
    ['Cadastros duplicados', T2, 'Você cadastrou o mesmo cooperado três vezes e agora não sabe qual registro está correto!', 'Centralize a gestão dos cooperados em um só lugar com o SIC!', 'users'],
    ['Contratos', T1, 'A diretoria pediu um contrato e ninguém sabe onde ele foi salvo!', 'Com o SIC, seus contratos ficam organizados e acessíveis!', 'folder'],
    ['Retrabalho', T2, 'Você ganhou mais uma tarde digitando as mesmas informações em sistemas diferentes!', 'Com o SIC, integre processos e reduza o retrabalho!', 'refresh'],
    ['Conciliação bancária', T1, 'O saldo do banco não bateu com sua planilha!', 'Facilite a conferência financeira com a integração bancária do SIC!', 'coins'],
    ['Informações descentralizadas', T2, 'Cada setor apresentou um número diferente na reunião!', 'Com o SIC, todos trabalham com informações centralizadas!', 'layers'],
    ['Produtividade', T1, 'Você passou três horas copiando dados de uma planilha para outra!', 'Automatize processos e ganhe tempo com o SIC!', 'clock'],
    ['Obrigações fiscais', T2, 'Uma obrigação ficou esquecida e o prazo venceu!', 'Organize suas rotinas e acompanhe as pendências com o SIC!', 'bell'],
    ['Gestão de cooperados', T1, 'Um cooperado ficou de fora da folha porque seu cadastro estava desatualizado!', 'Centralize os dados e simplifique a gestão dos cooperados com o SIC!', 'search'],
    ['Relatórios', T2, 'A diretoria pediu um relatório urgente e os dados estão espalhados em cinco planilhas!', 'Tenha indicadores centralizados e acessíveis com o SIC!', 'chart'],
    ['Processos manuais', T1, 'Sua equipe passou o dia inteiro fazendo tarefas que poderiam ser automáticas!', 'Modernize sua cooperativa e ganhe eficiência com o SIC!', 'hourglass']
  ];
  const MSG_ICON = Object.fromEntries(MSGS.map((m, i) => ['M' + String(i + 1).padStart(2, '0'), m[4]]));
  const ICONS = {
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0"/><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v1"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z"/><path d="M8 7h8M8 11h8M8 15h5"/>',
    wallet: '<path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3v3a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V5"/>',
    sheet: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
    bank: '<path d="M3 22h18"/><path d="M6 18v-7M10 18v-7M14 18v-7M18 18v-7"/><path d="m12 2 9 5H3z"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/><path d="M12 10v4M12 17h.01"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18"/><path d="M7 6h1v4"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 8 4 4 3-3 6 6"/><path d="M20 11v4h-4"/>',
    hourglass: '<path d="M5 22h14M5 2h14"/><path d="M17 22v-4.2a2 2 0 0 0-.6-1.4L12 12l-4.4 4.4a2 2 0 0 0-.6 1.4V22"/><path d="M7 2v4.2a2 2 0 0 0 .6 1.4L12 12l4.4-4.4a2 2 0 0 0 .6-1.4V2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>'
  };
  const icon = (name, color, sw) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="' + (color || '#0d2231') + '" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[name] || ICONS.sparkle) + '</svg>');

  /* Prêmios padrão — usados até o totem receber as regras da planilha. kind: coupon | gift | none */
  const DEFAULT_PRIZES = [
    { id: 'GIFT', name: 'Brinde SIC', kind: 'gift', partner: '', pct: 0, prefix: '', prob: 15, cap1: 20, cap2: 20, stock: 40, active: true, desc: 'Brinde físico retirado no estande do SIC.', conditions: '' },
    { id: 'DISCOUNT_5', name: '5% na assinatura', kind: 'coupon', partner: '', pct: 5, prefix: 'SIC-5OFF-', prob: 10, cap1: 15, cap2: 15, stock: null, active: true, desc: '5% de desconto na assinatura do SIC.', conditions: 'Válido para novos contratos do SIC assinados dentro da validade do cupom. Não cumulativo com outras promoções.' },
    { id: 'SETUP_10', name: '10% na implantação e setup', kind: 'coupon', partner: '', pct: 10, prefix: 'SIC-SETUP10-', prob: 5, cap1: 5, cap2: 5, stock: null, active: true, desc: '10% de desconto na implantação e setup do SIC.', conditions: 'Válido sobre o valor de implantação e setup em novos contratos assinados dentro da validade do cupom. Não cumulativo.' },
    { id: 'NO_PRIZE', name: 'Sem premiação', kind: 'none', partner: '', pct: 0, prefix: '', prob: 70, cap1: null, cap2: null, stock: null, active: true, desc: '', conditions: '' }
  ];

  const defaults = () => ({
    config: { couponDays: 30, resetSeconds: 15, prizeResetSeconds: 60, idleSeconds: 60, pin: '1234', day1: '', day2: '', updatedAt: '', updatedBy: '' },
    prizes: JSON.parse(JSON.stringify(DEFAULT_PRIZES)),
    remoteCounts: {}, remoteAt: '',
    messages: MSGS.map((m, i) => ({ id: 'M' + String(i + 1).padStart(2, '0'), category: m[0], title: m[1], problem: m[2], solution: m[3], icon: m[4], active: true })),
    games: [], coupons: [], log: []
  });

  const load = () => {
    try {
      const j = JSON.parse(localStorage.getItem(KEY));
      if (j && j.config) {
        const d = defaults();
        const out = { ...d, ...j, config: { ...d.config, ...j.config } };
        if (!Array.isArray(j.prizes)) out.prizes = d.prizes; // base antiga (antes das regras por planilha)
        return out;
      }
    } catch (e) {}
    return defaults();
  };
  let db = load();
  const emit = () => window.dispatchEvent(new Event('sic-game-change'));
  window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); emit(); } });

  const tx = fn => {
    const d = JSON.parse(JSON.stringify(db));
    const r = fn(d);
    localStorage.setItem(KEY, JSON.stringify(d));
    db = d; emit();
    return r;
  };
  const sync = (kind, id, data) => { try { if (window.SICSync) window.SICSync.enqueue(kind, id, data); } catch (e) {} };
  const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rcode = n => Array.from({ length: n }, () => ALPH[Math.floor(rnd() * ALPH.length)]).join('');
  const now = () => new Date().toISOString();
  const pad = n => String(n).padStart(2, '0');
  const dateKey = (dt = new Date()) => dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
  const couponStatus = c => (c.status === 'Disponível' && c.expiresAt && new Date(c.expiresAt) < new Date()) ? 'Expirado' : c.status;
  const isTitle = t => t === T1 || t === T2;

  /* Tipos derivados dos prêmios configurados (mantém o formato usado pela tela e pelo painel do totem). */
  const typesOf = d => {
    const o = {};
    d.prizes.forEach(p => { o[p.id] = { label: p.name, prize: p.kind !== 'none', kind: p.kind, pct: p.pct, prefix: p.prefix, partner: p.partner, desc: p.desc, conditions: p.conditions }; });
    if (!o.NO_PRIZE) o.NO_PRIZE = { label: 'Sem premiação', prize: false, kind: 'none' };
    d.games.forEach(g => { if (!o[g.type]) o[g.type] = { label: g.typeLabel || g.type, prize: g.type !== 'NO_PRIZE', kind: g.couponCode ? 'coupon' : 'gift' }; });
    return o;
  };

  /* Dia do evento: compara a data local do totem com as datas configuradas. */
  const dayOf = (d, key) => key && key === d.config.day1 ? { label: 'Dia 1', n: 1 } : key && key === d.config.day2 ? { label: 'Dia 2', n: 2 } : { label: 'Ensaio', n: 1 };

  /* Quantos já saíram: maior valor entre o registro local e o da planilha (protege contra dados locais apagados). */
  const usedOn = (d, id, key) => Math.max(d.games.filter(g => g.type === id && (g.dayKey || (g.drawnAt || '').slice(0, 10)) === key).length, ((d.remoteCounts[id] || {}).byDate || {})[key] || 0);
  const usedTotal = (d, id) => Math.max(d.games.filter(g => g.type === id).length, (d.remoteCounts[id] || {}).total || 0);

  const capFor = (d, p, key) => { const n = dayOf(d, key).n; const v = n === 2 ? p.cap2 : p.cap1; return v === null || v === undefined || v === '' ? null : Number(v); };

  const availability = (d, p, key) => {
    if (p.kind === 'none') return { ok: true };
    if (!p.active) return { ok: false, why: 'Inativo' };
    if (!(Number(p.prob) > 0)) return { ok: false, why: 'Chance 0%' };
    const cap = capFor(d, p, key), today = usedOn(d, p.id, key);
    if (cap !== null && today >= cap) return { ok: false, why: 'Teto do dia atingido' };
    if (p.stock !== null && p.stock !== undefined && p.stock !== '' && usedTotal(d, p.id) >= Number(p.stock)) return { ok: false, why: 'Estoque esgotado' };
    return { ok: true };
  };

  const api = {
    T1, T2, icon,
    get TYPES() { return typesOf(db); },
    get: () => db,
    reload: () => { db = load(); emit(); return db; },
    couponStatus, dateKey,
    dayLabel: () => dayOf(db, dateKey()).label,

    /* Situação de cada prêmio hoje (usado no painel da equipe do totem). */
    prizeStatus() {
      const key = dateKey();
      return db.prizes.map(p => {
        const a = availability(db, p, key);
        return { ...p, capToday: capFor(db, p, key), usedToday: usedOn(db, p.id, key), usedTotal: usedTotal(db, p.id), available: a.ok, why: a.why || '' };
      });
    },
    giftAvailable: () => db.prizes.filter(p => p.kind === 'gift' && p.stock !== null && p.stock !== '').reduce((s, p) => s + Math.max(0, Number(p.stock) - usedTotal(db, p.id)), 0),

    /* Recebe as regras da planilha (via SICSync). */
    applyRemote(r) {
      if (!r || !Array.isArray(r.prizes) || !r.prizes.length) return;
      tx(d => {
        d.config = { ...d.config, ...(r.config || {}) };
        d.prizes = r.prizes.map(p => ({ ...p, prob: Number(p.prob) || 0 }));
        if (!d.prizes.some(p => p.id === 'NO_PRIZE')) d.prizes.push({ ...DEFAULT_PRIZES[3], prob: 0 });
        if (Array.isArray(r.messages) && r.messages.length) d.messages = r.messages.map(m => ({ ...m, icon: MSG_ICON[m.id] || 'sparkle' }));
        d.remoteCounts = r.counts || {};
        d.remoteAt = now();
      });
    },

    /* Sorteio ponderado. Idempotente por lead: a segunda chamada devolve a mesma participação. */
    draw(leadId, lead) {
      if (!leadId) throw new Error('Lead inválido.');
      const prev = db.games.find(g => g.leadId === leadId);
      if (prev) return prev;
      let cpOut = null;
      const g = tx(d => {
        const again = d.games.find(g => g.leadId === leadId);
        if (again) return again;
        const key = dateKey();
        const pool = d.prizes.filter(p => p.kind !== 'none' && availability(d, p, key).ok).map(p => [p, Number(p.prob)]);
        const taken = pool.reduce((s, x) => s + x[1], 0);
        const noWeight = Math.max(0, 100 - taken); // regra A: chance dos prêmios indisponíveis vai para "Sem premiação"
        let prize = null;
        let x = rnd() * (taken + noWeight);
        for (const [p, w] of pool) { x -= w; if (x < 0) { prize = p; break; } }
        const type = prize ? prize.id : 'NO_PRIZE';
        let gid; do { gid = 'G-' + rcode(6); } while (d.games.some(g => g.id === gid));
        const at = now();
        const day = dayOf(d, key);
        const g = { id: gid, leadId, type, typeLabel: prize ? prize.name : 'Sem premiação', result: prize ? 'Premiado' : 'Não premiado', couponCode: '', messageId: '', drawnAt: at, dayKey: key, dayLabel: day.label, revealedAt: '', redeemStatus: prize ? 'Pendente' : '—', redeemedAt: '', operator: '' };
        let cp = null;
        if (prize && prize.kind === 'coupon') {
          const prefix = prize.prefix || ('SIC-' + prize.id + '-');
          let code; do { code = prefix + rcode(4); } while (d.coupons.some(x => x.code === code));
          cp = { id: 'C-' + rcode(6), code, leadId, gameId: gid, type, pct: Number(prize.pct) || 0, issuedAt: at, expiresAt: new Date(Date.now() + (Number(d.config.couponDays) || 30) * 864e5).toISOString(), status: 'Disponível', usedAt: '', operator: '' };
          d.coupons.push(cp);
          g.couponCode = code;
        }
        if (!prize) {
          const act = d.messages.filter(m => m.active && isTitle(m.title));
          const from = act.length ? act : d.messages;
          const m = from[Math.floor(rnd() * from.length)];
          g.messageId = m ? m.id : '';
        }
        d.games.push(g);
        d.log.push({ at, kind: 'Sorteio', gameId: gid, leadId, detail: g.typeLabel + (g.couponCode ? ' · ' + g.couponCode : '') });
        cpOut = cp;
        return g;
      });
      const m = g.messageId ? db.messages.find(x => x.id === g.messageId) : null;
      sync('draw', 'draw:' + g.id, { gameId: g.id, leadId, nome: (lead && lead.nome) || '', type: g.type, typeLabel: g.typeLabel, prize: g.type !== 'NO_PRIZE', couponCode: g.couponCode, pct: cpOut ? cpOut.pct : 0, expiresAt: cpOut ? cpOut.expiresAt : '', messageId: g.messageId, messageCategory: m ? m.category : '', drawnAt: g.drawnAt, dayLabel: g.dayLabel });
      return api.game(g.id);
    },
    gameByLead: leadId => db.games.find(g => g.leadId === leadId) || null,
    game: id => db.games.find(g => g.id === id) || null,
    message: id => db.messages.find(m => m.id === id) || null,
    coupon: code => db.coupons.find(c => c.code === code) || null,

    reveal(gameId) {
      const g = api.game(gameId);
      if (!g || g.revealedAt) return g;
      const x = tx(d => { const x = d.games.find(y => y.id === gameId); x.revealedAt = now(); d.log.push({ at: x.revealedAt, kind: 'Revelação', gameId, leadId: x.leadId, detail: x.typeLabel || x.type }); return x; });
      sync('reveal', 'reveal:' + gameId, { gameId, leadId: x.leadId });
      return x;
    },

    /* Visitante saiu sem raspar: avisa a planilha para enviar o e-mail mesmo assim. */
    close(gameId) {
      const g = api.game(gameId);
      if (!g || g.revealedAt) return;
      sync('close', 'close:' + gameId, { gameId, leadId: g.leadId });
    },

    /* Resgate: só por operador autenticado; impede duplicidade. */
    redeem(gameId, operator) {
      if (!operator) throw new Error('Operador não autenticado.');
      const g = tx(d => {
        const g = d.games.find(y => y.id === gameId);
        if (!g) throw new Error('Participação não encontrada.');
        if (g.type === 'NO_PRIZE') throw new Error('Esta participação não tem prêmio.');
        if (g.redeemStatus === 'Resgatado') throw new Error('Prêmio já resgatado em ' + new Date(g.redeemedAt).toLocaleString('pt-BR') + ' por ' + g.operator + '.');
        const at = now();
        if (g.couponCode) {
          const c = d.coupons.find(x => x.code === g.couponCode);
          const st = couponStatus(c);
          if (st !== 'Disponível') throw new Error('Cupom ' + st.toLowerCase() + '.');
          c.status = 'Resgatado'; c.usedAt = at; c.operator = operator;
        }
        g.redeemStatus = 'Resgatado'; g.redeemedAt = at; g.operator = operator;
        d.log.push({ at, kind: 'Resgate', gameId, leadId: g.leadId, detail: (g.typeLabel || g.type) + (g.couponCode ? ' · ' + g.couponCode : '') + ' · ' + operator });
        return g;
      });
      sync('redeem', 'redeem:' + gameId, { gameId, leadId: g.leadId, operator, redeemedAt: g.redeemedAt });
      return g;
    },

    messageUses: id => db.games.filter(g => g.messageId === id).length,

    stats() {
      const T = typesOf(db);
      const g = db.games, cps = db.coupons.map(c => ({ ...c, st: couponStatus(c) }));
      const prem = g.filter(x => x.type !== 'NO_PRIZE').length;
      const isGift = x => (T[x.type] || {}).kind === 'gift';
      const byDay = {};
      g.forEach(x => { const k = x.dayKey || x.drawnAt.slice(0, 10); byDay[k] = (byDay[k] || 0) + 1; });
      const msgCount = {};
      g.filter(x => x.messageId).forEach(x => { msgCount[x.messageId] = (msgCount[x.messageId] || 0) + 1; });
      return {
        total: g.length, premiados: prem, naoPremiados: g.length - prem, taxa: g.length ? prem / g.length : 0,
        byType: Object.fromEntries(Object.keys(T).map(t => [t, g.filter(x => x.type === t).length])),
        brindesDistribuidos: g.filter(isGift).length, brindesResgatados: g.filter(x => isGift(x) && x.redeemStatus === 'Resgatado').length, estoque: api.giftAvailable(),
        cupons5: cps.filter(c => c.type === 'DISCOUNT_5').length, cupons10: cps.filter(c => c.type === 'SETUP_10').length,
        cuponsUsados: cps.filter(c => c.st === 'Resgatado').length, cuponsDisponiveis: cps.filter(c => c.st === 'Disponível').length,
        cupons5Usados: cps.filter(c => c.type === 'DISCOUNT_5' && c.st === 'Resgatado').length, cupons10Usados: cps.filter(c => c.type === 'SETUP_10' && c.st === 'Resgatado').length,
        byDay, msgCount
      };
    },
    resetAll() { return tx(d => { d.games = []; d.coupons = []; d.log = []; }); },

    session: {
      get() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } },
      set(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} },
      clear() { try { localStorage.removeItem(SKEY); } catch (e) {} }
    }
  };
  window.SICGame = api;
})();
