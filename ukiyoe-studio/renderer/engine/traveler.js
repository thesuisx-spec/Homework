// traveler.js — a small Edo traveller in the print's own language:
// low straw kasa, tucked-up indigo kimono, ochre obi, dark gaiters, staff, bundle on the back.
// Side view, drawn facing right; the caller mirrors it. Figures step at 8 fps, running at 12.
(function () {
  const SUMI = "#231f1c", PAPER = "#eee2c6";
  const C = { kimono: "#2c4a70", obi: "#cf9f4a", gaiter: "#1d2c44", hat: "#c9a45c", bundle: "#8aa152", staff: "#5a4434", umb: "#b8412f" };

  function limb(g, pts, w, col) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.lineWidth = w; g.strokeStyle = col; g.lineCap = "round"; g.lineJoin = "round"; g.stroke();
  }
  function shape(g, pts, fill) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
  }

  // pose: { mode: walk|run|idle|look|bow, phase: 0|1, umbrella: bool, tilt: radians }
  function draw(g, pose) {
    const run = pose.mode === "run", moving = run || pose.mode === "walk", ph = pose.phase;
    const lean = run ? 0.16 : pose.mode === "walk" ? 0.05 : 0;
    const bob = moving && ph ? -3 : 0;
    g.save();
    g.rotate(lean + (pose.tilt || 0));
    g.translate(0, bob);

    // legs: front and back, gaiters below the hem
    let back, front;
    if (!moving) { back = [[-3, -46], [-5, -22], [-6, 0]]; front = [[4, -46], [6, -22], [7, 0]]; }
    else if (ph === 0) { const s = run ? 26 : 16; back = [[-2, -46], [-s * 0.6, -22], [-s, -2]]; front = [[3, -46], [s * 0.7, -24], [s, 0]]; }
    else { const s = run ? 10 : 4; back = [[-2, -46], [-8, -26], [-s - 12, -12]]; front = [[3, -46], [5, -22], [s, 0]]; }
    for (const [leg, col] of [[back, C.gaiter], [front, C.gaiter]]) {
      limb(g, leg, 8.5, SUMI); limb(g, leg, 6, col);
      const f = leg[2];
      limb(g, [[f[0] - 3, f[1] + 1], [f[0] + 8, f[1] + 1]], 3.2, SUMI); // straw sandal
    }

    // bundle (furoshiki) on the back, knotted at the chest
    shape(g, [[-10, -92], [-27, -88], [-30, -70], [-12, -64]], C.bundle);
    g.lineWidth = 2; g.strokeStyle = SUMI; g.stroke();
    limb(g, [[-12, -90], [8, -80]], 1.8, SUMI);

    // kimono, tucked up: the back corner rides into the obi
    const body = [[-8, -96], [10, -96], [15, -64], [17, -44], [6, -40], [-4, -50], [-15, -44], [-12, -66]];
    shape(g, body, C.kimono);
    g.lineWidth = 2.4; g.strokeStyle = SUMI; g.lineJoin = "round"; g.stroke();
    // obi band
    shape(g, [[-12, -68], [15, -68], [15, -61], [-12, -61]], C.obi);
    g.lineWidth = 1.4; g.stroke();
    // collar
    limb(g, [[-2, -96], [6, -84], [12, -95]], 1.8, SUMI);

    // arm and staff, or the umbrella
    if (pose.umbrella) {
      limb(g, [[8, -88], [16, -76], [12, -98]], 6, SUMI); limb(g, [[8, -88], [16, -76], [12, -98]], 3.6, C.kimono);
      limb(g, [[12, -98], [8, -150]], 2.4, C.staff);
      g.save(); g.translate(8, -150); g.rotate(-0.08);
      g.beginPath(); g.ellipse(0, 0, 62, 26, 0, Math.PI, 0); g.closePath(); g.fillStyle = C.umb; g.fill();
      g.strokeStyle = PAPER; g.lineWidth = 6; g.beginPath(); g.ellipse(0, 0, 42, 17, 0, Math.PI + 0.15, -0.15); g.stroke();
      g.strokeStyle = SUMI; g.lineWidth = 2.2; g.beginPath(); g.ellipse(0, 0, 62, 26, 0, Math.PI, 0); g.closePath(); g.stroke();
      for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(0, -26); g.lineTo(k * 20, 0); g.lineWidth = 1.2; g.stroke(); }
      g.restore();
    } else {
      const swing = moving ? (ph ? 4 : -4) : 0;
      const hand = [20 + swing, -66];
      limb(g, [[8, -90], [14, -76], hand], 6, SUMI); limb(g, [[8, -90], [14, -76], hand], 3.6, C.kimono);
      limb(g, [[hand[0] + 2, -112], [hand[0] + 8 + swing * 0.5, 0]], 3, SUMI);
      limb(g, [[hand[0] + 2, -112], [hand[0] + 8 + swing * 0.5, 0]], 1.6, C.staff);
    }

    // head: paper is the skin; the kasa hides the upper face
    const look = pose.mode === "look" ? -0.32 : 0;
    g.save(); g.translate(4, -104); g.rotate(look);
    g.beginPath(); g.arc(0, 0, 8.5, 0, Math.PI * 2); g.fillStyle = PAPER; g.fill();
    g.lineWidth = 2; g.strokeStyle = SUMI; g.stroke();
    limb(g, [[4, 2], [7, 3]], 1.4, SUMI); // the one-stroke eye
    if (!pose.umbrella) {
      shape(g, [[-27, -1], [31, -1], [3, -20]], C.hat);
      g.lineWidth = 2.4; g.strokeStyle = SUMI; g.stroke();
      g.lineWidth = 1;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(3, -20); g.lineTo(3 + k * 12, -1); g.stroke(); }
    } else {
      // shaved pate and a folded topknot
      g.beginPath(); g.arc(-1, -4, 6.5, Math.PI, 0); g.fillStyle = "#b8c4c8"; g.fill();
      limb(g, [[-4, -9], [-10, -13], [-4, -14]], 3, SUMI);
    }
    g.restore();
    g.restore();
  }

  window.TRAVELER = { draw, H: 120 };
})();
