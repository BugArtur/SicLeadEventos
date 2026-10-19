/* Raspadinha SIC — motor do jogo (camada de serviço).
   Mesma interface que a API do backend deve expor: draw, reveal, redeem, config, mensagens, stats.
   Nesta versão a persistência é local (localStorage) e cada operação é transacional
   (estado copiado, alterado e gravado de uma vez; em caso de erro, nada muda). */
(() => {
  if (window.SICGame) return;
  const KEY = 'sic-game-v1', SKEY = 'sic-game-session';
  const T1 = 'Não foi dessa vez!', T2 = 'Que pena!';
  const TYPES = {
    GIFT: { label: 'Brinde SIC', prize: true },
    DISCOUNT_5: { label: '5% na assinatura', prize: true, pct: 5, prefix: 'SIC-5OFF-' },
    SETUP_10: { label: '10% na implantação e setup', prize: true, pct: 10, prefix: 'SIC-SETUP10-' },
    NO_PRIZE: { label: 'Sem premiação', prize: false }
  };
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

  const defaults = () => ({
    config: {
      probs: { GIFT: 15, DISCOUNT_5: 10, SETUP_10: 5, NO_PRIZE: 70 },
      active: { GIFT: true, DISCOUNT_5: true, SETUP_10: true },
      giftName: 'Brinde exclusivo SIC',
      couponDays: 30,
      desc: { GIFT: 'Brinde físico retirado no estande do SIC.', DISCOUNT_5: '5% de desconto na assinatura do SIC.', SETUP_10: '10% de desconto na implantação e setup do SIC.' },
      conditions: {
        DISCOUNT_5: 'Válido para novos contratos do SIC assinados dentro da validade do cupom. Não cumulativo com outras promoções.',
        SETUP_10: 'Válido sobre o valor de implantação e setup em novos contratos assinados dentro da validade do cupom. Não cumulativo.'
      },
      resetSeconds: 15,
      prizeResetSeconds: 60,
      pin: '1234'
    },
    stock: { initial: 100, reserved: 0, redeemed: 0 },
    messages: MSGS.map((m, i) => ({ id: 'M' + String(i + 1).padStart(2, '0'), category: m[0], title: m[1], problem: m[2], solution: m[3], icon: m[4], active: true })),
    games: [], coupons: [], log: []
  });

  const load = () => {
    try { const j = JSON.parse(localStorage.getItem(KEY)); if (j && j.config) { const d = defaults(); return { ...d, ...j, config: { ...d.config, ...j.config, probs: { ...d.config.probs, ...j.config.probs }, active: { ...d.config.active, ...j.config.active } } }; } } catch (e) {}
    return defaults();
  };
  let db = load();
  const emit = () => window.dispatchEvent(new Event('sic-game-change'));
  window.addEventListener('storage', e => { if (e.key === KEY) { db = load(); emit(); } });

  const tx = fn => {
    const snap = JSON.stringify(db);
    const d = JSON.parse(snap);
    const r = fn(d);
    localStorage.setItem(KEY, JSON.stringify(d));
    db = d; emit();
    return r;
  };
  const rnd = () => { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; };
  const ALPH = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const rcode = n => Array.from({ length: n }, () => ALPH[Math.floor(rnd() * ALPH.length)]).join('');
  const now = () => new Date().toISOString();
  const couponStatus = c => (c.status === 'Disponível' && c.expiresAt && new Date(c.expiresAt) < new Date()) ? 'Expirado' : c.status;
  const giftAvailable = d => Math.max(0, d.stock.initial - d.stock.reserved);
  const isTitle = t => t === T1 || t === T2;

  const api = {
    TYPES, T1, T2, icon,
    get: () => db,
    reload: () => { db = load(); emit(); return db; },
    couponStatus, giftAvailable: () => giftAvailable(db),

    /* Sorteio ponderado. Idempotente por lead: a segunda chamada devolve a mesma participação. */
    draw(leadId) {
      if (!leadId) throw new Error('Lead inválido.');
      const prev = db.games.find(g => g.leadId === leadId);
      if (prev) return prev;
      return tx(d => {
        const again = d.games.find(g => g.leadId === leadId);
        if (again) return again;
        const c = d.config;
        const pool = Object.keys(TYPES)
          .filter(t => t === 'NO_PRIZE' || (c.active[t] && (t !== 'GIFT' || giftAvailable(d) > 0)))
          .map(t => [t, Math.max(0, Number(c.probs[t]) || 0)])
          .filter(x => x[1] > 0);
        const total = pool.reduce((s, x) => s + x[1], 0);
        let type = 'NO_PRIZE';
        if (total > 0) { let x = rnd() * total; for (const [t, w] of pool) { x -= w; if (x < 0) { type = t; break; } } }
        let gid; do { gid = 'G-' + rcode(6); } while (d.games.some(g => g.id === gid));
        const at = now();
        const g = { id: gid, leadId, type, result: TYPES[type].prize ? 'Premiado' : 'Não premiado', couponCode: '', messageId: '', drawnAt: at, revealedAt: '', redeemStatus: TYPES[type].prize ? 'Pendente' : '—', redeemedAt: '', operator: '' };
        if (type === 'GIFT') d.stock.reserved += 1;
        if (TYPES[type].prefix) {
          let code; do { code = TYPES[type].prefix + rcode(4); } while (d.coupons.some(x => x.code === code));
          d.coupons.push({ id: 'C-' + rcode(6), code, leadId, gameId: gid, type, pct: TYPES[type].pct, issuedAt: at, expiresAt: new Date(Date.now() + (Number(c.couponDays) || 30) * 864e5).toISOString(), status: 'Disponível', usedAt: '', operator: '' });
          g.couponCode = code;
        }
        if (type === 'NO_PRIZE') {
          const act = d.messages.filter(m => m.active && isTitle(m.title));
          const from = act.length ? act : d.messages;
          const m = from[Math.floor(rnd() * from.length)];
          g.messageId = m ? m.id : '';
        }
        d.games.push(g);
        d.log.push({ at, kind: 'Sorteio', gameId: gid, leadId, detail: TYPES[type].label + (g.couponCode ? ' · ' + g.couponCode : '') });
        return g;
      });
    },
    gameByLead: leadId => db.games.find(g => g.leadId === leadId) || null,
    game: id => db.games.find(g => g.id === id) || null,
    message: id => db.messages.find(m => m.id === id) || null,
    coupon: code => db.coupons.find(c => c.code === code) || null,

    reveal(gameId) {
      const g = api.game(gameId);
      if (!g || g.revealedAt) return g;
      return tx(d => { const x = d.games.find(y => y.id === gameId); x.revealedAt = now(); d.log.push({ at: x.revealedAt, kind: 'Revelação', gameId, leadId: x.leadId, detail: TYPES[x.type].label }); return x; });
    },

    /* Resgate: só por operador autenticado; impede duplicidade. */
    redeem(gameId, operator) {
      if (!operator) throw new Error('Operador não autenticado.');
      return tx(d => {
        const g = d.games.find(y => y.id === gameId);
        if (!g) throw new Error('Participação não encontrada.');
        if (!TYPES[g.type].prize) throw new Error('Esta participação não tem prêmio.');
        if (g.redeemStatus === 'Resgatado') throw new Error('Prêmio já resgatado em ' + new Date(g.redeemedAt).toLocaleString('pt-BR') + ' por ' + g.operator + '.');
        const at = now();
        if (g.couponCode) {
          const c = d.coupons.find(x => x.code === g.couponCode);
          const st = couponStatus(c);
          if (st !== 'Disponível') throw new Error('Cupom ' + st.toLowerCase() + '.');
          c.status = 'Resgatado'; c.usedAt = at; c.operator = operator;
        }
        if (g.type === 'GIFT') d.stock.redeemed += 1;
        g.redeemStatus = 'Resgatado'; g.redeemedAt = at; g.operator = operator;
        d.log.push({ at, kind: 'Resgate', gameId, leadId: g.leadId, detail: TYPES[g.type].label + (g.couponCode ? ' · ' + g.couponCode : '') + ' · ' + operator });
        return g;
      });
    },
    cancelCoupon(code, operator) {
      return tx(d => {
        const c = d.coupons.find(x => x.code === code);
        if (!c) throw new Error('Cupom não encontrado.');
        if (c.status === 'Resgatado') throw new Error('Cupom já utilizado.');
        c.status = 'Cancelado';
        const g = d.games.find(y => y.id === c.gameId); if (g) g.redeemStatus = 'Cancelado';
        d.log.push({ at: now(), kind: 'Cancelamento', gameId: c.gameId, leadId: c.leadId, detail: code + ' · ' + operator });
      });
    },

    saveConfig(cfg, stockInitial) {
      const sum = ['GIFT', 'DISCOUNT_5', 'SETUP_10', 'NO_PRIZE'].reduce((s, k) => s + (Number(cfg.probs[k]) || 0), 0);
      if (Math.abs(sum - 100) > 1e-9) throw new Error('A soma das probabilidades precisa ser 100%.');
      if (Object.values(cfg.probs).some(v => Number(v) < 0)) throw new Error('Probabilidades não podem ser negativas.');
      if (!(Number(cfg.couponDays) >= 1)) throw new Error('Validade do cupom inválida.');
      return tx(d => {
        if (stockInitial != null) {
          const n = Math.floor(Number(stockInitial));
          if (!(n >= d.stock.reserved)) throw new Error('O estoque não pode ser menor que os ' + d.stock.reserved + ' brindes já sorteados.');
          d.stock.initial = n;
        }
        d.config = { ...d.config, ...cfg, probs: Object.fromEntries(Object.entries(cfg.probs).map(([k, v]) => [k, Number(v)])), couponDays: Number(cfg.couponDays), resetSeconds: Number(cfg.resetSeconds) || 15 };
        d.log.push({ at: now(), kind: 'Configuração', gameId: '', leadId: '', detail: 'Regras atualizadas' });
      });
    },
    updateMessage(id, patch) {
      if (patch.title != null && !isTitle(patch.title)) throw new Error('O título deve ser "' + T1 + '" ou "' + T2 + '".');
      return tx(d => { const m = d.messages.find(x => x.id === id); if (m) Object.assign(m, patch); });
    },
    addMessage() {
      return tx(d => {
        let n = d.messages.length + 1, id; do { id = 'M' + String(n++).padStart(2, '0'); } while (d.messages.some(m => m.id === id));
        d.messages.push({ id, category: 'Nova', title: T1, problem: 'Descreva a situação da cooperativa.', solution: 'Mostre como o SIC resolve.', icon: 'sparkle', active: false });
        return id;
      });
    },
    deleteMessage(id) {
      if (db.games.some(g => g.messageId === id)) throw new Error('Mensagem já exibida a visitantes; desative em vez de excluir.');
      return tx(d => { d.messages = d.messages.filter(m => m.id !== id); });
    },
    messageUses: id => db.games.filter(g => g.messageId === id).length,

    stats() {
      const g = db.games, cps = db.coupons.map(c => ({ ...c, st: couponStatus(c) }));
      const prem = g.filter(x => TYPES[x.type].prize).length;
      const byDay = {};
      g.forEach(x => { const k = x.drawnAt.slice(0, 10); byDay[k] = (byDay[k] || 0) + 1; });
      const msgCount = {};
      g.filter(x => x.messageId).forEach(x => { msgCount[x.messageId] = (msgCount[x.messageId] || 0) + 1; });
      return {
        total: g.length, premiados: prem, naoPremiados: g.length - prem, taxa: g.length ? prem / g.length : 0,
        byType: Object.fromEntries(Object.keys(TYPES).map(t => [t, g.filter(x => x.type === t).length])),
        brindesDistribuidos: db.stock.reserved, brindesResgatados: db.stock.redeemed, estoque: giftAvailable(db),
        cupons5: cps.filter(c => c.type === 'DISCOUNT_5').length, cupons10: cps.filter(c => c.type === 'SETUP_10').length,
        cuponsUsados: cps.filter(c => c.st === 'Resgatado').length, cuponsDisponiveis: cps.filter(c => c.st === 'Disponível').length,
        cupons5Usados: cps.filter(c => c.type === 'DISCOUNT_5' && c.st === 'Resgatado').length, cupons10Usados: cps.filter(c => c.type === 'SETUP_10' && c.st === 'Resgatado').length,
        byDay, msgCount
      };
    },
    resetAll() { return tx(d => { d.games = []; d.coupons = []; d.log = []; d.stock.reserved = 0; d.stock.redeemed = 0; }); },

    session: {
      get() { try { return JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } },
      set(s) { try { localStorage.setItem(SKEY, JSON.stringify(s)); } catch (e) {} },
      clear() { try { localStorage.removeItem(SKEY); } catch (e) {} }
    }
  };
  window.SICGame = api;
})();
