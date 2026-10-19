/* Sincronização do totem com a planilha (Apps Script).
   - Fila de envio (outbox) persistida no navegador: cada evento é salvo aqui primeiro e enviado em lotes,
     com novas tentativas e espera crescente até conseguir. Ids determinísticos evitam duplicidade na planilha.
   - Regras de premiação buscadas a cada minuto e aplicadas no motor (SICGame.applyRemote), com cache local. */
(() => {
  if (window.SICSync) return;
  const OKEY = 'sic-outbox-v1', CKEY = 'sic-remote-config-v1', SKEY = 'sic-sync-status-v1';
  const cfg = window.SIC_CONFIG || {};
  const enabled = !!cfg.apiUrl;
  const BATCH = 25, CONFIG_EVERY = 60000, MAX_WAIT = 300000;

  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let outbox = read(OKEY, []);
  let status = { lastSentAt: '', lastConfigAt: '', lastError: '', ...read(SKEY, {}) };
  let wait = 5000, timer = null, sending = false;

  const emit = () => window.dispatchEvent(new Event('sic-sync-change'));
  const setStatus = patch => { status = { ...status, ...patch }; write(SKEY, status); emit(); };

  const post = async body => {
    const r = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ ...body, key: cfg.totemKey, site: location.origin }), redirect: 'follow' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'Falha no servidor');
    return j;
  };

  const schedule = ms => { clearTimeout(timer); timer = setTimeout(flush, ms); };

  async function flush() {
    if (!enabled || sending) return;
    outbox = read(OKEY, outbox);
    if (!outbox.length) return;
    if (navigator.onLine === false) return schedule(15000);
    sending = true;
    try {
      const batch = outbox.slice(0, BATCH);
      const j = await post({ action: 'events', events: batch });
      const acked = new Set(j.acked || []);
      outbox = read(OKEY, outbox).filter(e => !acked.has(e.id));
      write(OKEY, outbox);
      const errs = j.errors || [];
      setStatus({ lastSentAt: new Date().toISOString(), lastError: errs.length ? errs[0].error : '' });
      wait = errs.length && !acked.size ? Math.min(wait * 2, MAX_WAIT) : 5000;
      if (outbox.length) schedule(errs.length && !acked.size ? wait : 300);
    } catch (e) {
      setStatus({ lastError: String(e.message || e) });
      wait = Math.min(wait * 2, MAX_WAIT);
      schedule(wait);
    } finally { sending = false; emit(); }
  }

  async function pullConfig() {
    if (!enabled) return;
    try {
      const j = await post({ action: 'config' });
      write(CKEY, j);
      if (window.SICGame) window.SICGame.applyRemote(j);
      setStatus({ lastConfigAt: new Date().toISOString(), lastError: '' });
    } catch (e) { setStatus({ lastError: String(e.message || e) }); }
  }

  const api = {
    enabled,
    enqueue(kind, id, data) {
      if (!enabled) return; // modo local: nada a enviar
      outbox = read(OKEY, outbox);
      if (outbox.some(e => e.id === id)) return;
      outbox.push({ id, kind, at: new Date().toISOString(), data });
      write(OKEY, outbox);
      emit();
      if (enabled) { wait = 5000; schedule(200); }
    },
    flush: () => { wait = 5000; return flush(); },
    pullConfig,
    pending: () => read(OKEY, outbox).length,
    status: () => ({ ...status, enabled, pending: read(OKEY, outbox).length })
  };
  window.SICSync = api;

  const boot = () => {
    if (!window.SICGame) return setTimeout(boot, 100);
    const cached = read(CKEY, null);
    if (cached) window.SICGame.applyRemote(cached);
    if (!enabled) return;
    pullConfig();
    setInterval(pullConfig, CONFIG_EVERY);
    setInterval(() => { if (!sending && read(OKEY, []).length) flush(); }, 30000);
    window.addEventListener('online', () => { wait = 5000; flush(); pullConfig(); });
    flush();
  };
  boot();
})();
