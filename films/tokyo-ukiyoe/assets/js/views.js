// views.js — five views of Tokyo, each built as cached woodblocks:
// g0 key (sumi line), g1 blues, g2 greens / secondary, g3 reds / figures.
(function () {
  const { W, H, rng, fbm, n1, canvas, texture, bokashi, poly, line, carve, sample, mist } = UK;
  const P = {
    blue: "#1d3a66", blueD: "#13284a", blueL: "#4d6f98", trough: "#0f2344", pale: "#8db0c6", pale2: "#bcd0d6",
    sumi: "#231f1c", beni: "#b8412f", beniP: "#e3a08a", peach: "#efc4a8", ochre: "#cf9f4a", straw: "#c9a45c",
    green: "#8aa152", greenD: "#50703c", pine: "#3e5a3a", indigo: "#2c4a70", stone: "#b7aa8a", slate: "#4a5450",
    sakura: "#f0c9bf", bark: "#5a4434", greyB: "#a9b4bc", greyG: "#7d8a78", cream: "#f3e7c6"
  };
  const X0 = 44, X1 = 1876, Y0 = 38, Y1 = 1042;

  function blocks() {
    return { g0: canvas(), g1: canvas(), g2: canvas(), g3: canvas() };
  }
  const ctx = (c) => c.getContext("2d");
  function clipInner(g) { g.beginPath(); g.rect(X0, Y0, X1 - X0, Y1 - Y0); g.clip(); }

  // ---------- shared props ----------
  function tower(gc, gk, x, by, h, o) {
    o = o || {};
    const hw = (f) => h * 0.2 * Math.pow(1 - f, 1.7) + h * 0.011;
    const sideL = sample((f) => [x - hw(f * 0.93), by - h * f * 0.93], 24);
    const sideR = sample((f) => [x + hw(f * 0.93), by - h * f * 0.93], 24);
    // the tower is cut on its own small block so its paper bands never touch the sky
    const tc = canvas(), tg = ctx(tc);
    poly(tg, sideL.concat(sideR.slice().reverse()), o.col || P.beni);
    const deck = (f, wpad, hh) => { const y = by - h * f; tg.fillStyle = o.col || P.beni; tg.fillRect(x - hw(f) - wpad, y - hh, (hw(f) + wpad) * 2, hh); };
    deck(0.36, h * 0.03, h * 0.04); deck(0.68, h * 0.015, h * 0.028);
    tg.fillRect(x - 1.6, by - h, 3.2, h * 0.08);
    tg.globalCompositeOperation = "destination-out";
    for (const [a, b] of [[0.2, 0.235], [0.5, 0.53], [0.79, 0.815]]) tg.fillRect(x - h * 0.3, by - h * b, h * 0.6, h * (b - a));
    tg.beginPath(); tg.ellipse(x, by, hw(0) * 0.62, h * 0.12, 0, Math.PI, 0); tg.fill();
    if (o.under) { // what shows through the paper bands: the sky behind, not blank paper
      tg.globalCompositeOperation = "destination-over";
      poly(tg, sideL.concat(sideR.slice().reverse()), o.under);
    }
    if (gc) {
      gc.save(); gc.globalAlpha = o.alpha == null ? 1 : o.alpha;
      if (o.cutUnder) { // lift whatever ink lies under the silhouette, so the white bands are true paper
        gc.globalCompositeOperation = "destination-out"; poly(gc, sideL.concat(sideR.slice().reverse()), "#000");
        gc.globalCompositeOperation = "source-over";
      }
      gc.drawImage(tc, 0, 0); gc.restore();
    }
    if (!gk) return;
    const kc = o.key || P.sumi, kw = o.kw || 2.2;
    gk.save(); gk.globalAlpha = o.keyAlpha == null ? 1 : o.keyAlpha;
    line(gk, sample((f) => [x - hw(f * 0.93), by - h * f * 0.93], 24), kw, kc);
    line(gk, sample((f) => [x + hw(f * 0.93), by - h * f * 0.93], 24), kw, kc);
    // lattice
    gk.lineWidth = kw * 0.5; gk.strokeStyle = kc;
    for (let i = 0; i < 9; i++) {
      const fa = 0.06 + i * 0.095, fb = fa + 0.095;
      if (fb > 0.9) break;
      const ya = by - h * fa, yb = by - h * fb;
      gk.beginPath();
      gk.moveTo(x - hw(fa), ya); gk.lineTo(x + hw(fb), yb);
      gk.moveTo(x + hw(fa), ya); gk.lineTo(x - hw(fb), yb);
      gk.stroke();
    }
    for (const [f, wpad, hh] of [[0.36, h * 0.03, h * 0.04], [0.68, h * 0.015, h * 0.028]]) {
      gk.lineWidth = kw * 0.8; gk.strokeRect(x - hw(f) - wpad, by - h * f - hh, (hw(f) + wpad) * 2, hh);
    }
    line(gk, [[x, by - h * 0.93], [x, by - h]], kw * 0.7, kc);
    gk.restore();
  }

  function skyline(g, y, x0, x1, hmin, hmax, col, seed, opts) {
    opts = opts || {};
    const r = rng(seed);
    let x = x0;
    g.fillStyle = col;
    const rects = [];
    while (x < x1) {
      const w = 18 + r() * 52, hh = hmin + Math.pow(r(), 1.8) * (hmax - hmin);
      g.fillRect(x, y - hh, w + 1, hh + 2);
      rects.push([x, y - hh, w, hh]);
      x += w;
    }
    return rects;
  }

  function mountain(gc, cx, peakY, baseY, w, col, snow, shade) {
    const left = sample((s) => [cx - s * w * 0.5, peakY + (baseY - peakY) * Math.pow(s, 1.55)], 40);
    const right = sample((s) => [cx + s * w * 0.55, peakY + (baseY - peakY) * Math.pow(s, 1.8)], 40);
    const notch = [[cx - 14, peakY + 2], [cx - 6, peakY - 3], [cx + 2, peakY + 4], [cx + 10, peakY - 1], [cx + 16, peakY + 3]];
    const outline = left.slice().reverse().concat(notch, right);
    poly(gc, outline.concat([[cx + w * 0.55, baseY + 4], [cx - w * 0.5, baseY + 4]]), col);
    if (shade) {
      gc.save(); poly(gc, outline.concat([[cx + w * 0.55, baseY + 4], [cx - w * 0.5, baseY + 4]])); gc.clip();
      poly(gc, sample((s) => [cx + 30 + s * w * 0.33, peakY + 20 + (baseY - peakY) * Math.pow(s, 1.5)], 30).concat([[cx + w * 0.6, baseY + 4], [cx + w * 0.6, peakY]]), shade);
      gc.restore();
    }
    if (snow) {
      // snowcap is paper: fingers dripping down the gullies
      const r = rng(19), sl = 0.24;
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const u = i / 48, s = -1 + u * 2; // -1 left .. 1 right
        const side = s < 0 ? -s : s;
        const sx = s < 0 ? cx - side * sl * w * 0.5 : cx + side * sl * w * 0.55;
        const sy = peakY + (baseY - peakY) * Math.pow(sl * side, s < 0 ? 1.55 : 1.8);
        pts.push([sx, sy]);
      }
      const edge = [];
      const xL = cx - sl * w * 0.5, xR = cx + sl * w * 0.55;
      for (let k = 0; k <= 7; k++) {
        const u = k / 7, xx = xR - u * (xR - xL);
        const base = peakY + (baseY - peakY) * 0.08 + Math.sin(u * 9) * 3;
        edge.push([xx + 6, base]);
        if (k < 7) {
          const depth = 14 + Math.pow(r(), 1.4) * 60;
          edge.push([xx - (xR - xL) / 14 - 6, base + depth]);
        }
      }
      gc.save(); gc.globalCompositeOperation = "destination-out";
      poly(gc, [[cx, peakY - 6]].concat(pts.slice(24).map(p => [p[0], p[1] - 2]), edge, pts.slice(0, 24).reverse().map(p => [p[0], p[1] - 2])), "#000");
      gc.restore();
    }
    return outline;
  }

  function water(g, y0, y1, cols, seed, opts) {
    opts = opts || {};
    const n = cols.length, bh = (y1 - y0) / n;
    for (let i = 0; i < n; i++) {
      const top = y0 + i * bh, gr = g.createLinearGradient(0, top, 0, top + bh + 1);
      gr.addColorStop(0, i === 0 ? cols[0] : cols[i - 1]);
      gr.addColorStop(0.45, cols[i]); gr.addColorStop(1, cols[i]);
      g.fillStyle = gr; g.fillRect(X0, top, X1 - X0, bh + 1);
    }
    // ripple lines left as paper
    const r = rng(seed);
    g.save(); g.globalCompositeOperation = "destination-out"; g.strokeStyle = "#000"; g.lineCap = "round";
    let y = y0 + 10, gap = 9;
    while (y < y1 - 4) {
      let x = X0 + r() * 60;
      while (x < X1) {
        const len = 30 + r() * 110;
        if (r() < 0.55) {
          g.lineWidth = 1.2 + (y - y0) / (y1 - y0) * 1.6;
          g.globalAlpha = opts.ripple == null ? 0.85 : opts.ripple;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + len / 2, y - 3, x + len, y); g.stroke();
        }
        x += len + 30 + r() * 120;
      }
      y += gap; gap *= 1.12;
    }
    g.restore();
  }

  function stones(gc, gk, y0, y1, col, seed, keyAlpha) {
    gc.fillStyle = col; gc.fillRect(X0, y0, X1 - X0, y1 - y0);
    const r = rng(seed);
    gk.save(); gk.globalAlpha = keyAlpha == null ? 0.8 : keyAlpha;
    line(gk, [[X0, y0 + 1], [X1, y0 + 1]], 2.6);
    let y = y0 + 34, row = 0;
    gk.strokeStyle = P.sumi; gk.lineWidth = 1.4;
    while (y < y1) {
      gk.beginPath(); gk.moveTo(X0, y); gk.lineTo(X1, y); gk.stroke();
      let x = X0 + (row % 2) * 40 + r() * 30;
      while (x < X1) {
        // slanted, parallel joints
        gk.beginPath(); gk.moveTo(x, y - (y - y0 > 34 ? 30 : y - y0)); gk.lineTo(x - 6, y); gk.stroke();
        x += 70 + r() * 60;
      }
      y += 30 + row * 2; row++;
    }
    gk.restore();
  }

  function pinePad(gc, gk, px, py, pw, ph, col, seed) {
    const r = rng(seed);
    const top = sample((u) => [px - pw / 2 + u * pw, py - Math.sin(u * Math.PI) * ph * 0.18], 16);
    const bottom = [];
    const sc = 5 + Math.floor(r() * 3);
    for (let i = sc; i >= 0; i--) {
      const u = i / sc;
      bottom.push([px - pw / 2 + u * pw, py + ph * (0.55 + 0.35 * Math.sin(u * Math.PI))]);
      if (i > 0) bottom.push([px - pw / 2 + (u - 0.5 / sc) * pw, py + ph * (0.85 + 0.25 * Math.sin(u * Math.PI)) + r() * 4]);
    }
    const shape = top.concat(bottom);
    poly(gc, shape, col);
    line(gk, top, 2.4);
    // needle fans along the lower edge
    gk.strokeStyle = P.sumi; gk.lineWidth = 1.1;
    const nf = Math.floor(pw / 22);
    for (let i = 0; i < nf; i++) {
      const u = (i + 0.5) / nf, bx = px - pw / 2 + u * pw, by = py + ph * (0.45 + 0.3 * Math.sin(u * Math.PI));
      for (let k = -2; k <= 2; k++) { gk.beginPath(); gk.moveTo(bx, by - ph * 0.28); gk.lineTo(bx + k * 4, by); gk.stroke(); }
    }
  }

  function pine(b, x, y, scale, colPad, colBark, seed) {
    const gk = ctx(b.g0), g2 = ctx(b.g2);
    const s = scale;
    const trunk = sample((u) => [x + Math.sin(u * 2.6) * 60 * s + u * 90 * s, y - u * 470 * s], 30);
    // trunk as a filled tapered shape
    const left = trunk.map((p, i) => [p[0] - (24 - i * 0.5) * s, p[1]]);
    const right = trunk.map((p, i) => [p[0] + (24 - i * 0.5) * s, p[1]]).reverse();
    poly(g2, left.concat(right), colBark);
    carve(gk, left, 3, P.sumi, seed); carve(gk, right.slice().reverse(), 3, P.sumi, seed + 1);
    const pads = [[0.98, 0, 220, 70], [0.78, -110, 180, 56], [0.66, 120, 200, 60], [0.5, -70, 150, 48], [0.88, 160, 150, 50]];
    pads.forEach(([u, dx, pw, ph], i) => {
      const p = trunk[Math.round(u * 30)];
      const bx = p[0] + dx * s, by = p[1] - 6 * s;
      line(gk, [p, [bx, by + 10 * s]], 5 * s, P.sumi);
      line(g2, [p, [bx, by + 10 * s]], 4 * s, colBark);
      pinePad(g2, gk, bx, by, pw * s, ph * s, colPad, seed + i * 7);
    });
  }

  function boat(gc, gk, x, y, s, hull, sail) {
    const hullPts = [[x - 46 * s, y - 8 * s], [x + 52 * s, y - 8 * s], [x + 38 * s, y + 6 * s], [x - 36 * s, y + 6 * s]];
    poly(gc, hullPts, hull); line(gk, hullPts.concat([hullPts[0]]), 2);
    const sailPts = [[x - 8 * s, y - 12 * s], [x - 8 * s, y - 78 * s], [x + 26 * s, y - 74 * s], [x + 30 * s, y - 14 * s]];
    if (sail) poly(gc, sailPts, sail);
    line(gk, sailPts.concat([sailPts[0]]), 1.8);
    gk.lineWidth = 1; gk.strokeStyle = P.sumi;
    for (let i = 1; i < 4; i++) { gk.beginPath(); gk.moveTo(x - 8 * s, y - 12 * s - i * 16 * s); gk.lineTo(x + 26 * s + i, y - 14 * s - i * 15 * s); gk.stroke(); }
  }

  // abstract carved signage glyphs: reads as lettering at print scale
  function glyphs(gk, x, y, w, h, n, seed) {
    const r = rng(seed), ch = h / n;
    gk.strokeStyle = P.sumi; gk.lineCap = "square";
    for (let i = 0; i < n; i++) {
      const cy = y + i * ch + ch * 0.15, cs = ch * 0.7;
      gk.lineWidth = Math.max(1.5, w * 0.08);
      for (let k = 0; k < 4 + r() * 3; k++) {
        const vertical = r() < 0.45;
        const ax = x + w * 0.15 + r() * w * 0.6, ay = cy + r() * cs * 0.8;
        gk.beginPath(); gk.moveTo(ax, ay);
        gk.lineTo(vertical ? ax : ax + w * (0.2 + r() * 0.4), vertical ? ay + cs * (0.2 + r() * 0.5) : ay);
        gk.stroke();
      }
    }
  }

  function figure(gc, gk, x, y, s, umbrella, coat, seed) {
    const r = rng(seed);
    // body
    const body = [[x - 7 * s, y - 34 * s], [x + 7 * s, y - 34 * s], [x + 9 * s, y - 10 * s], [x - 9 * s, y - 10 * s]];
    poly(gc, body, coat);
    line(gk, body.concat([body[0]]), 1.4);
    line(gk, [[x - 4 * s, y - 10 * s], [x - 5 * s, y]], 2.2 * s);
    line(gk, [[x + 4 * s, y - 10 * s], [x + 5 * s, y]], 2.2 * s);
    if (umbrella) {
      const ux = x + (r() - 0.5) * 6 * s, uy = y - 40 * s;
      gc.fillStyle = umbrella;
      gc.beginPath(); gc.ellipse(ux, uy, 24 * s, 12 * s, 0, Math.PI, 0); gc.closePath(); gc.fill();
      gk.lineWidth = 1.5; gk.strokeStyle = P.sumi;
      gk.beginPath(); gk.ellipse(ux, uy, 24 * s, 12 * s, 0, Math.PI, 0); gk.closePath(); gk.stroke();
      for (let k = -2; k <= 2; k++) { gk.beginPath(); gk.moveTo(ux, uy - 12 * s); gk.lineTo(ux + k * 10 * s, uy); gk.stroke(); }
      line(gk, [[ux, uy], [x, y - 26 * s]], 1.2);
    } else {
      gc.fillStyle = P.sumi; gc.beginPath(); gc.arc(x, y - 39 * s, 5 * s, 0, Math.PI * 2); gc.fill();
    }
  }

  function finish(b, seeds) {
    texture(b.g1, { seed: seeds + 1, wood: 0.1, baren: 0.22 });
    texture(b.g2, { seed: seeds + 2, wood: 0.08, baren: 0.18 });
    texture(b.g3, { seed: seeds + 3, wood: 0.06, baren: 0.2 });
    texture(b.g0, { seed: seeds + 4, wood: 0, baren: 0.06, speck: 0.12 });
  }

  // ================= VIEW: the bay (dawn / night share one key block) =================
  let bayKey = null;

  function bay(night) {
    const b = blocks();
    const g1 = ctx(b.g1), g2 = ctx(b.g2), g3 = ctx(b.g3);
    const fresh = !bayKey;
    const gk = fresh ? ctx(b.g0) : null;
    [g1, g2, g3].forEach((g) => { g.save(); clipInner(g); });
    if (gk) { gk.save(); clipInner(gk); }
    const kk = gk || ctx(canvas()); // throwaway key when reusing the dawn key block

    // --- sky
    if (!night) {
      bokashi(g1, P.blue, Y0, 250, { seed: 3, wander: 26 });
      bokashi(g1, P.peach, 600, 330, { seed: 4, wander: 22, max: 0.95 });
      bokashi(g1, P.beniP, 600, 470, { seed: 5, wander: 16, max: 0.9 });
    } else {
      g1.fillStyle = P.blue; g1.fillRect(X0, Y0, X1 - X0, 610);
      bokashi(g1, P.trough, Y0, 380, { seed: 6, wander: 28 });
      g1.save(); g1.globalCompositeOperation = "destination-out";
      g1.beginPath(); g1.arc(1290, 190, 58, 0, Math.PI * 2); g1.fill(); g1.restore();
    }
    // --- the mountain (an original silhouette)
    mountain(g1, 560, 300, 585, 860, night ? "#3b5679" : "#a9c0cc", true, night ? "#2f4868" : "#93abba");
    // --- sun
    if (!night) {
      g1.fillStyle = P.beni; g1.beginPath(); g1.arc(1130, 592, 78, 0, Math.PI * 2); g1.fill();
    }
    // --- skyline
    const far = skyline(g1, 602, X0, X1, 14, 64, night ? P.blueD : P.pale, 201);
    const near = skyline(g2, 604, X0, X1, 8, 40, night ? "#2b3140" : P.greyG, 202);
    // near skyline key line
    {
      const pts = [];
      for (const [x, y, w] of near) { pts.push([x, y]); pts.push([x + w, y]); }
      line(kk, pts, 1.6);
    }
    if (night) {
      const r = rng(210);
      g3.fillStyle = P.ochre;
      for (const [x, y, w, h] of far.concat(near)) {
        for (let i = 0; i < (w * h) / 260; i++) if (r() < 0.55) g3.fillRect(x + 3 + r() * (w - 8), y + 3 + r() * (h - 6), 3, 4);
      }
    }
    // --- tower: the constant subject
    tower(g3, kk, 1480, 604, 370, { col: P.beni, under: night ? "#d8cfb6" : "#efe5cc" });
    if (night) {
      g3.fillStyle = P.ochre;
      for (const f of [0.36, 0.68]) g3.fillRect(1480 - 18, 604 - 370 * f - 12, 36, 6);
    }
    // --- water
    water(g1, 604, 870, night ? [P.blueL, P.blue, P.blueD, P.trough] : [P.pale2, P.pale, P.blueL, P.blue], 33, { ripple: night ? 0.45 : 0.85 });
    if (!night) {
      // sun on the water, in broken beni dashes
      const r = rng(41);
      g3.fillStyle = P.beni;
      for (let i = 0; i < 16; i++) {
        const y = 616 + i * 9 + i * i * 0.6, w = 90 - i * 4 + r() * 20;
        g3.globalAlpha = 0.9 - i * 0.04;
        g3.fillRect(1130 - w / 2 + (r() - 0.5) * 20, y, w, 3 + i * 0.15);
      }
      g3.globalAlpha = 1;
    }
    // --- boats
    boat(g2, kk, 880, 700, 0.9, night ? "#3a3026" : "#6a5038", night ? "#9aa0a0" : P.cream);
    boat(g2, kk, 1290, 772, 1.1, night ? "#3a3026" : "#6a5038", night ? "#9aa0a0" : P.cream);
    // --- embankment
    stones(g2, kk, 868, Y1, night ? "#5d5a50" : P.stone, 61, 0.75);
    // --- pine, framing the left edge
    pine(b, 150, 900, 1.0, night ? "#25362a" : P.pine, night ? "#3a2c22" : P.bark, 300);

    [g1, g2, g3].forEach((g) => g.restore());
    if (gk) gk.restore();
    // --- mist: paper bands across the city
    const s = night ? 0.18 : 1;
    mist([b.g1, b.g2, b.g3], 180, 538, 980, 34, s);
    mist([b.g1, b.g2, b.g3], 880, 468, 820, 26, s * 0.9);
    mist([b.g1], 90, 330, 640, 22, s * 0.8);
    if (gk) mist([b.g0], 180, 538, 980, 34, 0.55);
    finish(b, night ? 500 : 100);
    if (fresh) bayKey = b.g0; else b.g0 = bayKey;
    return b;
  }

  // ================= VIEW: cherry blossoms on the river =================
  function sakuraCluster(gc, gk, cx, cy, rad, seed, cols) {
    const r = rng(seed), circles = [];
    for (let i = 0; i < 9; i++) circles.push([cx + (r() - 0.5) * rad * 1.6, cy + (r() - 0.5) * rad * 0.9, rad * (0.35 + r() * 0.35)]);
    gk.save(); gk.lineWidth = 3.2; gk.strokeStyle = P.sumi;
    for (const [x, y, rr] of circles) { gk.beginPath(); gk.arc(x, y, rr, 0, Math.PI * 2); gk.stroke(); }
    gk.globalCompositeOperation = "destination-out";
    for (const [x, y, rr] of circles) { gk.beginPath(); gk.arc(x, y, rr - 1.4, 0, Math.PI * 2); gk.fill(); }
    gk.restore();
    gc.fillStyle = cols[0];
    for (const [x, y, rr] of circles) { gc.beginPath(); gc.arc(x, y, rr, 0, Math.PI * 2); gc.fill(); }
    gc.fillStyle = cols[1];
    for (const [x, y, rr] of circles) { gc.beginPath(); gc.arc(x + rr * 0.2, y + rr * 0.25, rr * 0.55, 0, Math.PI * 2); gc.fill(); }
    // blossoms as paper: tiny five-dot flowers
    gc.save(); gc.globalCompositeOperation = "destination-out";
    for (let i = 0; i < rad * 0.5; i++) {
      const [x, y, rr] = circles[Math.floor(r() * circles.length)];
      const a = r() * Math.PI * 2, d = r() * rr * 0.85, fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d;
      for (let p = 0; p < 5; p++) { gc.beginPath(); gc.arc(fx + Math.cos(p * 1.256) * 2.6, fy + Math.sin(p * 1.256) * 2.6, 1.7, 0, Math.PI * 2); gc.fill(); }
    }
    gc.restore();
  }

  function sakura() {
    const b = blocks();
    const g1 = ctx(b.g1), g2 = ctx(b.g2), g3 = ctx(b.g3), gk = ctx(b.g0);
    [g1, g2, g3, gk].forEach((g) => { g.save(); clipInner(g); });
    bokashi(g3, P.peach, Y0, 290, { seed: 21, wander: 24, max: 0.9 });
    bokashi(g1, P.pale2, 600, 420, { seed: 22, wander: 20, max: 0.8 });
    // far skyline and the tower in the gap between trees
    skyline(g1, 560, X0, X1, 10, 70, P.pale, 220);
    tower(g3, gk, 1190, 562, 300, { col: "#c76a52", kw: 1.8 });
    // far bank wall
    stones(g2, gk, 556, 604, P.stone, 23, 0.7);
    // trunks
    const r = rng(24);
    const trees = [];
    for (let x = 90; x < 1860; x += 120 + r() * 70) {
      if (x > 1070 && x < 1300) continue;
      trees.push(x);
      const th = 90 + r() * 50;
      poly(g2, [[x - 7, 556], [x + 7, 556], [x + 4 + (r() - 0.5) * 10, 556 - th], [x - 4, 556 - th]], P.bark);
      line(gk, [[x - 7, 556], [x - 4, 556 - th]], 2); line(gk, [[x + 7, 556], [x + 4, 556 - th]], 2);
    }
    // canopies (rows behind the lantern rope)
    trees.forEach((x, i) => sakuraCluster(g3, gk, x + (r() - 0.5) * 30, 420 + (r() - 0.5) * 40, 95 + r() * 25, 400 + i, [P.sakura, "#e9b3a6"]));
    // lantern rope + chōchin
    const rope = sample((u) => [X0 + u * (X1 - X0), 478 + Math.sin(u * Math.PI * 7) * 12 + 6], 120);
    line(gk, rope, 1.4);
    for (let i = 0; i < rope.length; i += 5) {
      const [x, y] = rope[i];
      g3.fillStyle = i % 10 ? P.beniP : P.peach;
      g3.beginPath(); g3.ellipse(x, y + 14, 9, 12, 0, 0, Math.PI * 2); g3.fill();
      gk.lineWidth = 1.3; gk.strokeStyle = P.sumi; gk.beginPath(); gk.ellipse(x, y + 14, 9, 12, 0, 0, Math.PI * 2); gk.stroke();
      gk.fillStyle = P.sumi; gk.fillRect(x - 6, y + 1, 12, 3); gk.fillRect(x - 6, y + 25, 12, 3);
    }
    // river
    water(g1, 604, 838, [P.pale2, P.pale, P.blueL], 25);
    // petal rafts (hanaikada) along the banks
    g3.fillStyle = P.sakura;
    for (let i = 0; i < 80; i++) {
      const x = X0 + r() * (X1 - X0), y = r() < 0.5 ? 612 + r() * 26 : 800 + r() * 30;
      g3.beginPath(); g3.ellipse(x, y, 5 + r() * 9, 2 + r() * 2, 0, 0, Math.PI * 2); g3.fill();
    }
    // taiko bridge, side view
    const arch = sample((u) => [210 + u * 560, 612 - Math.sin(u * Math.PI) * 92], 40);
    const deckTop = arch.map(([x, y]) => [x, y - 16]);
    poly(g2, deckTop.concat(arch.slice().reverse()), "#7a5a40");
    line(gk, deckTop, 2.6); line(gk, arch, 2.2);
    const rail = arch.map(([x, y]) => [x, y - 52]);
    line(gk, rail, 2.2);
    for (let i = 0; i <= 40; i += 4) line(gk, [deckTop[i], rail[i]], 1.6);
    for (const i of [6, 14, 26, 34]) { const [x, y] = arch[i]; poly(g2, [[x - 7, y], [x + 7, y], [x + 7, 700], [x - 7, 700]], "#6a4d38"); line(gk, [[x - 7, y], [x - 7, 700]], 1.8); line(gk, [[x + 7, y], [x + 7, 700]], 1.8); }
    // near bank: path + wall
    g2.fillStyle = P.straw; g2.fillRect(X0, 838, X1 - X0, 44);
    line(gk, [[X0, 838], [X1, 838]], 2.6);
    stones(g2, gk, 882, Y1, P.stone, 26, 0.75);
    // the foreground branch, from the top-right corner
    const br = sample((u) => [1900 - u * 760, 40 + u * 210 + Math.sin(u * 5) * 18], 30);
    const bl = br.map((p, i) => [p[0], p[1] - (20 - i * 0.55)]), brr = br.map((p, i) => [p[0], p[1] + (20 - i * 0.55)]);
    poly(g2, bl.concat(brr.slice().reverse()), P.bark);
    carve(gk, bl, 3.4, P.sumi, 31); carve(gk, brr, 3.4, P.sumi, 32);
    const twigs = [[0.25, -40, 110], [0.45, 60, 120], [0.62, -50, 90], [0.8, 50, 110], [0.95, -20, 80]];
    twigs.forEach(([u, dy, len], i) => {
      const p = br[Math.round(u * 30)], q = [p[0] - len * 0.7, p[1] + dy + len * 0.4];
      line(g2, [p, q], 8, P.bark); line(gk, [p, q], 2.4);
      sakuraCluster(g3, gk, q[0], q[1], 46, 600 + i, [P.sakura, "#e3a39a"]);
    });
    sakuraCluster(g3, gk, 1520, 150, 70, 640, [P.sakura, "#e3a39a"]);
    sakuraCluster(g3, gk, 1760, 90, 64, 641, [P.sakura, "#e3a39a"]);
    sakuraCluster(g3, gk, 1300, 230, 56, 642, [P.sakura, "#e3a39a"]);
    [g1, g2, g3, gk].forEach((g) => g.restore());
    mist([b.g1, b.g2, b.g3], 120, 520, 900, 30, 0.95);
    mist([b.g1, b.g2, b.g3], 1240, 540, 600, 24, 0.85);
    finish(b, 200);
    return b;
  }

  // ================= VIEW: rain at the crossing =================
  function rain() {
    const b = blocks();
    const g1 = ctx(b.g1), g2 = ctx(b.g2), g3 = ctx(b.g3), gk = ctx(b.g0);
    [g1, g2, g3, gk].forEach((g) => { g.save(); clipInner(g); });
    g1.fillStyle = "#c9cfcf"; g1.fillRect(X0, Y0, X1 - X0, 600);
    bokashi(g1, "#4b5058", Y0, 360, { seed: 41, wander: 30 });
    // tower, faint, between far towers
    tower(g1, gk, 1010, 600, 470, { col: "#b99d93", key: "#7b7470", kw: 1.4, keyAlpha: 0.7 });
    // far buildings
    const r = rng(42);
    for (const [x, w, top] of [[560, 150, 230], [720, 120, 300], [1120, 170, 250], [1300, 110, 330], [850, 90, 420]]) {
      g1.fillStyle = P.greyB; g1.fillRect(x, top, w, 640 - top);
      g1.save(); g1.globalCompositeOperation = "destination-out";
      for (let yy = top + 16; yy < 600; yy += 22) for (let xx = x + 10; xx < x + w - 10; xx += 18) if (r() < 0.6) g1.fillRect(xx, yy, 9, 11);
      g1.restore();
    }
    // near buildings, left
    g2.fillStyle = "#a89a80"; g2.fillRect(X0, 180, 500, 450);
    line(gk, [[X0, 180], [544, 180], [544, 630]], 2.6);
    g3.fillStyle = P.beniP; g3.fillRect(110, 250, 330, 190);
    gk.lineWidth = 6; gk.strokeStyle = P.sumi; gk.strokeRect(110, 250, 330, 190);
    gk.save(); gk.globalAlpha = 0.85;
    gk.font = '120px "Shippori Mincho B"'; gk.fillStyle = P.sumi; gk.textAlign = "center"; gk.textBaseline = "middle";
    gk.fillText("雨", 275, 350); gk.restore();
    g2.save(); g2.globalCompositeOperation = "destination-out";
    for (let yy = 470; yy < 610; yy += 26) for (let xx = 70; xx < 520; xx += 24) g2.fillRect(xx, yy, 12, 14);
    g2.restore();
    // near buildings, right, with vertical signboards
    g2.fillStyle = "#8a9488"; g2.fillRect(1380, 140, 500, 490);
    line(gk, [[1380, 630], [1380, 140], [1880, 140]], 2.6);
    g2.save(); g2.globalCompositeOperation = "destination-out";
    for (let yy = 170; yy < 610; yy += 26) for (let xx = 1560; xx < 1860; xx += 24) if (r() < 0.75) g2.fillRect(xx, yy, 12, 14);
    g2.restore();
    [[1410, 200, P.ochre, 6], [1480, 230, P.beniP, 5]].forEach(([x, y, c, n], i) => {
      g3.fillStyle = c; g3.fillRect(x, y, 52, n * 52);
      gk.lineWidth = 2.4; gk.strokeRect(x, y, 52, n * 52);
      glyphs(gk, x + 2, y + 6, 48, n * 52 - 10, n, 70 + i);
    });
    // low shops in the middle
    g2.fillStyle = "#77736a"; g2.fillRect(544, 470, 836, 160);
    line(gk, [[544, 470], [1380, 470]], 2.4);
    for (let x = 560; x < 1370; x += 104) {
      g3.fillStyle = (x / 104) % 2 < 1 ? P.straw : P.peach;
      poly(g3, [[x, 540], [x + 92, 540], [x + 100, 566], [x - 8, 566]]);
      g3.fill();
      line(gk, [[x - 8, 566], [x, 540], [x + 92, 540], [x + 100, 566]], 1.6);
    }
    // the road
    g1.fillStyle = "#a3adb2"; g1.fillRect(X0, 630, X1 - X0, Y1 - 630);
    bokashi(g1, "#7d8a92", Y1, 760, { seed: 43, wander: 20, max: 0.8 });
    line(gk, [[X0, 630], [X1, 630]], 2.4);
    // crossings: parallel, slanted stripes left as paper
    g1.save(); g1.globalCompositeOperation = "destination-out";
    for (const [y, h] of [[690, 64], [900, 74]]) {
      for (let x = X0 - 40; x < X1; x += 46) poly(g1, [[x, y + h], [x + 24, y + h], [x + 44, y], [x + 20, y]], "#000");
    }
    g1.restore();
    // reflections of the screen on the wet road
    g3.globalAlpha = 0.55; g3.fillStyle = P.beniP;
    for (let i = 0; i < 14; i++) g3.fillRect(130 + r() * 290, 640 + i * 4, 30 + r() * 70, 2.5);
    g3.globalAlpha = 1;
    // the crowd (static half)
    const cols = [P.indigo, P.straw, "#6e6c62", P.indigo, "#4d6f98", P.straw];
    const people = [];
    for (let i = 0; i < 46; i++) {
      const row = i % 3, s = [0.55, 0.75, 0.95][row], y = [672, 760, 846][row] + (r() - 0.5) * 16;
      people.push([X0 + 40 + r() * 1760, y, s, i === 17 ? P.beni : cols[Math.floor(r() * cols.length)]]);
    }
    people.sort((a, b2) => a[1] - b2[1]).forEach(([x, y, s, c], i) => figure(g3, gk, x, y, s, c, "#3a3632", 900 + i));
    [g1, g2, g3, gk].forEach((g) => g.restore());
    mist([b.g1, b.g2, b.g3], 500, 420, 700, 26, 0.7);
    finish(b, 300);
    return b;
  }

  // ================= VIEW: the great lantern at Asakusa =================
  function asakusa() {
    const b = blocks();
    const g1 = ctx(b.g1), g2 = ctx(b.g2), g3 = ctx(b.g3), gk = ctx(b.g0);
    [g1, g2, g3, gk].forEach((g) => { g.save(); clipInner(g); });
    bokashi(g1, P.pale, Y0, 330, { seed: 51, wander: 26 });
    bokashi(g3, P.peach, 640, 460, { seed: 52, wander: 18, max: 0.55 });
    // far tower, tiny in the mist
    tower(g3, gk, 1000, 560, 170, { col: "#c98a76", kw: 1.2, keyAlpha: 0.6 });
    // trees behind the hall
    bokashi(g2, P.greenD, 560, 470, { seed: 54, wander: 22, max: 0.75, x0: 520, x1: 1240 });
    // the main hall: a great roof
    const roofTop = sample((u) => [560 + u * 620, 520 - Math.sin(u * Math.PI) * 26 - (u < 0.08 || u > 0.92 ? 18 : 0)], 40);
    const roof = roofTop.concat([[1210, 600], [530, 600]]);
    poly(g2, roof, P.slate); line(gk, roofTop, 2.8); line(gk, [[530, 600], [1210, 600]], 2.6);
    g2.fillStyle = "#8f5a3c"; g2.fillRect(580, 600, 580, 100);
    for (let x = 600; x < 1160; x += 70) { line(gk, [[x, 600], [x, 700]], 2); }
    // five-storey pagoda
    const px = 330;
    // stone base
    poly(g2, [[px - 150, 704], [px + 150, 704], [px + 130, 650], [px - 130, 650]], "#9a917c");
    line(gk, [[px - 150, 704], [px - 130, 650], [px + 130, 650], [px + 150, 704]], 2.2);
    let topY = 650;
    for (let i = 0; i < 5; i++) {
      const y = 650 - i * 104, w = 240 - i * 24, ww = w * (0.36 - i * 0.012);
      g2.fillStyle = "#a0623e"; g2.fillRect(px - ww, y - 104, ww * 2, 104);
      line(gk, [[px - ww, y - 104], [px - ww, y]], 1.8); line(gk, [[px + ww, y - 104], [px + ww, y]], 1.8);
      for (let k = -1; k <= 1; k++) line(gk, [[px + k * ww * 0.5, y - 70], [px + k * ww * 0.5, y - 8]], 1.2);
      const ry = y - 60;
      const rf = sample((u) => [px - w / 2 + u * w, ry - Math.sin(u * Math.PI) * 22 - Math.pow(Math.abs(u - 0.5) * 2, 6) * 18], 30);
      poly(g2, rf.concat([[px + w * 0.4, ry + 10], [px - w * 0.4, ry + 10]]), P.slate);
      line(gk, rf, 2.4); line(gk, [[px - w * 0.4, ry + 10], [px + w * 0.4, ry + 10]], 1.6);
      topY = ry - 22;
    }
    line(gk, [[px, topY], [px, topY - 90]], 3.2);
    for (let i = 0; i < 7; i++) line(gk, [[px - 9, topY - 14 - i * 9], [px + 9, topY - 14 - i * 9]], 1.6);
    // pavement, parallel slanted joints
    g2.fillStyle = "#c8b998"; g2.fillRect(X0, 700, X1 - X0, Y1 - 700);
    line(gk, [[X0, 700], [X1, 700]], 2.4);
    gk.lineWidth = 1.2; gk.strokeStyle = P.sumi;
    for (let y = 740; y < Y1; y += 46) { gk.beginPath(); gk.moveTo(X0, y); gk.lineTo(X1, y); gk.stroke(); }
    for (let x = -300; x < X1; x += 120) { gk.beginPath(); gk.moveTo(x, Y1); gk.lineTo(x + 140, 700); gk.stroke(); }
    // incense burner
    const bx = 820;
    poly(g2, [[bx - 60, 760], [bx + 60, 760], [bx + 44, 690], [bx - 44, 690]], "#4d5a52");
    poly(g2, [[bx - 80, 690], [bx + 80, 690], [bx + 30, 650], [bx - 30, 650]], "#3d4842");
    line(gk, [[bx - 60, 760], [bx - 44, 690], [bx + 44, 690], [bx + 60, 760]], 2.2);
    line(gk, [[bx - 80, 690], [bx - 30, 650], [bx + 30, 650], [bx + 80, 690], [bx - 80, 690]], 2.2);
    // a few pilgrims
    const r = rng(53);
    for (let i = 0; i < 7; i++) figure(g3, gk, 560 + r() * 600, 700 + r() * 20, 0.6, null, [P.indigo, "#6e6c62", P.straw][i % 3], 960 + i);
    // the great lantern, cropped at the top: the frame is an object
    const lx = 1490, lw = 300;
    const body = sample((u) => { const y = 20 + u * 700; const bulge = Math.sin(Math.min(1, (y + 160) / 900) * Math.PI); return [lx - lw * (0.82 + 0.18 * bulge), y]; }, 40);
    const bodyR = body.map(([x, y]) => [2 * lx - x, y]).reverse();
    poly(g3, body.concat(bodyR), P.beni);
    // ribs
    gk.lineWidth = 1.2; gk.strokeStyle = "rgba(35,31,28,0.55)";
    for (let y = 60; y < 700; y += 18) {
      const i = Math.round(((y - 20) / 700) * 40), w = lx - body[Math.min(40, i)][0];
      gk.beginPath(); gk.moveTo(lx - w, y); gk.quadraticCurveTo(lx, y + 14, lx + w, y); gk.stroke();
    }
    carve(gk, body, 3.4, P.sumi, 71); carve(gk, bodyR, 3.4, P.sumi, 72);
    // black lacquer rings
    poly(gk, [[lx - 250, 700], [lx + 250, 700], [lx + 236, 780], [lx - 236, 780]], P.sumi);
    poly(gk, [[lx - 262, Y0], [lx + 262, Y0], [lx + 262, 62], [lx - 262, 62]], P.sumi);
    gk.save(); gk.globalCompositeOperation = "destination-out"; gk.lineWidth = 1.6;
    for (let x = lx - 230; x < lx + 230; x += 14) { gk.beginPath(); gk.moveTo(x, 712); gk.lineTo(x + 4, 770); gk.stroke(); }
    gk.restore();
    // the two great characters
    gk.fillStyle = P.sumi; gk.textAlign = "center"; gk.textBaseline = "middle";
    gk.font = '230px "Shippori Mincho B"';
    gk.fillText("雷", lx, 250); gk.fillText("門", lx, 510);
    [g1, g2, g3, gk].forEach((g) => g.restore());
    mist([b.g1, b.g2, b.g3], 480, 540, 760, 30, 0.9);
    mist([b.g1, b.g2], 60, 380, 520, 24, 0.7);
    finish(b, 400);
    return b;
  }

  // ---------- cartouches (prebuilt after fonts load) ----------
  function cartouche(series, title) {
    const chars = [...title], fs = 40, w = 96, tabH = 132, h = tabH + chars.length * (fs + 6) + 34;
    const c = canvas(w + 12, h + 12), g = ctx(c);
    g.translate(6, 6);
    g.fillStyle = P.cream; g.fillRect(0, 0, w, h);
    g.fillStyle = P.beniP; g.fillRect(8, 8, w - 16, tabH - 16);
    g.strokeStyle = P.sumi; g.lineWidth = 3.4; g.strokeRect(0, 0, w, h);
    g.lineWidth = 1.2; g.strokeRect(6, 6, w - 12, h - 12);
    g.lineWidth = 1.2; g.strokeRect(8, 8, w - 16, tabH - 16);
    g.fillStyle = P.sumi; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = '22px "Shippori Mincho B"';
    [...series].forEach((ch, i) => g.fillText(ch, w / 2, 26 + i * 25));
    g.font = `${fs}px "Yuji Syuku"`;
    chars.forEach((ch, i) => g.fillText(ch, w / 2, tabH + 10 + fs / 2 + i * (fs + 6)));
    texture(c, { seed: title.length * 13, wood: 0.05, baren: 0.12, speck: 0.15 });
    return c;
  }
  function sealCanvas(text, size, seed) {
    const c = canvas(size + 16, size + 16);
    UK.seal(ctx(c), 8, 8, size, text, { seed });
    return c;
  }

  window.VIEWS = { P, X0, X1, Y0, Y1, bay, sakura, rain, asakusa, cartouche, sealCanvas };
})();
