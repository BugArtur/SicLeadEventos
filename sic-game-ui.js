/* Raspadinha SIC — componentes de interface: <sic-scratch> (camada raspável em canvas) e <sic-confetti>. */
(() => {
  if (!document.getElementById('sic-game-ui-style')) {
    const st = document.createElement('style');
    st.id = 'sic-game-ui-style';
    st.textContent = '@keyframes sicHand{0%,100%{transform:translate(-56px,8px) rotate(-14deg)}50%{transform:translate(56px,-8px) rotate(10deg)}}@keyframes sicShine{0%{transform:translateX(-120%) skewX(-18deg)}60%,100%{transform:translateX(220%) skewX(-18deg)}}';
    document.head.appendChild(st);
  }
  const HAND = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ffffff" stroke="#0d2231" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/></svg>');

  class SicScratch extends HTMLElement {
    static get observedAttributes() { return ['token', 'revealed']; }
    connectedCallback() {
      if (this._c) return;
      Object.assign(this.style, { display: 'block', position: 'absolute', inset: '0', touchAction: 'none', userSelect: 'none', webkitUserSelect: 'none', borderRadius: 'inherit', overflow: 'hidden' });
      this.innerHTML = '<canvas style="position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:grab;transition:opacity .7s ease, transform .7s ease;"></canvas>' +
        '<div data-hint style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;pointer-events:none;transition:opacity .3s ease;">' +
        '<img src="' + HAND + '" alt="" style="width:92px;height:92px;animation:sicHand 1.8s ease-in-out infinite;filter:drop-shadow(0 8px 14px rgba(13,34,49,.25));">' +
        '<span style="font:700 clamp(26px,3.4vw,38px) \'IBM Plex Sans\',sans-serif;letter-spacing:.16em;color:#0d2231;">RASPE AQUI</span>' +
        '<span style="font:600 16px \'IBM Plex Sans\',sans-serif;color:#3D5566;">Use o dedo para raspar o cartão</span></div>' +
        '<div data-shine style="position:absolute;top:0;bottom:0;left:0;width:30%;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:sicShine 3.2s ease-in-out infinite;"></div>';
      this._c = this.querySelector('canvas');
      this._hint = this.querySelector('[data-hint]');
      this._shine = this.querySelector('[data-shine]');
      this._ctx = this._c.getContext('2d', { willReadFrequently: true });
      this._ro = new ResizeObserver(() => { if (!this._touched && !this._done) this.paint(); });
      this._ro.observe(this);
      const pos = e => { const r = this._c.getBoundingClientRect(); return [(e.clientX - r.left) * this._dpr, (e.clientY - r.top) * this._dpr]; };
      this._c.addEventListener('pointerdown', e => {
        if (this._done) return;
        e.preventDefault();
        try { this._c.setPointerCapture(e.pointerId); } catch (x) {}
        this._down = true; this._last = pos(e); this._touched = true;
        this._hint.style.opacity = '0'; this._shine.style.opacity = '0';
        this.stroke(this._last, this._last);
      });
      this._c.addEventListener('pointermove', e => {
        if (!this._down || this._done) return;
        e.preventDefault();
        const p = pos(e); this.stroke(this._last, p); this._last = p;
        if (++this._moves % 8 === 0) this.check();
      });
      const up = () => { if (!this._down) return; this._down = false; this.check(); };
      this._c.addEventListener('pointerup', up);
      this._c.addEventListener('pointercancel', up);
      this._c.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
      this._moves = 0;
      if (this.getAttribute('revealed') === 'true') this.finish(true);
    }
    disconnectedCallback() { if (this._ro) this._ro.disconnect(); }
    attributeChangedCallback(n, o, v) {
      if (!this._c) return;
      if (n === 'token' && o !== v) this.resetLayer();
      if (n === 'revealed' && v === 'true') this.finish(true);
    }
    resetLayer() {
      this._done = false; this._touched = false; this._moves = 0;
      this._c.style.opacity = '1'; this._c.style.transform = 'none'; this._c.style.pointerEvents = 'auto';
      this._hint.style.opacity = '1'; this._shine.style.opacity = '1';
      this.paint();
    }
    paint() {
      const r = this.getBoundingClientRect(); if (!r.width) return;
      const dpr = this._dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this._c.width = Math.round(r.width * dpr), h = this._c.height = Math.round(r.height * dpr);
      const x = this._ctx;
      x.globalCompositeOperation = 'source-over';
      const g = x.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#B9C3CC'); g.addColorStop(0.3, '#EEF2F5'); g.addColorStop(0.55, '#AEB9C3'); g.addColorStop(0.8, '#E3E8EC'); g.addColorStop(1, '#A7B2BC');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      for (let i = 0; i < (w * h) / 900; i++) { x.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.35) + ')'; x.fillRect(Math.random() * w, Math.random() * h, dpr, dpr); }
      x.save(); x.globalAlpha = 0.09; x.fillStyle = '#0d2231'; x.font = '700 ' + (22 * dpr) + 'px IBM Plex Sans, sans-serif';
      x.translate(w / 2, h / 2); x.rotate(-0.35);
      for (let yy = -h; yy < h; yy += 64 * dpr) for (let xx = -w; xx < w; xx += 110 * dpr) x.fillText('SIC', xx + ((yy / (64 * dpr)) % 2 ? 55 * dpr : 0), yy);
      x.restore();
    }
    stroke(a, b) {
      const x = this._ctx;
      x.globalCompositeOperation = 'destination-out';
      x.lineCap = 'round'; x.lineJoin = 'round';
      x.lineWidth = Math.max(56, Math.min(this._c.width, this._c.height) * 0.11);
      x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0] + 0.01, b[1]); x.stroke();
    }
    check() {
      if (this._done) return;
      const { width: w, height: h } = this._c; if (!w || !h) return;
      const data = this._ctx.getImageData(0, 0, w, h).data;
      let clear = 0, tot = 0;
      for (let i = 3; i < data.length; i += 4 * 24) { tot++; if (data[i] < 40) clear++; }
      const pct = clear / tot;
      this.dispatchEvent(new CustomEvent('scratch-progress', { detail: pct, bubbles: true }));
      if (pct >= Number(this.getAttribute('threshold') || 0.6)) this.finish(false);
    }
    finish(silent) {
      if (this._done) return;
      this._done = true;
      this._c.style.opacity = '0'; this._c.style.transform = 'scale(1.04)'; this._c.style.pointerEvents = 'none';
      this._hint.style.opacity = '0'; this._shine.style.opacity = '0';
      if (!silent || this.getAttribute('revealed') !== 'true') {
        const detail = { token: this.getAttribute('token') };
        this.dispatchEvent(new CustomEvent('scratch-done', { detail, bubbles: true, composed: true }));
        if (typeof window.__sicScratchDone === 'function') window.__sicScratchDone(detail);
      }
    }
  }
  if (!customElements.get('sic-scratch')) customElements.define('sic-scratch', SicScratch);

  class SicConfetti extends HTMLElement {
    static get observedAttributes() { return ['fire']; }
    connectedCallback() {
      if (this._c) return;
      Object.assign(this.style, { display: 'block', position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '20' });
      if (this.parentElement && this.parentElement.style) this.parentElement.style.pointerEvents = 'none';
      this._c = document.createElement('canvas');
      Object.assign(this._c.style, { width: '100%', height: '100%', display: 'block' });
      this.appendChild(this._c);
      if (this.getAttribute('fire')) this.burst();
    }
    attributeChangedCallback(n, o, v) { if (this._c && v && v !== o) this.burst(); }
    burst() {
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const r = this.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      const c = this._c; c.width = r.width * dpr; c.height = r.height * dpr;
      const x = c.getContext('2d');
      const cols = ['#8DC63F', '#1C7EB7', '#ffffff', '#F5C518', '#9BD24D', '#5BB0E0'];
      const ps = Array.from({ length: 200 }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        return { x: (side > 0 ? 0.05 : 0.95) * c.width, y: c.height * 0.75, vx: -side * (4 + Math.random() * 10) * dpr, vy: -(10 + Math.random() * 14) * dpr, s: (6 + Math.random() * 8) * dpr, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, col: cols[i % cols.length], sh: Math.random() < 0.3 };
      });
      const t0 = performance.now();
      cancelAnimationFrame(this._raf);
      const tick = t => {
        const el = t - t0;
        x.clearRect(0, 0, c.width, c.height);
        ps.forEach(p => {
          p.vy += 0.35 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
          x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.max(0, 1 - el / 3800); x.fillStyle = p.col;
          if (p.sh) { x.beginPath(); x.arc(0, 0, p.s / 2, 0, 6.3); x.fill(); } else x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
          x.restore();
        });
        if (el < 3800) this._raf = requestAnimationFrame(tick); else x.clearRect(0, 0, c.width, c.height);
      };
      this._raf = requestAnimationFrame(tick);
    }
  }
  if (!customElements.get('sic-confetti')) customElements.define('sic-confetti', SicConfetti);
})();
