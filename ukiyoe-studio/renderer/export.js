// export.js — the film to MP4, entirely inside the app: WebCodecs H.264 + AAC (or Opus), muxed by mp4-muxer.
(function () {
  const SIZES = { "1080": [1920, 1080, 10e6], "720": [1280, 720, 5.5e6] };

  async function pickAudio() {
    for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) {
      try {
        const r = await AudioEncoder.isConfigSupported({ codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
        if (r.supported) return { codec, mux };
      } catch (e) { /* try the next one */ }
    }
    return null;
  }
  async function pickVideo(w, h, bitrate) {
    for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42002a"]) {
      try {
        const cfg = { codec, width: w, height: h, bitrate, framerate: 24, latencyMode: "quality", avc: { format: "avc" } };
        if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg;
      } catch (e) { /* next */ }
    }
    return null;
  }

  // onProgress(stage, fraction); cancelled() -> bool. Returns { buffer, audioCodec }.
  async function exportMp4(spec, size, onProgress, cancelled) {
    const [w, h, bitrate] = SIZES[size] || SIZES["1080"];
    onProgress("Печатаем гравюры…", 0);
    await new Promise((r) => setTimeout(r, 30));
    const film = FILM.create(spec);
    onProgress("Сочиняем музыку…", 0);
    await new Promise((r) => setTimeout(r, 30));
    const audio = await SCORE.render(film.plan, spec);

    const vcfg = await pickVideo(w, h, bitrate);
    if (!vcfg) throw new Error("Этот компьютер не умеет кодировать H.264.");
    const acfg = await pickAudio();
    const muxer = new Mp4Muxer.Muxer({
      target: new Mp4Muxer.ArrayBufferTarget(),
      video: { codec: "avc", width: w, height: h, frameRate: 24 },
      audio: acfg ? { codec: acfg.mux, numberOfChannels: 2, sampleRate: 48000 } : undefined,
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
    let failure = null;
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => (failure = e) });
    venc.configure(vcfg);

    // audio first: it is quick and keeps the muxer's tracks in step
    if (acfg) {
      const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => (failure = e) });
      aenc.configure({ codec: acfg.codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
      const L = audio.getChannelData(0), R = audio.getChannelData(1), total = Math.ceil(film.duration * 48000), F = 1024;
      for (let i = 0; i < total; i += F) {
        const n = Math.min(F, total - i), data = new Float32Array(n * 2);
        data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
        const ad = new AudioData({ format: "f32-planar", sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((i / 48000) * 1e6), data });
        aenc.encode(ad); ad.close();
      }
      await aenc.flush();
    }

    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const frames = Math.round(film.duration * 24);
    for (let f = 0; f < frames; f++) {
      if (cancelled()) { venc.close(); throw new Error("cancelled"); }
      if (failure) throw failure;
      film.draw(f / 24, canvas, { blur: true });
      const vf = new VideoFrame(canvas, { timestamp: Math.round((f * 1e6) / 24), duration: Math.round(1e6 / 24) });
      venc.encode(vf, { keyFrame: f % 48 === 0 });
      vf.close();
      while (venc.encodeQueueSize > 3) await new Promise((r) => setTimeout(r, 1));
      if (f % 4 === 0) { onProgress(`Кадр ${f + 1} из ${frames}`, (f + 1) / frames); await new Promise((r) => setTimeout(r, 0)); }
    }
    await venc.flush();
    if (failure) throw failure;
    muxer.finalize();
    onProgress("Готово", 1);
    return { buffer: muxer.target.buffer, audioCodec: acfg ? acfg.mux : "нет" };
  }

  window.EXPORTER = { exportMp4, SIZES };
})();
