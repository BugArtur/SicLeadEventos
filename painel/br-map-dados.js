/* Mapa do Brasil colorido por quantidade (coroplético) para o /painel.
   Usa a mesma malha do IBGE e o mesmo cache do mapa do totem (sic-br-uf-geo-v1), sem alterar aquele componente. */
(() => {
  const UF = {11:['RO','Rondônia'],12:['AC','Acre'],13:['AM','Amazonas'],14:['RR','Roraima'],15:['PA','Pará'],16:['AP','Amapá'],17:['TO','Tocantins'],21:['MA','Maranhão'],22:['PI','Piauí'],23:['CE','Ceará'],24:['RN','Rio Grande do Norte'],25:['PB','Paraíba'],26:['PE','Pernambuco'],27:['AL','Alagoas'],28:['SE','Sergipe'],29:['BA','Bahia'],31:['MG','Minas Gerais'],32:['ES','Espírito Santo'],33:['RJ','Rio de Janeiro'],35:['SP','São Paulo'],41:['PR','Paraná'],42:['SC','Santa Catarina'],43:['RS','Rio Grande do Sul'],50:['MS','Mato Grosso do Sul'],51:['MT','Mato Grosso'],52:['GO','Goiás'],53:['DF','Distrito Federal']};
  const SRC = 'https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF';
  const KEY = 'sic-br-uf-geo-v1';
  /* Escala sequencial de um só tom (azul SIC), do claro ao escuro; zero fica neutro. */
  const RAMP = ['#D6E8F4', '#A6CDE6', '#6FAED5', '#3D8FC4', '#1C6FA3', '#124E74'];
  const ZERO = '#E9EFF4';
  let geoP = null;
  const getGeo = () => geoP || (geoP = (async () => {
    try { const c = localStorage.getItem(KEY); if (c) return JSON.parse(c); } catch (e) {}
    const r = await fetch(SRC); if (!r.ok) throw new Error('geo ' + r.status);
    const j = await r.json(); try { localStorage.setItem(KEY, JSON.stringify(j)); } catch (e) {}
    return j;
  })().catch(e => { geoP = null; throw e; }));
  const K = Math.cos(15 * Math.PI / 180);
  const px = c => [c[0] * K, -c[1]];
  const codeOf = f => { const p = f.properties || {}; return String(p.codarea || p.CD_UF || p.cod || f.id || '').slice(0, 2); };
  const area = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]; return a / 2; };
  const centroid = r => { let x = 0, y = 0, a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; x += (r[j][0] + r[i][0]) * f; y += (r[j][1] + r[i][1]) * f; a += f; } a *= 3; return a ? [x / a, y / a] : r[0]; };

  let shapesCache = null;
  async function shapes() {
    if (shapesCache) return shapesCache;
    const g = await getGeo();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const list = (g.features || []).filter(f => UF[codeOf(f)]).map(f => {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      let d = '', best = null, bestA = 0;
      polys.forEach(poly => poly.forEach((ring, ri) => {
        const pts = ring.map(px);
        pts.forEach(([x, y]) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); });
        d += 'M' + pts.map(p => p[0].toFixed(3) + ',' + p[1].toFixed(3)).join('L') + 'Z';
        if (ri === 0) { const a = Math.abs(area(pts)); if (a > bestA) { bestA = a; best = pts; } }
      }));
      const code = codeOf(f);
      return { code, uf: UF[code][0], name: UF[code][1], d, c: centroid(best) };
    });
    shapesCache = { list, box: [minX - 0.6, minY - 0.6, maxX - minX + 1.2, maxY - minY + 1.2] };
    return shapesCache;
  }

  const colorFor = (v, max) => {
    if (!v) return ZERO;
    const i = Math.min(RAMP.length - 1, Math.floor((v / Math.max(1, max)) * RAMP.length - 1e-9));
    return RAMP[Math.max(0, i)];
  };

  /** Desenha o mapa em `el`. values: { 'SP': 12, ... }. unit: 'lead'/'leads'. */
  async function render(el, values, unit) {
    const max = Math.max(0, ...Object.values(values));
    let s;
    try { s = await shapes(); } catch (e) {
      el.innerHTML = '<div class="map-fallback">Mapa indisponível sem internet.</div>';
      return;
    }
    const small = ['DF', 'SE', 'AL', 'RN', 'PB', 'ES', 'RJ'];
    el.innerHTML = `<svg viewBox="${s.box.map(n => n.toFixed(2)).join(' ')}" role="img" aria-label="Mapa do Brasil por estado">
      ${s.list.map(x => `<path data-uf="${x.uf}" d="${x.d}" vector-effect="non-scaling-stroke" style="fill:${colorFor(values[x.uf] || 0, max)};stroke:#ffffff;stroke-width:1.2;stroke-linejoin:round;"></path>`).join('')}
      ${s.list.map(x => `<text x="${x.c[0].toFixed(2)}" y="${(x.c[1] + 0.3).toFixed(2)}" text-anchor="middle" style="font:600 ${small.includes(x.uf) ? 0.6 : 0.8}px 'IBM Plex Sans',sans-serif;fill:${(values[x.uf] || 0) / Math.max(1, max) > 0.5 ? '#ffffff' : '#3D5566'};pointer-events:none;">${x.uf}</text>`).join('')}
      <path data-hl d="" vector-effect="non-scaling-stroke" style="fill:none;stroke:#0d2231;stroke-width:2.2;stroke-linejoin:round;pointer-events:none;"></path>
    </svg><div class="map-tip" hidden></div>`;
    /* Destaque numa camada própria por cima de tudo: os estados nunca mudam de posição no SVG,
       então o navegador não perde o evento de saída do mouse. */
    const svg = el.querySelector('svg'), hl = el.querySelector('[data-hl]'), tip = el.querySelector('.map-tip');
    let cur = null;
    const clear = () => { cur = null; hl.setAttribute('d', ''); tip.hidden = true; };
    svg.addEventListener('pointermove', e => {
      const p = e.target.closest && e.target.closest('path[data-uf]');
      if (!p) return clear();
      const uf = p.dataset.uf;
      if (uf !== cur) {
        cur = uf;
        const info = s.list.find(x => x.uf === uf), v = values[uf] || 0;
        hl.setAttribute('d', info.d);
        tip.innerHTML = `<b>${info.name}</b><span>${v} ${v === 1 ? unit[0] : unit[1]}</span>`;
        tip.hidden = false;
      }
      const r = el.getBoundingClientRect();
      tip.style.left = (e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px';
    });
    svg.addEventListener('pointerleave', clear);
  }

  window.SICMapaDados = { render, RAMP, ZERO, UF };
})();
