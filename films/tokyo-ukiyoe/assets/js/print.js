// print.js — the woodblock printing core: paper, blocks, textures, bokashi, carved lines, seals.
// Everything is deterministic: seeded hashes only, no Math.random().
(function () {
  const W = 1920, H = 1080;

  // ---------- deterministic randomness ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(i, j, s) {
    let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(s, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < (oct || 4); o++) {
      sum += amp * vnoise(x * f, y * f, s + o * 17);
      norm += amp; amp *= 0.5; f *= 2.03;
    }
    return sum / norm;
  }
  const n1 = (x, s) => vnoise(x, 0.5, s); // 1-D noise

  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w || W; c.height = h || H;
    return c;
  }
  function hexRGB(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  // ---------- shared textures (built once) ----------
  const T = {};

  function buildPaper() {
    const c = canvas(), g = c.getContext("2d");
    g.fillStyle = "#eee2c6"; g.fillRect(0, 0, W, H);
    // low-frequency mottling ±3 %
    const lw = 192, lh = 108, m = canvas(lw, lh), mg = m.getContext("2d");
    const id = mg.createImageData(lw, lh);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
      const n = fbm(x * 0.06, y * 0.06, 11, 4) - 0.5;
      const k = (y * lw + x) * 4;
      const l = n > 0 ? 255 : 120;
      id.data[k] = l; id.data[k + 1] = l * 0.96; id.data[k + 2] = l * 0.88;
      id.data[k + 3] = Math.min(255, Math.abs(n) * 2 * 0.07 * 255 * 2.2);
    }
    mg.putImageData(id, 0, 0);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(m, 0, 0, W, H);
    // edge ageing
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    gr.addColorStop(0, "rgba(150,110,60,0)"); gr.addColorStop(1, "rgba(150,110,60,0.13)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    T.paper = c;
  }

  function buildFibres() {
    const c = canvas(), g = c.getContext("2d"), r = rng(77);
    for (let i = 0; i < 3200; i++) {
      const x = r() * W, y = r() * H, len = 6 + r() * 30, a = r() * Math.PI * 2, bend = (r() - 0.5) * 0.8;
      g.strokeStyle = r() < 0.6 ? "rgba(251,246,233,0.55)" : "rgba(170,150,110,0.45)";
      g.lineWidth = 0.6 + r() * 0.7;
      g.beginPath(); g.moveTo(x, y);
      g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    }
    T.fibres = c;
  }

  function buildWood() {
    // iso-lines of a warped noise field, half resolution
    const w = 960, h = 540, c = canvas(w, h), g = c.getContext("2d");
    const id = g.createImageData(w, h), d = id.data;
    const knots = [[300, 200, 90], [1300, 700, 120], [800, 900, 70], [1650, 260, 80]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = x * 2, Y = y * 2;
      let u = Y * 0.028 + fbm(X * 0.0018, Y * 0.007, 5, 3) * 3.2 + fbm(X * 0.01, Y * 0.03, 8, 2) * 0.6;
      for (const [kx, ky, kr] of knots) {
        const dd = ((X - kx) ** 2) / (kr * kr * 9) + ((Y - ky) ** 2) / (kr * kr);
        u += 2.2 * Math.exp(-dd);
      }
      const f = u - Math.floor(u);
      const line = Math.abs(f - 0.5) > 0.43 ? 1 : 0;
      const band = 0.5 + 0.5 * Math.sin(u * 0.55);
      const a = Math.min(1, line * 0.7 + band * 0.16);
      const k = (y * w + x) * 4;
      d[k] = 20; d[k + 1] = 18; d[k + 2] = 30; d[k + 3] = a * 255;
    }
    g.putImageData(id, 0, 0);
    T.wood = c;
  }

  function buildBaren() {
    const c = canvas(), g = c.getContext("2d"), r = rng(31);
    g.filter = "blur(3px)";
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = r() * H, rad = 40 + r() * 140, a0 = r() * Math.PI * 2, span = 0.5 + r() * 2.2;
      g.strokeStyle = `rgba(255,255,255,${0.12 + r() * 0.25})`;
      g.lineWidth = 5 + r() * 12;
      g.beginPath(); g.arc(x, y, rad, a0, a0 + span); g.stroke();
    }
    g.filter = "blur(1.5px)";
    for (let i = 0; i < 70; i++) {
      let x = r() * W, y = r() * H;
      g.strokeStyle = `rgba(255,255,255,${0.2 + r() * 0.35})`;
      g.lineWidth = 2 + r() * 3;
      g.beginPath(); g.moveTo(x, y);
      const dir = r() * Math.PI;
      for (let k = 0; k < 14; k++) {
        x += Math.cos(dir) * 14 + (k % 2 ? 6 : -6) * Math.sin(dir);
        y += Math.sin(dir) * 14 + (k % 2 ? 6 : -6) * Math.cos(dir);
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.filter = "none";
    T.baren = c;
  }

  function buildSpecks() {
    const c = canvas(), g = c.getContext("2d"), r = rng(53);
    g.fillStyle = "#fff";
    for (let i = 0; i < 7000; i++) {
      g.globalAlpha = 0.4 + r() * 0.6;
      g.beginPath(); g.arc(r() * W, r() * H, 0.5 + r() * r() * 1.8, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
    T.specks = c;
  }

  // the reveal field: diagonal sweep with a noisy edge (quarter res)
  function buildRevealField() {
    const w = 480, h = 270, f = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const diag = (x / w) * 0.72 + (y / h) * 0.28; // left→right, slight downward
      f[y * w + x] = diag * 0.82 + fbm(x * 0.05, y * 0.05, 91, 4) * 0.18;
    }
    T.reveal = { w, h, f, c: canvas(w, h) };
  }

  function init() {
    buildPaper(); buildFibres(); buildWood(); buildBaren(); buildSpecks(); buildRevealField();
  }

  // ---------- block helpers ----------
  function texture(block, o) {
    o = o || {};
    const g = block.getContext("2d");
    const r = rng(o.seed || 1);
    g.save();
    // woodgrain on the ink only
    g.globalCompositeOperation = "source-atop";
    g.globalAlpha = o.wood == null ? 0.08 : o.wood;
    const ox = -r() * 200, oy = -r() * 120;
    g.drawImage(T.wood, ox, oy, W + 200, H + 120);
    // baren rubbing and specks lift ink back to paper
    g.globalCompositeOperation = "destination-out";
    g.globalAlpha = o.baren == null ? 0.2 : o.baren;
    g.drawImage(T.baren, -r() * 300, -r() * 200, W + 300, H + 200);
    g.globalAlpha = o.speck == null ? 0.3 : o.speck;
    g.drawImage(T.specks, -r() * 400, -r() * 300, W + 400, H + 300);
    g.restore();
  }

  // per-pixel bokashi: alpha(x,y) with a wandering edge per column
  function bokashi(g, rgbHex, fromY, toY, opts) {
    opts = opts || {};
    const s = opts.seed || 3, wander = opts.wander == null ? 24 : opts.wander;
    const x0 = opts.x0 || 0, x1 = opts.x1 || W;
    const maxA = opts.max == null ? 1 : opts.max;
    const w = Math.ceil((x1 - x0) / 2), y0 = Math.min(fromY, toY), y1 = Math.max(fromY, toY);
    const pad = wander + 4, h = Math.ceil((y1 - y0 + pad * 2) / 2);
    const c = canvas(w, h), cg = c.getContext("2d"), id = cg.createImageData(w, h), d = id.data;
    const [R, G, B] = hexRGB(rgbHex);
    for (let x = 0; x < w; x++) {
      const e = (n1((x0 + x * 2) * 0.004, s) - 0.5) * 2 * wander + (n1((x0 + x * 2) * 0.03, s + 9) - 0.5) * 5;
      for (let y = 0; y < h; y++) {
        const Y = y0 - pad + y * 2 - e;
        let t = (Y - fromY) / (toY - fromY); // 0 at fromY (full), 1 at toY (none)
        t = Math.max(0, Math.min(1, t));
        const a = (1 - t) * (1 - t) * (3 - 2 * (1 - t)) ;
        const k = (y * w + x) * 4;
        d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = Math.min(1, a) * maxA * 255;
      }
    }
    cg.putImageData(id, 0, 0);
    g.save();
    if (opts.clip) { g.beginPath(); opts.clip(g); g.clip(); }
    g.drawImage(c, x0, y0 - pad, w * 2, h * 2);
    g.restore();
  }

  // ---------- drawing helpers ----------
  function poly(g, pts, fill) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
  }
  function line(g, pts, w, col) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineWidth = w; g.strokeStyle = col || "#231f1c"; g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
  }
  // variable-width carved line, tapered at both ends, ±jitter
  function carve(g, pts, w, col, seed, jitter) {
    if (pts.length < 2) return;
    const j = jitter == null ? 0.28 : jitter, s = seed || 5;
    let L = 0; const acc = [0];
    for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); acc.push(L); }
    const left = [], right = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0];
      const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
      const t = L ? acc[i] / L : 0;
      const taper = Math.min(1, Math.min(t, 1 - t) * 6 + 0.12);
      const ww = w * taper * (1 + (n1(acc[i] * 0.02, s) - 0.5) * 2 * j) * 0.5;
      left.push([p[0] + nx * ww, p[1] + ny * ww]);
      right.push([p[0] - nx * ww, p[1] - ny * ww]);
    }
    poly(g, left.concat(right.reverse()), col || "#231f1c");
  }
  // sample a function into a polyline
  function sample(fn, n) {
    const out = [];
    for (let i = 0; i <= n; i++) out.push(fn(i / n));
    return out;
  }
  // suyari-gasumi: a long rounded mist band that returns ink to paper
  function mist(blocks, x, y, w, h, strength) {
    for (const b of blocks) {
      const g = b.getContext("2d");
      g.save();
      g.globalCompositeOperation = "destination-out";
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      const s = strength == null ? 1 : strength;
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.16, `rgba(0,0,0,${s})`);
      gr.addColorStop(0.84, `rgba(0,0,0,${s})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
      g.restore();
    }
  }

  // ---------- reveal mask (printing sweep) ----------
  // p: 0..1 progress. returns a quarter-res mask canvas (alpha) to be scaled to the sheet
  function revealMask(p, edge) {
    const R = T.reveal, w = R.w, h = R.h, g = R.c.getContext("2d");
    const id = g.createImageData(w, h), d = id.data, e = edge || 0.06;
    const th = p * (1 + e) - e;
    for (let i = 0; i < w * h; i++) {
      const v = (th - R.f[i]) / e;
      d[i * 4 + 3] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
    }
    g.putImageData(id, 0, 0);
    return R.c;
  }

  // ---------- the seal ----------
  function seal(g, x, y, size, text, opts) {
    opts = opts || {};
    const r = rng(opts.seed || 12);
    const c = canvas(Math.ceil(size + 8), Math.ceil(size + 8)), cg = c.getContext("2d");
    cg.fillStyle = "#b8412f";
    cg.beginPath(); cg.roundRect(4, 4, size, size, size * 0.08); cg.fill();
    cg.globalCompositeOperation = "destination-out";
    cg.fillStyle = "#000";
    const chars = [...text];
    if (chars.length === 1) {
      cg.font = `${size * 0.72}px "Shippori Mincho B", "Shippori Mincho"`;
      cg.textAlign = "center"; cg.textBaseline = "middle";
      cg.fillText(chars[0], 4 + size / 2, 4 + size / 2 + size * 0.04);
    } else {
      // two columns read right→left, top→bottom
      cg.font = `${size * 0.42}px "Shippori Mincho B", "Shippori Mincho"`;
      cg.textAlign = "center"; cg.textBaseline = "middle";
      const cols = Math.ceil(chars.length / 2);
      for (let i = 0; i < chars.length; i++) {
        const col = Math.floor(i / 2), row = i % 2;
        const cx = 4 + size - (col + 0.5) * (size / cols);
        const cy = 4 + (row + 0.5) * (size / 2) + size * 0.02;
        cg.fillText(chars[i], cx, cy);
      }
    }
    // inner frame line
    cg.lineWidth = Math.max(1.5, size * 0.035);
    cg.strokeRect(4 + size * 0.07, 4 + size * 0.07, size * 0.86, size * 0.86);
    // chipped edges
    for (let i = 0; i < 26; i++) {
      const side = Math.floor(r() * 4), t = r();
      const px = side === 0 ? 4 + t * size : side === 1 ? 4 + size : side === 2 ? 4 + t * size : 4;
      const py = side === 0 ? 4 : side === 1 ? 4 + t * size : side === 2 ? 4 + size : 4 + t * size;
      cg.beginPath(); cg.arc(px, py, 0.8 + r() * size * 0.035, 0, Math.PI * 2); cg.fill();
    }
    cg.globalAlpha = 0.25; cg.drawImage(T.specks, -r() * 600, -r() * 600);
    g.drawImage(c, x - 4, y - 4);
  }

  window.UK = { W, H, rng, hash, vnoise, fbm, n1, canvas, T, init, texture, bokashi, poly, line, carve, sample, mist, revealMask, seal };
})();
