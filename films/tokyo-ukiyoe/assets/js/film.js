// film.js — one continuous handscroll over five prints. Every frame is a pure function of t.
(function () {
  const { W, H, hash, canvas, T, revealMask } = UK;
  const FPS = 24, DUR = 50, STEP = 2220;
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

  // ---------------- schedule ----------------
  const SEG = [
    { t0: 0, t1: 9.0, hold: 0 },
    { t0: 9.0, t1: 11.4, from: 0, to: 1, ease: "sine", dip: 0.16 },
    { t0: 11.4, t1: 18.6, hold: 1 },
    { t0: 18.6, t1: 20.4, from: 1, to: 2, ease: "cubic", dip: 0.1 },
    { t0: 20.4, t1: 28.2, hold: 2 },
    { t0: 28.2, t1: 31.0, from: 2, to: 3, ease: "sine", dip: 0.18 },
    { t0: 31.0, t1: 36.8, hold: 3 },
    { t0: 36.8, t1: 39.0, from: 3, to: 4, ease: "sine", dip: 0.14 },
    { t0: 39.0, t1: DUR + 1, hold: 4 },
  ];
  const PRINT = {
    0: [["g0", 2.3], ["g1", 2.7], ["g2", 3.1], ["g3", 3.5]],
    4: [["g1", 39.15], ["g2", 39.5], ["g3", 39.85]],
  };
  const PRINT_DUR = 0.34;
  const REG = { g0: [0, 0], g1: [2.2, -1.3], g2: [-1.8, 1.9], g3: [1.5, 2.2] };
  const SLIDE_IN = { g0: [-6, 0], g1: [5, -3], g2: [-4, 5], g3: [4, 4] };
  const CART = [
    { at: 4.2, x: 1716, y: 66, series: "東京五景", title: "湾の暁" },
    { at: 12.0, x: 92, y: 66, series: "東京五景", title: "目黒川の桜" },
    { at: 21.0, x: 1716, y: 60, series: "東京五景", title: "渋谷の夕立" },
    { at: 31.6, x: 590, y: 66, series: "東京五景", title: "浅草の灯" },
    { at: 40.5, x: 1716, y: 66, series: "東京五景", title: "湾の夜" },
  ];
  const SUBS = [
    [4.8, 8.6, "Город просыпается раньше солнца."],
    [12.6, 17.8, "Весной он весь — лепестки над водой."],
    [21.6, 27.4, "Тысячи зонтов — и ни одного столкновения."],
    [32.2, 36.2, "Старое и новое стоят рядом."],
    [41.0, 45.6, "А ночью город светится сам."],
  ];
  const WASH = [46.0, 47.4];
  const END = 47.3;
  const GROUND = [872, 872, 884, 884, 872];

  // Clawd's path: [t0, t1, sheet0, x0, sheet1, x1, mode, face, umbrella]
  const CL = [
    [4.2, 7.6, 0, 1990, 0, 1350, "walk", -1, 0],
    [7.6, 9.0, 0, 1350, 0, 1350, "idle", -1, 0],
    [9.0, 11.4, 0, 1350, 1, 1500, "run", -1, 0, "sine"],
    [11.4, 16.0, 1, 1500, 1, 1000, "walk", -1, 0],
    [16.0, 18.6, 1, 1000, 1, 1000, "look", -1, 0],
    [18.6, 20.4, 1, 1000, 2, 1450, "run", -1, 0, "cubic"],
    [20.4, 26.4, 2, 1450, 2, 900, "walk", -1, 1],
    [26.4, 28.2, 2, 900, 2, 900, "idle", -1, 1],
    [28.2, 31.0, 2, 900, 3, 1460, "run", -1, 0, "sine"],
    [31.0, 33.6, 3, 1460, 3, 1130, "walk", -1, 0],
    [33.6, 36.8, 3, 1130, 3, 1130, "look", 1, 0],
    [36.8, 39.0, 3, 1130, 4, 1150, "run", -1, 0, "sine"],
    [39.0, 47.8, 4, 1150, 4, 1150, "idle", -1, 0],
    [47.8, DUR + 1, 4, 1150, 4, 1150, "bow", -1, 0],
  ];

  // ---------------- camera ----------------
  function camHold(i, t) {
    let cx = sheetLeft(i) + 960, cy = 540, z = 1;
    if (i === 0) z = lerp(0.88, 1, EASE.sine(t / 2.4));
    if (i === 3) { const u = EASE.sine((t - 31.6) / 5.0); z = 1 + 0.05 * u; cx += 40 * u; cy -= 22 * u; }
    if (i === 4) { const u = EASE.sine((t - 46.6) / 3.4); z = 1 - 0.06 * u; }
    return { cx, cy, z };
  }
  function camera(t) {
    const s = SEG.find((q) => t >= q.t0 && t < q.t1) || SEG[SEG.length - 1];
    if (s.hold != null) return camHold(s.hold, t);
    const u = (t - s.t0) / (s.t1 - s.t0), e = EASE[s.ease](u);
    const a = camHold(s.from, s.t0), b = camHold(s.to, s.t1);
    return { cx: lerp(a.cx, b.cx, e), cy: lerp(a.cy, b.cy, e), z: lerp(a.z, b.z, e) * (1 - s.dip * Math.sin(Math.PI * u)) };
  }

  // ---------------- build ----------------
  let S = [], mount, scratch, accum, tmp, sprite, cartC = [], sealC = [], subSeal, endSlip, endSeal;
  function compose(b) {
    const c = canvas(), g = c.getContext("2d");
    g.drawImage(T.paper, 0, 0);
    for (const k of ["g1", "g2", "g3", "g0"]) g.drawImage(b[k], REG[k][0], REG[k][1]);
    g.globalAlpha = 0.35; g.drawImage(T.fibres, 0, 0); g.globalAlpha = 1;
    border(g);
    return c;
  }
  function border(g) {
    g.strokeStyle = VIEWS.P.sumi;
    g.lineWidth = 3.4; g.strokeRect(VIEWS.X0, VIEWS.Y0, VIEWS.X1 - VIEWS.X0, VIEWS.Y1 - VIEWS.Y0);
    g.lineWidth = 1.2; g.strokeRect(VIEWS.X0 - 9, VIEWS.Y0 - 9, VIEWS.X1 - VIEWS.X0 + 18, VIEWS.Y1 - VIEWS.Y0 + 18);
  }
  function build() {
    UK.init();
    const v = VIEWS;
    const bays = v.bay(false);
    S = [bays, v.sakura(), v.rain(), v.asakusa(), v.bay(true)];
    S.forEach((b) => (b.comp = compose(b)));
    // the bare sheet: paper + border + fibres
    const bare = canvas(), bg = bare.getContext("2d");
    bg.drawImage(T.paper, 0, 0); bg.globalAlpha = 0.35; bg.drawImage(T.fibres, 0, 0); bg.globalAlpha = 1; border(bg);
    S.bare = bare;
    // mount paper of the scroll
    mount = canvas(); const mg = mount.getContext("2d");
    mg.fillStyle = "#c2ad86"; mg.fillRect(0, 0, W, H);
    mg.globalAlpha = 0.1; mg.drawImage(T.wood, 0, 0, W, H);
    mg.globalAlpha = 0.6; mg.drawImage(T.fibres, 0, 0); mg.globalAlpha = 1;
    scratch = canvas(); accum = canvas(); tmp = canvas(); sprite = canvas(360, 300);
    CART.forEach((c, i) => { cartC.push(v.cartouche(c.series, c.title)); sealC.push(v.sealCanvas("東京", 46, 30 + i)); });
    subSeal = v.sealCanvas("景", 30, 77);
    endSlip = v.cartouche("東京五景", "東京");
    endSeal = v.sealCanvas("東京", 96, 88);
  }

  // ---------------- Clawd ----------------
  function clawdState(t) {
    const c = CL.find((q) => t >= q[0] && t < q[1]);
    if (!c) return null;
    const [t0, t1, s0, x0, s1, x1, mode, face, umb, ease] = c;
    const u = (t - t0) / (t1 - t0), e = ease ? EASE[ease](u) : u;
    const wx = lerp(sheetLeft(s0) + x0, sheetLeft(s1) + x1, e);
    const fy = lerp(GROUND[s0], GROUND[s1], e);
    return { wx, fy, mode, face, umb, t, t0 };
  }
  function drawClawd(g, st) {
    const s = 1.15, sg = sprite.getContext("2d");
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, sprite.width, sprite.height);
    const ox = 180, oy = 280; // feet anchor in sprite
    const { mode, face, t } = st;
    const fps = mode === "run" ? 12 : 8, ph = Math.floor(t * fps + 1e-6) % 2;
    const moving = mode === "walk" || mode === "run";
    const bob = moving ? ph * (mode === "run" ? 3 : 2) : 0;
    let tilt = 0;
    if (mode === "bow") tilt = 0.32 * Math.sin(Math.PI * clamp((t - st.t0) / 1.3, 0, 1));
    sg.translate(ox, oy);
    sg.scale(face, 1);
    sg.rotate(-tilt);
    const bw = 78 * s, bh = 50 * s, legH = 14 * s;
    const top = -legH - bh - bob;
    const fill = "#d4734f", key = VIEWS.P.sumi;
    const legs = [-30, -12, 12, 30];
    function shape(dx, dy, colour) {
      sg.fillStyle = colour;
      legs.forEach((lx, i) => {
        const lift = moving && (i % 2 === ph) ? (mode === "run" ? 7 : 5) : 0;
        sg.fillRect(lx * s - 4.5 * s + dx, -legH - bob + dy, 9 * s, legH - lift + bob);
      });
      sg.beginPath(); sg.roundRect(-bw / 2 + dx, top + dy, bw, bh, 5); sg.fill();
      sg.fillRect(-bw / 2 - 8 * s + dx, top + bh * 0.42 + dy, 9 * s, 12 * s);
      sg.fillRect(bw / 2 - 1 * s + dx, top + bh * 0.42 + dy, 9 * s, 12 * s);
    }
    // colour block, slightly out of register, then the key line
    shape(1.5, 2, fill);
    sg.strokeStyle = key; sg.lineWidth = 2.6; sg.lineJoin = "round";
    legs.forEach((lx, i) => {
      const lift = moving && (i % 2 === ph) ? (mode === "run" ? 7 : 5) : 0;
      sg.strokeRect(lx * s - 4.5 * s, -legH - bob, 9 * s, legH - lift + bob);
    });
    sg.strokeRect(-bw / 2 - 8 * s, top + bh * 0.42, 9 * s, 12 * s);
    sg.strokeRect(bw / 2 - 1 * s, top + bh * 0.42, 9 * s, 12 * s);
    sg.beginPath(); sg.roundRect(-bw / 2, top, bw, bh, 5); sg.fillStyle = fill; sg.fill(); sg.stroke();
    // eyes
    const look = mode === "look" ? -5 : 0;
    const blink = (mode === "idle" || mode === "look") && ((t * 1000) % 2700) < 130;
    sg.fillStyle = key;
    for (const ex of [-12, 12]) {
      const x = (ex + 7) * s, y = top + 13 * s + look;
      if (blink) sg.fillRect(x - 3.5 * s, y + 6 * s, 7 * s, 2.2); else sg.fillRect(x - 3.5 * s, y, 7 * s, 14 * s);
    }
    if (st.umb) {
      const uy = top - 54, ux = 4;
      sg.save(); sg.rotate(-0.08);
      sg.fillStyle = VIEWS.P.indigo;
      sg.beginPath(); sg.ellipse(ux, uy, 74, 34, 0, Math.PI, 0); sg.closePath(); sg.fill();
      sg.strokeStyle = "#eee2c6"; sg.lineWidth = 7;
      sg.beginPath(); sg.ellipse(ux, uy, 50, 23, 0, Math.PI + 0.12, -0.12); sg.stroke();
      sg.strokeStyle = key; sg.lineWidth = 2.2;
      sg.beginPath(); sg.ellipse(ux, uy, 74, 34, 0, Math.PI, 0); sg.closePath(); sg.stroke();
      for (let k = -3; k <= 3; k++) { sg.beginPath(); sg.moveTo(ux, uy - 34); sg.lineTo(ux + k * 24, uy); sg.stroke(); }
      sg.lineWidth = 2.4; sg.beginPath(); sg.moveTo(ux, uy); sg.lineTo(ux - 2, top + bh * 0.45); sg.stroke();
      sg.restore();
    }
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = "destination-out"; sg.globalAlpha = 0.28;
    sg.drawImage(T.specks, -((st.wx | 0) % 400 + 400) % 400, 0);
    sg.globalCompositeOperation = "source-over"; sg.globalAlpha = 1;
    g.drawImage(sprite, st.wx - ox, st.fy - oy);
  }

  // ---------------- dynamic layers (sheet coordinates) ----------------
  const SUMI = "#231f1c";
  function bird(g, x, y, s, ph) {
    const a = ph ? 12 : -6;
    g.strokeStyle = SUMI; g.lineWidth = 2.4; g.lineCap = "round";
    g.beginPath(); g.moveTo(x - 16 * s, y + a * s * 0.6); g.quadraticCurveTo(x - 7 * s, y - a * 0.4 * s, x, y);
    g.quadraticCurveTo(x + 7 * s, y - a * 0.4 * s, x + 16 * s, y + a * s * 0.6); g.stroke();
  }
  function dynBay(g, t, night) {
    if (!night) {
      const tq = step(t, 8);
      for (let k = 0; k < 3; k++) {
        const x = 1700 - (tq - 3.4) * 120 + k * 80, y = 220 + k * 28 + Math.sin(tq * 2 + k) * 8;
        if (x > 40 && x < 1880) bird(g, x, y, 0.9 - k * 0.12, (Math.floor(tq * 8) + k) % 2);
      }
      return;
    }
    // night: lamp and tower reflections shimmer on the water, stepped at 8 fps
    const f = Math.floor(t * 8 + 1e-6);
    g.fillStyle = "#cf9f4a";
    for (let i = 0; i < 22; i++) {
      const y = 616 + i * 10, w = 26 - i * 0.7;
      g.globalAlpha = 0.85 - i * 0.03;
      g.fillRect(1480 - w / 2 + (hash(f, i, 3) - 0.5) * 18, y, w, 3);
    }
    g.fillStyle = "#b8412f";
    for (let i = 0; i < 10; i++) { g.globalAlpha = 0.7 - i * 0.06; g.fillRect(1470 + (hash(f, i, 5) - 0.5) * 16, 620 + i * 14, 14, 3); }
    for (let k = 0; k < 18; k++) {
      const x = 100 + hash(k, 1, 9) * 1700;
      if (Math.abs(x - 1480) < 60) continue;
      for (let i = 0; i < 4; i++) { g.globalAlpha = 0.55 - i * 0.12; g.fillStyle = "#cf9f4a"; g.fillRect(x + (hash(f, k * 7 + i, 4) - 0.5) * 8, 612 + i * 9, 10 - i * 2, 2.5); }
    }
    g.globalAlpha = 1;
    // fireworks: printed lines, not particles
    for (const [t0, x, y, R, colA, colB] of [[42.2, 760, 250, 200, "#cf9f4a", "#b8412f"], [43.7, 1040, 320, 130, "#e3a08a", "#cf9f4a"]]) {
      const u = step(t, 12) - t0;
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
      // its light on the water
      g.globalAlpha = fade * 0.5; g.fillStyle = colA;
      for (let i = 0; i < 8; i++) g.fillRect(x - 30 + (hash(Math.floor(t * 12), i, 2) - 0.5) * 40, 640 + i * 18, 60 - i * 5, 3);
      g.globalAlpha = 1;
    }
  }
  function dynSakura(g, t) {
    const tq = step(t, 8);
    for (let i = 0; i < 26; i++) {
      const sp = 38 + hash(i, 2, 1) * 40, per = 760 / sp;
      const ph = (tq / per + hash(i, 3, 1)) % 1;
      const x = 1000 + hash(i, 4, 1) * 860 - ph * 420 + Math.sin(tq * 1.6 + i) * 22;
      const y = 140 + ph * 760;
      if (y > 838 && y < 882) continue;
      g.save(); g.translate(x, y); g.rotate(tq * 2 + i);
      g.fillStyle = "#f0c9bf"; g.beginPath(); g.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(35,31,28,0.6)"; g.lineWidth = 1; g.stroke();
      g.restore();
    }
    for (let i = 0; i < 16; i++) {
      const x = ((hash(i, 6, 1) * 1900 - tq * (14 + hash(i, 7, 1) * 10)) % 1900 + 1900) % 1900;
      const y = 650 + hash(i, 8, 1) * 160;
      g.fillStyle = "#f0c9bf"; g.beginPath(); g.ellipse(x, y, 6, 2.5, 0, 0, Math.PI * 2); g.fill();
    }
  }
  function dynRain(g, t) {
    // walkers under umbrellas, stepped at 8 fps
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
    // two sets of rain at slightly different angles, 12 fps
    const tr = step(t, 12);
    g.lineCap = "butt";
    for (const [n, ang, len, sp, alpha, seed, w] of [[300, 0.2, 60, 1100, 0.42, 1, 1.3], [180, 0.29, 40, 800, 0.28, 2, 1]]) {
      g.strokeStyle = `rgba(48,52,60,${alpha})`; g.lineWidth = w;
      g.beginPath();
      for (let i = 0; i < n; i++) {
        const l = len * (0.7 + hash(i, seed, 9) * 0.6);
        const y = ((hash(i, seed, 7) * 1200 + tr * sp) % 1200) - 80;
        const x = hash(i, seed, 8) * 2100 - y * Math.tan(ang);
        g.moveTo(x, y); g.lineTo(x - Math.sin(ang) * l, y + Math.cos(ang) * l);
      }
      g.stroke();
    }
    // splashes on the road
    const f = Math.floor(t * 12 + 1e-6);
    g.strokeStyle = "rgba(35,31,28,0.45)"; g.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
      const x = hash(f, i, 11) * 1880, y = 650 + hash(f, i, 12) * 380;
      g.beginPath(); g.ellipse(x, y, 7, 2, 0, Math.PI, 0); g.stroke();
    }
  }
  function dynAsakusa(g, t) {
    const tq = step(t, 8);
    g.lineCap = "round";
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(109,106,100,${0.55 - k * 0.12})`; g.lineWidth = 3.2 - k * 0.6;
      g.beginPath();
      for (let i = 0; i <= 30; i++) {
        const y = 646 - i * 10, rise = (646 - y) / 300;
        const x = 820 + (k - 1) * 14 + Math.sin(y * 0.022 - tq * 1.7 + k * 2) * 26 * rise;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const x = 200 + (tq - 30.6) * (90 + k * 30) + k * 60, y = 200 + k * 40 + Math.sin(tq * 3 + k) * 6;
      if (x > 40 && x < 1150) bird(g, x, y, 0.8, (Math.floor(tq * 8) + k) % 2);
    }
  }
  const DYN = [(g, t) => dynBay(g, t, false), dynSakura, dynRain, dynAsakusa, (g, t) => dynBay(g, t, true)];

  // ---------------- per-sheet drawing ----------------
  function drawBlock(g, block, key, p) {
    const m = revealMask(p);
    const tg = tmp.getContext("2d");
    tg.globalCompositeOperation = "copy"; tg.drawImage(block, 0, 0);
    tg.globalCompositeOperation = "destination-in"; tg.drawImage(m, 0, 0, W, H);
    tg.globalCompositeOperation = "source-over";
    const k = 1 - sm(p), [sx, sy] = SLIDE_IN[key], [rx, ry] = REG[key];
    g.drawImage(tmp, rx + sx * k, ry + sy * k);
  }
  function drawSheet(g, i, t) {
    const b = S[i], pr = PRINT[i];
    if (pr && t < pr[pr.length - 1][1] + PRINT_DUR) {
      g.drawImage(T.paper, 0, 0);
      const order = ["g1", "g2", "g3", "g0"];
      for (const k of order) {
        const e = pr.find((q) => q[0] === k);
        if (!e) { g.drawImage(b[k], REG[k][0], REG[k][1]); continue; } // already printed (night key)
        const p = (t - e[1]) / PRINT_DUR;
        if (p <= 0) continue;
        if (p >= 1) g.drawImage(b[k], REG[k][0], REG[k][1]); else drawBlock(g, b[k], k, p);
      }
      g.globalAlpha = 0.35; g.drawImage(T.fibres, 0, 0); g.globalAlpha = 1;
      border(g);
    } else g.drawImage(b.comp, 0, 0);
    // night sheet before printing begins shows its key only (the alternate impression)
    g.save(); g.beginPath(); g.rect(VIEWS.X0 + 2, VIEWS.Y0 + 2, VIEWS.X1 - VIEWS.X0 - 4, VIEWS.Y1 - VIEWS.Y0 - 4); g.clip();
    const printed = !pr || t > pr[pr.length - 1][1] + PRINT_DUR * 0.5;
    if (printed) DYN[i](g, t);
    // cartouche + seal
    const c = CART[i];
    if (t >= c.at) {
      const u = clamp((t - c.at) / 0.35, 0, 1);
      g.globalAlpha = sm(u); g.drawImage(cartC[i], c.x - 6, c.y - 6 - (1 - sm(u)) * 16); g.globalAlpha = 1;
      const su = (t - c.at - 0.35) / 0.2;
      if (su > 0) {
        const sc = lerp(1.35, 1, sm(su)), sc0 = sealC[i], cx = c.x - 34, cy = c.y + cartC[i].height - 60;
        g.save(); g.globalAlpha = clamp(su * 3, 0, 1); g.translate(cx, cy); g.scale(sc, sc); g.drawImage(sc0, -sc0.width / 2, -sc0.height / 2); g.restore();
      }
    }
    g.restore();
    // wash back to paper at the end
    if (i === 4 && t > WASH[0]) {
      const p = clamp((t - WASH[0]) / (WASH[1] - WASH[0]), 0, 1);
      const tg = tmp.getContext("2d");
      tg.globalCompositeOperation = "copy"; tg.drawImage(S.bare, 0, 0);
      if (p < 1) { tg.globalCompositeOperation = "destination-in"; tg.drawImage(revealMask(p, 0.08), 0, 0, W, H); }
      tg.globalCompositeOperation = "source-over";
      g.drawImage(tmp, 0, 0);
    }
  }

  // ---------------- screen-space type ----------------
  function subtitle(g, t) {
    const s = SUBS.find((q) => t >= q[0] - 0.01 && t < q[1]);
    if (!s) return;
    const a = Math.min(sm((t - s[0]) / 0.35), sm((s[1] - t) / 0.45));
    g.save();
    g.font = '34px "PT Serif"';
    const tw = g.measureText(s[2]).width, w = tw + 150, h = 76, x = 960 - w / 2, y = H - 128 + (1 - a) * 10;
    g.globalAlpha = a;
    g.fillStyle = "#f3e7c6"; g.fillRect(x, y, w, h);
    g.strokeStyle = SUMI; g.lineWidth = 3; g.strokeRect(x, y, w, h);
    g.lineWidth = 1.1; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.drawImage(subSeal, x + 18, y + (h - subSeal.height) / 2);
    g.fillStyle = SUMI; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(s[2], x + 78, y + h / 2 + 1);
    g.restore();
  }
  function endCard(g, t) {
    if (t < END) return;
    const u = sm((t - END) / 0.5), sc = 1.8;
    const w = endSlip.width * sc, h = endSlip.height * sc, x = 960 - w / 2, y = 250 - (1 - u) * 24;
    g.save(); g.globalAlpha = u; g.drawImage(endSlip, x, y, w, h); g.restore();
    const su = (t - END - 0.6) / 0.22;
    if (su > 0) {
      const k = lerp(1.4, 1, sm(su));
      g.save(); g.globalAlpha = clamp(su * 3, 0, 1); g.translate(x - 80, y + h - 70); g.scale(k, k);
      g.drawImage(endSeal, -endSeal.width / 2, -endSeal.height / 2); g.restore();
    }
    const tu = sm((t - END - 1.0) / 0.6);
    if (tu > 0) {
      g.save(); g.globalAlpha = tu; g.fillStyle = SUMI; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = 'italic 44px "PT Serif"'; g.fillText("Пять видов Токио", 960, y + h + 50);
      g.restore();
    }
  }

  // ---------------- the frame ----------------
  function scene(g, t) {
    const cam = camera(t);
    const ox = 960 - cam.cx * cam.z, oy = 540 - cam.cy * cam.z;
    // mount, scrolling with the world
    g.setTransform(1, 0, 0, 1, 0, 0);
    const tw = W * cam.z, th = H * cam.z;
    const sx = ((ox % tw) + tw) % tw - tw, sy = ((oy % th) + th) % th - th;
    for (let yy = sy; yy < H; yy += th) for (let xx = sx; xx < W; xx += tw) g.drawImage(mount, xx, yy, tw + 1, th + 1);
    g.setTransform(cam.z, 0, 0, cam.z, ox, oy);
    for (let i = 0; i < S.length; i++) {
      const L = sheetLeft(i);
      const left = (L - cam.cx) * cam.z + 960, right = left + W * cam.z;
      if (right < -20 || left > W + 20) continue;
      g.fillStyle = "rgba(70,48,24,0.25)"; g.fillRect(L + 7, 9, W, H);
      g.save(); g.translate(L, 0);
      if (i === 0 && t < PRINT[0][0][1] + 0.0001) {
        g.drawImage(S.bare, 0, 0);
      } else drawSheet(g, i, t);
      g.restore();
    }
    // Clawd crosses borders freely: he is the one thing carried through every cut that never happens
    const cs = clawdState(t);
    if (cs) drawClawd(g, cs);
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (t >= END) { g.save(); g.setTransform(cam.z, 0, 0, cam.z, ox, oy); g.translate(sheetLeft(4), 0); endCard(g, t); g.restore(); }
    subtitle(g, t);
  }

  function draw(t, out) {
    const g = out.getContext("2d");
    // shutter: fast camera moves get a 180° motion blur so they don't strobe
    const dt = 1 / FPS, a = camera(t), b = camera(Math.min(DUR, t + dt));
    const speed = Math.abs(b.cx - a.cx) * a.z;
    if (speed < 36) { scene(g, t); return; }
    const n = speed > 70 ? 6 : 4, ag = accum.getContext("2d"), sg = scratch.getContext("2d");
    for (let k = 0; k < n; k++) {
      const tk = t + (k / (n - 1) - 0.5) * 0.5 * dt;
      scene(sg, tk);
      ag.globalAlpha = 1 / (k + 1);
      ag.drawImage(scratch, 0, 0);
    }
    ag.globalAlpha = 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(accum, 0, 0);
  }

  window.FILM = { build, draw, DUR, FPS };
})();
