// film.js — builds a film from a spec: one continuous handscroll over the chosen prints.
// Every frame is a pure function of t, so preview, scrubbing and export always agree.
(function () {
  const { W, H, hash, canvas, T, revealMask } = UK;
  const FPS = 24, STEP = 2220, PRE = 2.3, SLIDE = 2.2, BLOCK = 0.34, WASH = 1.4, ENDLEN = 4.6;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const sm = (u) => { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };
  const EASE = {
    sine: (u) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(u, 0, 1)),
    cubic: (u) => { u = clamp(u, 0, 1); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; },
    out: (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3),
  };
  const step = (t, fps) => Math.floor(t * fps + 1e-6) / fps;
  const sheetLeft = (i) => -i * STEP;
  const SUMI = "#231f1c";
  const REG = { g0: [0, 0], g1: [2.2, -1.3], g2: [-1.8, 1.9], g3: [1.5, 2.2] };
  const SLIDE_IN = { g0: [-6, 0], g1: [5, -3], g2: [-4, 5], g3: [4, 4] };

  // what each print offers: variants, where its ground is, where the cartouche sits, how the traveller crosses it
  const META = {
    bay: { name: "Залив", variants: { dawn: "Рассвет", day: "День", night: "Ночь" }, ground: 872, cart: [1716, 66], walk: [1480, 1150], stop: "idle", face: -1 },
    sakura: { name: "Сакура у реки", variants: { day: "День", night: "Ночь" }, ground: 872, cart: [92, 66], walk: [1500, 1000], stop: "look", face: -1 },
    rain: { name: "Ливень на перекрёстке", variants: { day: "День", night: "Ночь" }, ground: 884, cart: [1716, 60], walk: [1450, 900], stop: "idle", face: -1, umbrella: true },
    asakusa: { name: "Фонарь Асакусы", variants: { day: "День", night: "Ночь" }, ground: 884, cart: [590, 66], walk: [1460, 1130], stop: "look", face: 1 },
  };

  let texturesReady = false;
  const cache = new Map();
  function sheetFor(view, variant) {
    const key = view + ":" + variant;
    if (!cache.has(key)) {
      const b = VIEWS[view](variant);
      b.comp = compose(b);
      cache.set(key, b);
    }
    return cache.get(key);
  }
  function border(g) {
    g.strokeStyle = SUMI;
    g.lineWidth = 3.4; g.strokeRect(VIEWS.X0, VIEWS.Y0, VIEWS.X1 - VIEWS.X0, VIEWS.Y1 - VIEWS.Y0);
    g.lineWidth = 1.2; g.strokeRect(VIEWS.X0 - 9, VIEWS.Y0 - 9, VIEWS.X1 - VIEWS.X0 + 18, VIEWS.Y1 - VIEWS.Y0 + 18);
  }
  function compose(b) {
    const c = canvas(), g = c.getContext("2d");
    g.drawImage(T.paper, 0, 0);
    for (const k of ["g1", "g2", "g3", "g0"]) g.drawImage(b[k], REG[k][0], REG[k][1]);
    g.globalAlpha = 0.35; g.drawImage(T.fibres, 0, 0); g.globalAlpha = 1;
    border(g);
    return c;
  }
  let shared = null;
  function sharedAssets() {
    if (shared) return shared;
    const bare = canvas(), bg = bare.getContext("2d");
    bg.drawImage(T.paper, 0, 0); bg.globalAlpha = 0.35; bg.drawImage(T.fibres, 0, 0); bg.globalAlpha = 1; border(bg);
    const mount = canvas(), mg = mount.getContext("2d");
    mg.fillStyle = "#c2ad86"; mg.fillRect(0, 0, W, H);
    mg.globalAlpha = 0.1; mg.drawImage(T.wood, 0, 0, W, H);
    mg.globalAlpha = 0.6; mg.drawImage(T.fibres, 0, 0); mg.globalAlpha = 1;
    shared = { bare, mount, tmp: canvas(), scratch: canvas(), accum: canvas(), sprite: canvas(360, 320) };
    return shared;
  }

  // ---------------- the plan: every time in the film, derived from the spec ----------------
  function plan(spec) {
    const sc = spec.scenes.filter((s) => META[s.view]);
    const holds = [];
    let t = 0;
    sc.forEach((s, i) => {
      const dur = clamp(+s.duration || 6, 3, 30);
      const prev = sc[i - 1];
      const reprint = !!prev && prev.view === s.view && prev.variant !== s.variant;
      const start = i === 0 ? 0 : t + SLIDE;
      const intro = i === 0 ? PRE + 1.6 : reprint ? 1.3 : 0;
      const end = start + intro + dur;
      const cart = i === 0 ? PRE + 1.9 : start + (reprint ? 1.4 : 0.5);
      const prints = i === 0 ? ["g0", "g1", "g2", "g3"].map((k, j) => [k, PRE + j * 0.4])
        : reprint ? ["g1", "g2", "g3"].map((k, j) => [k, start + 0.15 + j * 0.35]) : null;
      holds.push({ i, scene: s, meta: META[s.view], start, end, cart, prints, reprint, live: i === 0 ? PRE + 1.6 : start + intro });
      t = end;
    });
    const total = holds.length ? t + ENDLEN : 1;
    const subs = holds.filter((h) => (h.scene.subtitle || "").trim()).map((h) => [h.cart + 0.6, h.end - 0.3, h.scene.subtitle.trim()]).filter((s) => s[1] - s[0] > 1.0);
    return { holds, total, subs, washAt: t, endAt: t + 1.3 };
  }

  function create(spec) {
    if (!texturesReady) { UK.init(); texturesReady = true; }
    const S = sharedAssets();
    const P = plan(spec);
    const holds = P.holds;
    const sheets = holds.map((h) => sheetFor(h.scene.view, h.scene.variant || Object.keys(h.meta.variants)[0]));
    const seriesSeal = [...(spec.series || "東京")].slice(0, 2).join("");
    const carts = holds.map((h) => VIEWS.cartouche(spec.series || "", h.scene.title || ""));
    const seals = holds.map((h, i) => VIEWS.sealCanvas(seriesSeal, 46, 30 + i));
    const subSeal = VIEWS.sealCanvas([...(spec.series || "景")].slice(-1).join(""), 30, 77);
    const endSlip = VIEWS.cartouche(spec.series || "", spec.endTitle || "");
    const endSeal = VIEWS.sealCanvas(seriesSeal, 96, 88);
    const last = holds.length - 1;

    // ---- camera ----
    function camHold(i, t) {
      let cx = sheetLeft(i) + 960, cy = 540, z = 1;
      const h = holds[i];
      if (i === 0) z = lerp(0.88, 1, EASE.sine(t / 2.4));
      if (h.scene.view === "asakusa") { const u = EASE.sine((t - h.live) / Math.max(1, h.end - h.live)); z = 1 + 0.05 * u; cx += 40 * u; cy -= 22 * u; }
      if (i === last) { const u = EASE.sine((t - P.washAt - 0.6) / (ENDLEN - 0.6)); z *= 1 - 0.06 * u; }
      return { cx, cy, z };
    }
    function camera(t) {
      for (let i = 0; i < holds.length; i++) {
        const h = holds[i];
        if (t < h.start) {
          const a = holds[i - 1], u = (t - a.end) / SLIDE;
          const urgent = h.scene.view === "rain";
          const e = EASE[urgent ? "cubic" : "sine"](u), A = camHold(i - 1, a.end), B = camHold(i, h.start);
          return { cx: lerp(A.cx, B.cx, e), cy: lerp(A.cy, B.cy, e), z: lerp(A.z, B.z, e) * (1 - (urgent ? 0.1 : 0.15) * Math.sin(Math.PI * u)) };
        }
        if (t <= h.end || i === last) return camHold(i, t);
      }
      return { cx: 960, cy: 540, z: 1 };
    }

    // ---- the traveller ----
    function traveler(t) {
      if (!spec.traveler || !holds.length) return null;
      for (let i = 0; i < holds.length; i++) {
        const h = holds[i], m = h.meta, L = sheetLeft(i);
        if (t < h.start) { // running across the gap from the previous print
          const a = holds[i - 1], u = (t - a.end) / SLIDE, e = EASE[h.scene.view === "rain" ? "cubic" : "sine"](u);
          return { wx: lerp(sheetLeft(i - 1) + a.meta.walk[1], L + m.walk[0], e), fy: lerp(a.meta.ground, m.ground, e), mode: "run", face: -1, umbrella: false };
        }
        if (t <= h.end || i === last) {
          let x0 = m.walk[0], t0 = h.start;
          if (i === 0) { if (t < h.cart - 0.2) return null; x0 = 1990; t0 = h.cart - 0.2; }
          const wl = Math.min(4.5, Math.max(1.5, (h.end - t0) * 0.7));
          const u = (t - t0) / wl;
          const umbrella = !!m.umbrella;
          if (u < 1) return { wx: L + lerp(x0, m.walk[1], u), fy: m.ground, mode: "walk", face: -1, umbrella };
          if (i === last && t > P.washAt) { // step aside so the end card has the middle of the sheet
            const v = (t - P.washAt) / 1.2, x = L + lerp(m.walk[1], 1420, clamp(v, 0, 1));
            if (v < 1) return { wx: x, fy: m.ground, mode: "walk", face: 1, umbrella: false };
            if (t > P.endAt + 0.5) return { wx: x, fy: m.ground, mode: "bow", face: -1, umbrella: false, t0: P.endAt + 0.5 };
            return { wx: x, fy: m.ground, mode: "idle", face: -1, umbrella: false };
          }
          return { wx: L + m.walk[1], fy: m.ground, mode: m.stop, face: m.stop === "look" ? m.face : -1, umbrella };
        }
      }
      return null;
    }
    function drawTraveler(g, st, t) {
      const sp = S.sprite, sg = sp.getContext("2d");
      sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, sp.width, sp.height);
      const ox = 180, oy = 300;
      sg.translate(ox, oy); sg.scale(st.face, 1);
      const fps = st.mode === "run" ? 12 : 8;
      const tilt = st.mode === "bow" ? 0.4 * Math.sin(Math.PI * clamp((t - st.t0) / 1.4, 0, 1)) : 0;
      TRAVELER.draw(sg, { mode: st.mode, phase: Math.floor(t * fps + 1e-6) % 2, umbrella: st.umbrella, tilt });
      sg.setTransform(1, 0, 0, 1, 0, 0);
      sg.globalCompositeOperation = "destination-out"; sg.globalAlpha = 0.22;
      sg.drawImage(T.specks, -((st.wx | 0) % 400 + 400) % 400, 0);
      sg.globalCompositeOperation = "source-over"; sg.globalAlpha = 1;
      g.drawImage(sp, st.wx - ox, st.fy - oy);
    }

    // ---- living layers, in sheet coordinates (lt = seconds since the print came alive) ----
    function bird(g, x, y, s, ph) {
      const a = ph ? 12 : -6;
      g.strokeStyle = SUMI; g.lineWidth = 2.4; g.lineCap = "round";
      g.beginPath(); g.moveTo(x - 16 * s, y + a * s * 0.6); g.quadraticCurveTo(x - 7 * s, y - a * 0.4 * s, x, y);
      g.quadraticCurveTo(x + 7 * s, y - a * 0.4 * s, x + 16 * s, y + a * s * 0.6); g.stroke();
    }
    function dynBay(g, t, lt, variant) {
      if (variant !== "night") {
        const tq = step(lt, 8);
        for (let k = 0; k < 3; k++) {
          const x = 1700 - tq * 120 + k * 80, y = 220 + k * 28 + Math.sin(tq * 2 + k) * 8;
          if (x > 40 && x < 1880) bird(g, x, y, 0.9 - k * 0.12, (Math.floor(tq * 8) + k) % 2);
        }
        return;
      }
      const f = Math.floor(t * 8 + 1e-6);
      g.fillStyle = "#cf9f4a";
      for (let i = 0; i < 22; i++) { g.globalAlpha = 0.85 - i * 0.03; g.fillRect(1480 - (26 - i * 0.7) / 2 + (hash(f, i, 3) - 0.5) * 18, 616 + i * 10, 26 - i * 0.7, 3); }
      g.fillStyle = "#b8412f";
      for (let i = 0; i < 10; i++) { g.globalAlpha = 0.7 - i * 0.06; g.fillRect(1470 + (hash(f, i, 5) - 0.5) * 16, 620 + i * 14, 14, 3); }
      for (let k = 0; k < 18; k++) {
        const x = 100 + hash(k, 1, 9) * 1700;
        if (Math.abs(x - 1480) < 60) continue;
        for (let i = 0; i < 4; i++) { g.globalAlpha = 0.55 - i * 0.12; g.fillStyle = "#cf9f4a"; g.fillRect(x + (hash(f, k * 7 + i, 4) - 0.5) * 8, 612 + i * 9, 10 - i * 2, 2.5); }
      }
      g.globalAlpha = 1;
      for (const [t0, x, y, R, colA, colB] of [[2.2, 760, 250, 200, "#cf9f4a", "#b8412f"], [3.7, 1040, 320, 130, "#e3a08a", "#cf9f4a"]]) {
        const u = step(lt, 12) - t0;
        if (u < 0 || u > 2.6) continue;
        const grow = EASE.out(u / 0.8), fade = u < 1.0 ? 1 : clamp(1 - (u - 1.0) / 1.6, 0, 1), drop = Math.max(0, u - 0.8) * 26;
        g.globalAlpha = fade;
        for (let k = 0; k < 30; k++) {
          const a = (k / 30) * Math.PI * 2, r1 = R * grow, r0 = r1 * (u < 1.0 ? 0.35 : 0.35 + (u - 1.0) * 0.4);
          g.strokeStyle = k % 2 ? colA : colB; g.lineWidth = 3;
          g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0 + drop * 0.5); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1 + drop); g.stroke();
          g.fillStyle = k % 2 ? colB : colA;
          g.beginPath(); g.arc(x + Math.cos(a) * (r1 + 10), y + Math.sin(a) * (r1 + 10) + drop * 1.2, 3, 0, Math.PI * 2); g.fill();
        }
        g.globalAlpha = fade * 0.5; g.fillStyle = colA;
        for (let i = 0; i < 8; i++) g.fillRect(x - 30 + (hash(Math.floor(t * 12), i, 2) - 0.5) * 40, 640 + i * 18, 60 - i * 5, 3);
        g.globalAlpha = 1;
      }
    }
    function dynSakura(g, t, lt, variant) {
      const tq = step(t, 8), col = variant === "night" ? "#e7b9b3" : "#f0c9bf";
      for (let i = 0; i < 26; i++) {
        const sp = 38 + hash(i, 2, 1) * 40, per = 760 / sp;
        const ph = (tq / per + hash(i, 3, 1)) % 1;
        const x = 1000 + hash(i, 4, 1) * 860 - ph * 420 + Math.sin(tq * 1.6 + i) * 22, y = 140 + ph * 760;
        if (y > 838 && y < 882) continue;
        g.save(); g.translate(x, y); g.rotate(tq * 2 + i);
        g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(35,31,28,0.6)"; g.lineWidth = 1; g.stroke();
        g.restore();
      }
      for (let i = 0; i < 16; i++) {
        const x = ((hash(i, 6, 1) * 1900 - tq * (14 + hash(i, 7, 1) * 10)) % 1900 + 1900) % 1900, y = 650 + hash(i, 8, 1) * 160;
        g.fillStyle = col; g.beginPath(); g.ellipse(x, y, 6, 2.5, 0, 0, Math.PI * 2); g.fill();
      }
    }
    function dynRain(g, t) {
      const tq = step(t, 8), cols = ["#2c4a70", "#c9a45c", "#6e6c62", "#4d6f98"];
      for (let i = 0; i < 7; i++) {
        const dir = i % 2 ? 1 : -1, sp = 34 + hash(i, 1, 4) * 20, s = 0.7 + hash(i, 2, 4) * 0.3;
        const x = ((hash(i, 3, 4) * 2000 + dir * tq * sp) % 2000 + 2000) % 2000 - 40, y = 700 + hash(i, 4, 4) * 160;
        const ph = Math.floor(tq * 8) % 2;
        g.strokeStyle = SUMI; g.lineWidth = 2 * s; g.lineCap = "round";
        g.beginPath(); g.moveTo(x - 3 * s, y - 10 * s); g.lineTo(x - 3 * s + (ph ? 4 : -2) * s, y); g.moveTo(x + 3 * s, y - 10 * s); g.lineTo(x + 3 * s + (ph ? -2 : 4) * s, y); g.stroke();
        g.fillStyle = "#3a3632"; g.fillRect(x - 7 * s, y - 34 * s, 14 * s, 24 * s);
        g.fillStyle = cols[i % 4]; g.beginPath(); g.ellipse(x, y - 40 * s, 24 * s, 12 * s, 0, Math.PI, 0); g.closePath(); g.fill();
        g.lineWidth = 1.5; g.stroke();
      }
      const tr = step(t, 12);
      g.lineCap = "butt";
      for (const [n, ang, len, sp, alpha, seed, w] of [[300, 0.2, 60, 1100, 0.42, 1, 1.3], [180, 0.29, 40, 800, 0.28, 2, 1]]) {
        g.strokeStyle = `rgba(48,52,60,${alpha})`; g.lineWidth = w;
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const l = len * (0.7 + hash(i, seed, 9) * 0.6), y = ((hash(i, seed, 7) * 1200 + tr * sp) % 1200) - 80, x = hash(i, seed, 8) * 2100 - y * Math.tan(ang);
          g.moveTo(x, y); g.lineTo(x - Math.sin(ang) * l, y + Math.cos(ang) * l);
        }
        g.stroke();
      }
      const f = Math.floor(t * 12 + 1e-6);
      g.strokeStyle = "rgba(35,31,28,0.45)"; g.lineWidth = 1.2;
      for (let i = 0; i < 26; i++) { g.beginPath(); g.ellipse(hash(f, i, 11) * 1880, 650 + hash(f, i, 12) * 380, 7, 2, 0, Math.PI, 0); g.stroke(); }
    }
    function dynAsakusa(g, t, lt, variant) {
      const tq = step(t, 8);
      g.lineCap = "round";
      for (let k = 0; k < 3; k++) {
        g.strokeStyle = variant === "night" ? `rgba(190,180,160,${0.45 - k * 0.1})` : `rgba(109,106,100,${0.55 - k * 0.12})`; g.lineWidth = 3.2 - k * 0.6;
        g.beginPath();
        for (let i = 0; i <= 30; i++) {
          const y = 646 - i * 10, rise = (646 - y) / 300, x = 820 + (k - 1) * 14 + Math.sin(y * 0.022 - tq * 1.7 + k * 2) * 26 * rise;
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      if (variant === "night") return;
      const lq = step(lt, 8);
      for (let k = 0; k < 2; k++) {
        const x = 200 + lq * (90 + k * 30) + k * 60, y = 200 + k * 40 + Math.sin(lq * 3 + k) * 6;
        if (x > 40 && x < 1150) bird(g, x, y, 0.8, (Math.floor(lq * 8) + k) % 2);
      }
    }
    const DYN = { bay: dynBay, sakura: dynSakura, rain: dynRain, asakusa: dynAsakusa };

    // ---- one sheet ----
    function drawBlock(g, block, key, p) {
      const m = revealMask(p), tg = S.tmp.getContext("2d");
      tg.globalCompositeOperation = "copy"; tg.drawImage(block, 0, 0);
      tg.globalCompositeOperation = "destination-in"; tg.drawImage(m, 0, 0, W, H);
      tg.globalCompositeOperation = "source-over";
      const k = 1 - sm(p), [sx, sy] = SLIDE_IN[key], [rx, ry] = REG[key];
      g.drawImage(S.tmp, rx + sx * k, ry + sy * k);
    }
    function drawSheet(g, i, t) {
      const h = holds[i], b = sheets[i], pr = h.prints;
      if (i === 0 && t < PRE) { g.drawImage(S.bare, 0, 0); return; }
      if (pr && t < pr[pr.length - 1][1] + BLOCK) {
        g.drawImage(T.paper, 0, 0);
        for (const k of ["g1", "g2", "g3", "g0"]) {
          const e = pr.find((q) => q[0] === k);
          if (!e) { g.drawImage(b[k], REG[k][0], REG[k][1]); continue; }
          const p = (t - e[1]) / BLOCK;
          if (p <= 0) continue;
          if (p >= 1) g.drawImage(b[k], REG[k][0], REG[k][1]); else drawBlock(g, b[k], k, p);
        }
        g.globalAlpha = 0.35; g.drawImage(T.fibres, 0, 0); g.globalAlpha = 1;
        border(g);
      } else g.drawImage(b.comp, 0, 0);
      g.save(); g.beginPath(); g.rect(VIEWS.X0 + 2, VIEWS.Y0 + 2, VIEWS.X1 - VIEWS.X0 - 4, VIEWS.Y1 - VIEWS.Y0 - 4); g.clip();
      if (!pr || t > pr[pr.length - 1][1] + BLOCK * 0.5) DYN[h.scene.view](g, t, t - h.live, h.scene.variant);
      if (t >= h.cart) {
        const [cx0, cy0] = h.meta.cart, c = carts[i];
        const x = h.meta.cart[0] > 960 ? cx0 - (c.width - 108) : cx0;
        const u = clamp((t - h.cart) / 0.35, 0, 1);
        g.globalAlpha = sm(u); g.drawImage(c, x - 6, cy0 - 6 - (1 - sm(u)) * 16); g.globalAlpha = 1;
        const su = (t - h.cart - 0.35) / 0.2;
        if (su > 0) {
          const sc = lerp(1.35, 1, sm(su)), s0 = seals[i], sx = x - 34, sy = cy0 + c.height - 60;
          g.save(); g.globalAlpha = clamp(su * 3, 0, 1); g.translate(sx, sy); g.scale(sc, sc); g.drawImage(s0, -s0.width / 2, -s0.height / 2); g.restore();
        }
      }
      g.restore();
      if (i === last && t > P.washAt) {
        const p = clamp((t - P.washAt) / WASH, 0, 1), tg = S.tmp.getContext("2d");
        tg.globalCompositeOperation = "copy"; tg.drawImage(S.bare, 0, 0);
        if (p < 1) { tg.globalCompositeOperation = "destination-in"; tg.drawImage(revealMask(p, 0.08), 0, 0, W, H); }
        tg.globalCompositeOperation = "source-over";
        g.drawImage(S.tmp, 0, 0);
      }
    }

    // ---- type on screen ----
    function subtitle(g, t) {
      const s = P.subs.find((q) => t >= q[0] - 0.01 && t < q[1]);
      if (!s) return;
      const a = Math.min(sm((t - s[0]) / 0.35), sm((s[1] - t) / 0.45));
      g.save();
      g.font = '34px "PT Serif", "Shippori Mincho"';
      let text = s[2];
      while (g.measureText(text).width > 1500 && text.length > 4) text = text.slice(0, -2) + "…";
      const tw = g.measureText(text).width, w = tw + 150, h = 76, x = 960 - w / 2, y = H - 128 + (1 - a) * 10;
      g.globalAlpha = a;
      g.fillStyle = "#f3e7c6"; g.fillRect(x, y, w, h);
      g.strokeStyle = SUMI; g.lineWidth = 3; g.strokeRect(x, y, w, h);
      g.lineWidth = 1.1; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      g.drawImage(subSeal, x + 18, y + (h - subSeal.height) / 2);
      g.fillStyle = SUMI; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(text, x + 78, y + h / 2 + 1);
      g.restore();
    }
    function endCard(g, t) {
      if (t < P.endAt) return;
      const u = sm((t - P.endAt) / 0.5), sc = 1.8;
      const w = endSlip.width * sc, h = endSlip.height * sc, x = 960 - w / 2, y = Math.max(60, 250 - Math.max(0, h - 470) / 2) - (1 - u) * 24;
      g.save(); g.globalAlpha = u; g.drawImage(endSlip, x, y, w, h); g.restore();
      const su = (t - P.endAt - 0.6) / 0.22;
      if (su > 0) {
        const k = lerp(1.4, 1, sm(su));
        g.save(); g.globalAlpha = clamp(su * 3, 0, 1); g.translate(x - 80, y + h - 70); g.scale(k, k);
        g.drawImage(endSeal, -endSeal.width / 2, -endSeal.height / 2); g.restore();
      }
      const tu = sm((t - P.endAt - 1.0) / 0.6);
      if (tu > 0 && (spec.endLine || "").trim()) {
        g.save(); g.globalAlpha = tu; g.fillStyle = SUMI; g.textAlign = "center"; g.textBaseline = "middle";
        g.font = 'italic 44px "PT Serif", "Shippori Mincho"'; g.fillText(spec.endLine.trim(), 960, Math.min(y + h + 50, 790));
        g.restore();
      }
    }

    // ---- the frame ----
    function scene(g, t) {
      const cam = camera(t);
      const ox = 960 - cam.cx * cam.z, oy = 540 - cam.cy * cam.z;
      g.setTransform(1, 0, 0, 1, 0, 0);
      const tw = W * cam.z, th = H * cam.z;
      const sx = ((ox % tw) + tw) % tw - tw, sy = ((oy % th) + th) % th - th;
      for (let yy = sy; yy < H; yy += th) for (let xx = sx; xx < W; xx += tw) g.drawImage(S.mount, xx, yy, tw + 1, th + 1);
      g.setTransform(cam.z, 0, 0, cam.z, ox, oy);
      for (let i = 0; i < holds.length; i++) {
        const L = sheetLeft(i), left = (L - cam.cx) * cam.z + 960, right = left + W * cam.z;
        if (right < -20 || left > W + 20) continue;
        g.fillStyle = "rgba(70,48,24,0.25)"; g.fillRect(L + 7, 9, W, H);
        g.save(); g.translate(L, 0); drawSheet(g, i, t); g.restore();
      }
      const st = traveler(t);
      if (st) drawTraveler(g, st, t);
      if (t >= P.endAt && holds.length) { g.save(); g.translate(sheetLeft(last), 0); endCard(g, t); g.restore(); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      subtitle(g, t);
    }
    function draw(t, out, opts) {
      const g = out.getContext("2d");
      if (!holds.length) { g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(S.mount, 0, 0, out.width, out.height); return; }
      const scaleOut = out.width !== W;
      const target = scaleOut ? S.scratch.getContext("2d") : g;
      const dt = 1 / FPS, a = camera(t), b = camera(Math.min(P.total, t + dt));
      const speed = Math.abs(b.cx - a.cx) * a.z;
      if (!(opts && opts.blur) || speed < 36) scene(scaleOut ? target : g, t);
      else {
        const n = speed > 70 ? 6 : 4, ag = S.accum.getContext("2d"), sg = S.scratch.getContext("2d");
        for (let k = 0; k < n; k++) {
          scene(sg, t + (k / (n - 1) - 0.5) * 0.5 * dt);
          ag.globalAlpha = 1 / (k + 1); ag.drawImage(S.scratch, 0, 0);
        }
        ag.globalAlpha = 1;
        target === g ? (g.setTransform(1, 0, 0, 1, 0, 0), g.drawImage(S.accum, 0, 0)) : S.scratch.getContext("2d").drawImage(S.accum, 0, 0);
      }
      if (scaleOut) { g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingQuality = "high"; g.drawImage(S.scratch, 0, 0, out.width, out.height); }
    }

    return { draw, duration: P.total, plan: P, FPS };
  }

  window.FILM = { create, META, FPS, PRE, SLIDE, WASH, ENDLEN };
})();
