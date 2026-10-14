// editor.js — the workshop: scenes on the left, the print on the right, export at the top.
(function () {
  const $ = (id) => document.getElementById(id);
  const VIEW_ORDER = ["bay", "sakura", "rain", "asakusa"];
  const TITLES = {
    "bay:dawn": "湾の暁", "bay:day": "湾の昼", "bay:night": "湾の夜",
    "sakura:day": "目黒川の桜", "sakura:night": "夜桜",
    "rain:day": "渋谷の夕立", "rain:night": "渋谷の夜雨",
    "asakusa:day": "浅草の灯", "asakusa:night": "浅草の夜",
  };
  const DEFAULT = {
    series: "東京五景", endTitle: "東京", endLine: "Пять видов Токио", traveler: true,
    scenes: [
      { view: "bay", variant: "dawn", duration: 5, title: "湾の暁", subtitle: "Город просыпается раньше солнца." },
      { view: "sakura", variant: "day", duration: 7, title: "目黒川の桜", subtitle: "Весной он весь — лепестки над водой." },
      { view: "rain", variant: "day", duration: 7.5, title: "渋谷の夕立", subtitle: "Тысячи зонтов — и ни одного столкновения." },
      { view: "asakusa", variant: "day", duration: 5.8, title: "浅草の灯", subtitle: "Старое и новое стоят рядом." },
      { view: "bay", variant: "night", duration: 6, title: "湾の夜", subtitle: "А ночью город светится сам." },
    ],
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  let spec = clone(DEFAULT);
  try { const saved = localStorage.getItem("ukiyoe.spec"); if (saved) spec = sanitize(JSON.parse(saved)); } catch (e) { /* fresh start */ }

  function sanitize(s) {
    const out = { series: String(s.series ?? ""), endTitle: String(s.endTitle ?? ""), endLine: String(s.endLine ?? ""), traveler: s.traveler !== false, scenes: [] };
    for (const sc of Array.isArray(s.scenes) ? s.scenes : []) {
      const m = FILM.META[sc.view];
      if (!m) continue;
      const variant = m.variants[sc.variant] ? sc.variant : Object.keys(m.variants)[0];
      out.scenes.push({ view: sc.view, variant, duration: Math.min(30, Math.max(3, +sc.duration || 6)), title: String(sc.title ?? ""), subtitle: String(sc.subtitle ?? "") });
    }
    return out;
  }

  // ---------------- film + audio state ----------------
  const view = $("view");
  let film = null, audioBuf = null, audioFor = "", actx = null, src = null;
  let playing = false, t0 = 0, offset = 0, current = 0, rebuildTimer = 0;
  const busy = (msg) => { $("busy").hidden = !msg; $("busy").textContent = msg || ""; };
  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const key = () => JSON.stringify(spec);

  function persist() { try { localStorage.setItem("ukiyoe.spec", key()); } catch (e) { /* storage may be unavailable */ } }

  function rebuild(now) {
    clearTimeout(rebuildTimer);
    const run = () => {
      busy("Печатаем гравюры…");
      setTimeout(() => {
        film = FILM.create(spec);
        current = Math.min(current, film.duration);
        busy("");
        drawAt(current);
        $("total").textContent = `${fmt(film.duration)} всего`;
        persist();
      }, 20);
    };
    if (now) run(); else rebuildTimer = setTimeout(run, 350);
  }
  function drawAt(t) {
    if (!film) return;
    current = Math.max(0, Math.min(t, film.duration));
    film.draw(current, view, { blur: false });
    $("scrub").value = String(Math.round((current / film.duration) * 1000));
    $("time").textContent = `${fmt(current)} / ${fmt(film.duration)}`;
    const act = film.plan.holds.findIndex((h, i) => current <= h.end || i === film.plan.holds.length - 1);
    document.querySelectorAll(".scene").forEach((el, i) => el.classList.toggle("active", i === act));
  }

  async function ensureAudio() {
    if (audioBuf && audioFor === key()) return;
    busy("Сочиняем музыку…");
    await new Promise((r) => setTimeout(r, 20));
    audioBuf = await SCORE.render(film.plan, spec);
    audioFor = key();
    busy("");
  }
  async function play() {
    if (!film || !spec.scenes.length) return;
    await ensureAudio();
    actx = actx || new AudioContext({ sampleRate: SCORE.SR });
    if (current >= film.duration - 0.05) current = 0;
    src = actx.createBufferSource(); src.buffer = audioBuf; src.connect(actx.destination);
    offset = current; t0 = actx.currentTime + 0.05;
    src.start(t0, offset);
    playing = true; $("btnPlay").textContent = "❚❚"; $("btnPlay").setAttribute("aria-label", "Пауза");
    const loop = () => {
      if (!playing) return;
      const t = offset + Math.max(0, actx.currentTime - t0);
      if (t >= film.duration) { pause(); drawAt(film.duration); return; }
      drawAt(t);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
  function pause() {
    playing = false;
    if (src) { try { src.stop(); } catch (e) { /* already stopped */ } src = null; }
    $("btnPlay").textContent = "▶"; $("btnPlay").setAttribute("aria-label", "Смотреть");
  }

  // ---------------- the scene list ----------------
  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === "text") e.textContent = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const c of kids || []) e.append(c);
    return e;
  }
  function changed(structural) {
    pause();
    if (structural) renderScenes();
    rebuild();
  }
  function renderScenes() {
    const list = $("scenes");
    list.replaceChildren();
    spec.scenes.forEach((sc, i) => {
      const m = FILM.META[sc.view];
      const viewSel = el("select", { "aria-label": "Вид", onchange: (e) => { sc.view = e.target.value; sc.variant = Object.keys(FILM.META[sc.view].variants)[0]; sc.title = TITLES[sc.view + ":" + sc.variant] || sc.title; changed(true); } },
        VIEW_ORDER.map((v) => { const o = el("option", { value: v, text: FILM.META[v].name }); if (v === sc.view) o.selected = true; return o; }));
      const varSel = el("select", { "aria-label": "Время суток", onchange: (e) => { const old = TITLES[sc.view + ":" + sc.variant]; sc.variant = e.target.value; if (!sc.title || sc.title === old) sc.title = TITLES[sc.view + ":" + sc.variant] || sc.title; changed(true); } },
        Object.entries(m.variants).map(([v, name]) => { const o = el("option", { value: v, text: name }); if (v === sc.variant) o.selected = true; return o; }));
      const dur = el("input", { type: "number", min: "3", max: "30", step: "0.5", value: String(sc.duration), "aria-label": "Длительность, секунд",
        onchange: (e) => { sc.duration = Math.min(30, Math.max(3, +e.target.value || 6)); e.target.value = sc.duration; changed(false); } });
      const title = el("input", { value: sc.title, maxlength: "9", placeholder: "名所", oninput: (e) => { sc.title = e.target.value; changed(false); } });
      const sub = el("input", { value: sc.subtitle, maxlength: "90", placeholder: "Строка внизу кадра", oninput: (e) => { sc.subtitle = e.target.value; changed(false); } });
      const tools = el("span", { class: "tools" }, [
        el("button", { title: "Выше", "aria-label": "Переместить выше", text: "↑", onclick: () => { if (i > 0) { [spec.scenes[i - 1], spec.scenes[i]] = [spec.scenes[i], spec.scenes[i - 1]]; changed(true); } } }),
        el("button", { title: "Ниже", "aria-label": "Переместить ниже", text: "↓", onclick: () => { if (i < spec.scenes.length - 1) { [spec.scenes[i + 1], spec.scenes[i]] = [spec.scenes[i], spec.scenes[i + 1]]; changed(true); } } }),
        el("button", { title: "Удалить", "aria-label": "Удалить сцену", text: "✕", onclick: () => { spec.scenes.splice(i, 1); changed(true); } }),
      ]);
      const go = () => { pause(); if (film && film.plan.holds[i]) drawAt(film.plan.holds[i].live + 0.8); };
      list.append(el("li", { class: "scene" }, [
        el("header", {}, [el("strong", { text: m.name, onclick: go, style: "cursor:pointer", title: "Показать сцену" }), tools]),
        el("label", {}, ["Вид", viewSel]),
        el("label", {}, ["Время суток", varSel]),
        el("label", {}, ["Длительность, с", dur]),
        el("label", {}, ["Надпись на табличке", title]),
        el("label", { class: "wide" }, ["Субтитр", sub]),
      ]));
    });
    $("btnExport").disabled = !spec.scenes.length;
  }
  function renderFilmFields() {
    $("fSeries").value = spec.series; $("fEndTitle").value = spec.endTitle; $("fEndLine").value = spec.endLine; $("fTraveler").checked = spec.traveler;
  }

  // ---------------- wiring ----------------
  $("addView").append(...VIEW_ORDER.map((v) => el("option", { value: v, text: FILM.META[v].name })));
  $("btnAdd").onclick = () => {
    const v = $("addView").value, variant = Object.keys(FILM.META[v].variants)[0];
    spec.scenes.push({ view: v, variant, duration: 6, title: TITLES[v + ":" + variant] || "", subtitle: "" });
    changed(true);
  };
  $("fSeries").oninput = (e) => { spec.series = e.target.value; changed(false); };
  $("fEndTitle").oninput = (e) => { spec.endTitle = e.target.value; changed(false); };
  $("fEndLine").oninput = (e) => { spec.endLine = e.target.value; changed(false); };
  $("fTraveler").onchange = (e) => { spec.traveler = e.target.checked; changed(false); };
  $("btnPlay").onclick = () => (playing ? pause() : play());
  $("scrub").oninput = (e) => { pause(); if (film) drawAt((+e.target.value / 1000) * film.duration); };
  document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); playing ? pause() : play(); } });

  $("btnNew").onclick = () => { if (confirm("Начать новый проект? Несохранённые изменения пропадут.")) { spec = clone(DEFAULT); renderFilmFields(); changed(true); } };
  $("btnSave").onclick = async () => { pause(); await window.studio.saveProject(JSON.stringify({ app: "ukiyoe-studio", version: 1, spec }, null, 2), (spec.endLine || "фильм") + ".ukiyoe"); };
  $("btnOpen").onclick = async () => {
    pause();
    const r = await window.studio.openProject();
    if (!r) return;
    try { const j = JSON.parse(r.text); spec = sanitize(j.spec || j); renderFilmFields(); changed(true); }
    catch (e) { alert("Не удалось прочитать проект: " + e.message); }
  };

  // ---------------- export ----------------
  let exporting = false, cancelFlag = false;
  $("btnExport").onclick = () => { pause(); $("exportResult").textContent = ""; $("exportProgress").hidden = true; $("btnExportGo").disabled = false; $("exportDlg").showModal(); };
  $("btnExportCancel").onclick = (e) => { if (exporting) { e.preventDefault(); cancelFlag = true; } };
  $("exportDlg").addEventListener("cancel", (e) => { if (exporting) { e.preventDefault(); cancelFlag = true; } });
  async function runExport(size, filePath) {
    exporting = true; cancelFlag = false;
    $("btnExportGo").disabled = true; $("exportProgress").hidden = false; $("sizeSet").disabled = true;
    $("btnExportCancel").textContent = "Отменить";
    try {
      const r = await EXPORTER.exportMp4(spec, size, (stage, f) => { $("exportStage").textContent = stage; $("exportBar").value = f; }, () => cancelFlag);
      $("exportStage").textContent = "Записываем файл…";
      await window.studio.writeVideo(filePath, r.buffer);
      $("exportResult").textContent = `Готово: ${filePath} (звук: ${r.audioCodec === "aac" ? "AAC" : r.audioCodec === "opus" ? "Opus" : "нет"})`;
      return true;
    } catch (e) {
      $("exportResult").textContent = e.message === "cancelled" ? "Экспорт отменён." : "Ошибка: " + e.message;
      return false;
    } finally {
      exporting = false; $("sizeSet").disabled = false; $("btnExportCancel").textContent = "Закрыть"; $("btnExportGo").disabled = false;
    }
  }
  $("btnExportGo").onclick = async () => {
    const size = document.querySelector('input[name="size"]:checked').value;
    const filePath = await window.studio.chooseVideo((spec.endLine || "фильм") + ".mp4");
    if (filePath) await runExport(size, filePath);
  };

  // ---------------- start ----------------
  const faces = [['40px "Shippori Mincho"', "東京"], ['40px "Shippori Mincho B"', "東京雷門雨"], ['40px "Yuji Syuku"', "東京湾の暁"], ['40px "PT Serif"', "Токио"], ['italic 40px "PT Serif"', "Токио"]];
  Promise.all(faces.map(([f, s]) => document.fonts.load(f, s))).then(() => document.fonts.ready).then(async () => {
    renderFilmFields(); renderScenes();
    film = FILM.create(spec); // first look: the opening print, already pulled
    if (film.plan.holds[0]) current = film.plan.holds[0].cart + 1.2;
    rebuild(true);
    const out = await window.studio.selftest();
    if (out) { // automated check: export the default film at 720p, then quit
      spec = clone(DEFAULT); renderFilmFields(); renderScenes();
      film = FILM.create(spec);
      const t = performance.now();
      const ok = await runExport("720", out);
      console.log("SELFTEST", ok ? "OK" : "FAIL", $("exportResult").textContent, Math.round((performance.now() - t) / 1000) + "s");
      window.studio.quit();
    }
  });
})();
