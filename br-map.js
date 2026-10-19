(() => {
  if (customElements.get('br-map')) return;
  const UF = {11:['RO','Rondônia'],12:['AC','Acre'],13:['AM','Amazonas'],14:['RR','Roraima'],15:['PA','Pará'],16:['AP','Amapá'],17:['TO','Tocantins'],21:['MA','Maranhão'],22:['PI','Piauí'],23:['CE','Ceará'],24:['RN','Rio Grande do Norte'],25:['PB','Paraíba'],26:['PE','Pernambuco'],27:['AL','Alagoas'],28:['SE','Sergipe'],29:['BA','Bahia'],31:['MG','Minas Gerais'],32:['ES','Espírito Santo'],33:['RJ','Rio de Janeiro'],35:['SP','São Paulo'],41:['PR','Paraná'],42:['SC','Santa Catarina'],43:['RS','Rio Grande do Sul'],50:['MS','Mato Grosso do Sul'],51:['MT','Mato Grosso'],52:['GO','Goiás'],53:['DF','Distrito Federal']};
  window.SIC_UF = UF;
  const SRC = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';
  const KEY = 'sic-br-uf-geo-v1';
  let geoP = null;
  function getGeo() {
    if (geoP) return geoP;
    geoP = (async () => {
      try { const c = localStorage.getItem(KEY); if (c) return JSON.parse(c); } catch (e) {}
      const r = await fetch(SRC);
      if (!r.ok) throw new Error('geo ' + r.status);
      const j = await r.json();
      try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) {}
      return j;
    })();
    geoP.catch(() => { geoP = null; });
    return geoP;
  }
  const K = Math.cos(15 * Math.PI / 180);
  const px = c => [c[0] * K, -c[1]];
  const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * r[i][1] - r[i][0] * r[j][1]); return a / 2; };
  const ringCentroid = r => { let x = 0, y = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f; } a *= 3; return a ? [x / a, y / a] : r[0]; };
  const codeOf = f => { const p = f.properties || {}; return String(p.codarea || p.CD_UF || p.cod || f.id || '').slice(0, 2); };

  class BrMap extends HTMLElement {
    static get observedAttributes() { return ['selected']; }
    connectedCallback() {
      this.style.display = 'block'; this.style.position = 'relative'; this.style.width = this.style.width || '100%'; this.style.height = this.style.height || '100%';
      if (!this._init) { this._init = true; this.load(); }
    }
    attributeChangedCallback() { this.paint(); }
    get multi() { return this.hasAttribute('multi') && this.getAttribute('multi') !== 'false'; }
    get selSet() { return new Set((this.getAttribute('selected') || '').split(',').map(s => s.trim()).filter(Boolean)); }
    get mini() { return this.hasAttribute('mini') && this.getAttribute('mini') !== 'false'; }
    async load() {
      this.innerHTML = '<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9FB4C4;font:600 16px \'IBM Plex Sans\',sans-serif;">Carregando mapa…</div>';
      try { this.build(await getGeo()); } catch (e) { this.fallback(); }
    }
    build(g) {
      const feats = (g.features || []).filter(f => UF[codeOf(f)]);
      if (!feats.length) return this.fallback();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const shapes = feats.map(f => {
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        let d = '', best = null, bestA = 0;
        polys.forEach(poly => poly.forEach((ring, ri) => {
          const pts = ring.map(px);
          pts.forEach(([x, y]) => { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; });
          d += 'M' + pts.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join('L') + 'Z';
          if (ri === 0) { const a = Math.abs(ringArea(pts)); if (a > bestA) { bestA = a; best = pts; } }
        }));
        return { code: codeOf(f), d, c: ringCentroid(best) };
      });
      const pad = 0.6, w = maxX - minX + pad * 2, h = maxY - minY + pad * 2;
      const mini = this.mini;
      const labels = mini ? '' : shapes.map(s => `<text data-l="${s.code}" x="${s.c[0].toFixed(2)}" y="${(s.c[1] + 0.3).toFixed(2)}" text-anchor="middle" style="font:700 ${['DF','SE','AL','RN','PB','ES','RJ'].includes(UF[s.code][0]) ? 0.62 : 0.85}px 'IBM Plex Sans',sans-serif;pointer-events:none;fill:rgba(255,255,255,0.75);">${UF[s.code][0]}</text>`).join('');
      this.innerHTML = `<svg viewBox="${(minX - pad).toFixed(2)} ${(minY - pad).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;overflow:visible;touch-action:manipulation;-webkit-tap-highlight-color:transparent;user-select:none;">
        ${shapes.map(s => `<path data-uf="${s.code}" d="${s.d}" vector-effect="non-scaling-stroke" style="fill:#1B3C52;stroke:#0d2231;stroke-width:${mini ? 1 : 1.5};stroke-linejoin:round;cursor:${mini ? 'default' : 'pointer'};transition:fill .18s ease;"></path>`).join('')}
        ${labels}
      </svg>${mini ? '' : '<div data-tip style="position:absolute;left:0;bottom:0;font:700 22px \'IBM Plex Sans\',sans-serif;color:#ffffff;letter-spacing:-0.02em;pointer-events:none;"></div>'}`;
      this._paths = [...this.querySelectorAll('path')];
      this._tip = this.querySelector('[data-tip]');
      if (!mini) this._paths.forEach(p => {
        const code = p.getAttribute('data-uf');
        p.addEventListener('mouseenter', () => { this._hover = code; this.paint(); });
        p.addEventListener('mouseleave', () => { this._hover = null; this.paint(); });
        p.addEventListener('pointerup', e => { e.preventDefault(); this.select(code); });
        p.addEventListener('click', () => this.select(code));
      });
      this.paint();
    }
    fallback() {
      const list = Object.entries(UF).sort((a, b) => a[1][1].localeCompare(b[1][1]));
      this.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">${list.map(([c, [s, n]]) => `<button data-uf="${c}" style="min-height:56px;border-radius:14px;border:2px solid rgba(255,255,255,0.18);background:#1B3C52;color:#fff;font:600 16px 'IBM Plex Sans',sans-serif;cursor:pointer;text-align:left;padding:0 14px;"><b style="color:#8DC63F;margin-right:8px;">${s}</b>${n}</button>`).join('')}</div>`;
      this.querySelectorAll('button').forEach(b => b.addEventListener('click', () => this.select(b.getAttribute('data-uf'))));
      this._fallback = true; this.paint();
    }
    select(code) {
      const now = Date.now();
      if (this._lastSel === code && now - this._lastSelT < 400) return;
      this._lastSel = code; this._lastSelT = now;
      const [sigla, nome] = UF[code];
      const multi = this.multi;
      if (!multi) this.setAttribute('selected', sigla);
      const detail = { sigla, nome, code, multi };
      this.dispatchEvent(new CustomEvent('uf-select', { detail, bubbles: true, composed: true }));
      if (typeof window.__sicUfSelect === 'function') window.__sicUfSelect(detail);
    }
    paint() {
      const set = this.selSet;
      if (this._fallback) {
        this.querySelectorAll('button').forEach(b => { const on = set.has(UF[b.getAttribute('data-uf')][0]); b.style.background = on ? '#8DC63F' : '#1B3C52'; b.style.color = on ? '#0d2231' : '#fff'; });
        return;
      }
      if (!this._paths) return;
      this._paths.forEach(p => {
        const code = p.getAttribute('data-uf'), s = UF[code][0];
        p.style.fill = set.has(s) ? '#8DC63F' : code === this._hover ? '#1C7EB7' : (this.mini ? '#24485F' : '#1B3C52');
        if (set.has(s) && p.parentNode.lastElementChild !== p && !p.nextElementSibling?.matches?.('text')) p.parentNode.insertBefore(p, p.parentNode.querySelector('text'));
      });
      this.querySelectorAll('text').forEach(t => { t.style.fill = set.has(UF[t.getAttribute('data-l')][0]) ? '#0d2231' : 'rgba(255,255,255,0.75)'; });
      if (this._tip) {
        if (this.multi && !this._hover) {
          this._tip.textContent = set.size ? set.size + (set.size === 1 ? ' estado selecionado' : ' estados selecionados') : 'Toque nos estados';
          this._tip.style.color = set.size ? '#ffffff' : '#7F97A8';
        } else {
          const code = this._hover || Object.keys(UF).find(c => set.has(UF[c][0]));
          this._tip.textContent = code ? UF[code][1] : 'Toque no estado';
          this._tip.style.color = code ? '#ffffff' : '#7F97A8';
        }
      }
    }
  }
  customElements.define('br-map', BrMap);
})();
