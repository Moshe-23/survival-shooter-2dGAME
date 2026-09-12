// Процедурный звук через WebAudio — никаких внешних файлов
(function () {
  let ctx = null;
  let master = null;
  let muted = false;
  let volume = 0.45; // текущий уровень громкости (мастер-усиление)

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.45;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuffer(dur) {
    const c = ensure();
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  const _noiseCache = {};

  function noise(dur) {
    const key = String(Math.round(dur * 100));
    if (!_noiseCache[key]) _noiseCache[key] = noiseBuffer(dur);
    return _noiseCache[key];
  }

  // ---- СЭМПЛЫ ИГРОКА (файлы из assets) ----
  const _buffers = {};

  function loadSample(name, url) {
    const c = ensure();
    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(url); return r.arrayBuffer(); })
      .then(function (buf) { return c.decodeAudioData(buf); })
      .then(function (audioBuffer) {
        _buffers[name] = audioBuffer;
        if (name === 'walk') restartWalkSource();
        if (name === 'music') {
          // Музыка зацикливается сразу, как только файл загружен
          if (ctx) ensureMusic(ctx);
          if (musicWanted && musicGain) {
            musicGain.gain.cancelScheduledValues(ctx.currentTime);
            musicGain.gain.setValueAtTime(0, ctx.currentTime);
            musicGain.gain.linearRampToValueAtTime(0.62, ctx.currentTime + 1.5);
          }
        }
        return audioBuffer;
      })
      .catch(function () { /* если файл не загрузился — процедурные звуки */ });
  }

  // Выстрел дробовика: своим сэмплом, при его отсутствии — процедурный
  function shoot() {
    const c = ensure();
    const t = c.currentTime;

    const buf = _buffers['shot'];
    if (buf) {
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = 0.95;
      src.connect(g).connect(master);
      src.start(t);
      return;
    }

    // Резкий высокочастотный щелчок (сам "хлоп" выстрела)
    const crack = c.createBufferSource();
    crack.buffer = noise(0.09);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 750;
    const gC = c.createGain();
    gC.gain.setValueAtTime(0.9, t);
    gC.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    crack.connect(hp).connect(gC).connect(master);
    crack.start(t); crack.stop(t + 0.1);

    // Плотное "тело" выстрела — шум на низких частотах
    const body = c.createBufferSource();
    body.buffer = noise(0.26);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2600, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + 0.24);
    const gB = c.createGain();
    gB.gain.setValueAtTime(0.85, t);
    gB.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    body.connect(lp).connect(gB).connect(master);
    body.start(t); body.stop(t + 0.3);

    // Глубокий удар (бух) — отдача в грудь
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const gK = c.createGain();
    gK.gain.setValueAtTime(1.0, t);
    gK.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(gK).connect(master);
    osc.start(t); osc.stop(t + 0.28);
  }

  // Щелчок перезарядки
  function reload() {
    const c = ensure();
    const t = c.currentTime;
    for (let k = 0; k < 2; k++) {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(900 + k * 220, t + k * 0.12);
      osc.frequency.exponentialRampToValueAtTime(600, t + k * 0.12 + 0.07);
      const g = c.createGain();
      g.gain.setValueAtTime(0.22, t + k * 0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + k * 0.12 + 0.08);
      osc.connect(g).connect(master);
      osc.start(t + k * 0.12); osc.stop(t + 0.45);
    }
  }

  // Рычание зомби
  function growl(pitch) {
    const c = ensure();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(0.32);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(220 * (pitch || 1), t);
    bp.frequency.linearRampToValueAtTime(140 * (pitch || 1), t + 0.3);
    bp.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.35);
  }

  // Боль игрока
  function hurt() {
    const c = ensure();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.25);
  }

  // Контакт зомби с игроком
  function bite() {
    const c = ensure();
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.14);
    const g = c.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.18);
  }

  // Сигнал новой волны
  function wave() {
    const c = ensure();
    const t = c.currentTime;
    [196, 261, 392].forEach(function (f, i) {
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, t + i * 0.11);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.11 + 0.35);
      osc.connect(g).connect(master);
      osc.start(t + i * 0.11); osc.stop(t + i * 0.11 + 0.4);
    });
  }

  // Взрыв гранаты
  function boom() {
    const c = ensure();
    const t = c.currentTime;

    // Глухой низкий гул
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.7);
    const g = c.createGain();
    g.gain.setValueAtTime(1.0, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    osc.connect(g).connect(master);
    osc.start(t); osc.stop(t + 0.9);

    // Треск (шум + низкие частоты)
    const src = c.createBufferSource();
    src.buffer = noise(0.85);
    const bp = c.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(120, t + 0.7);
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.85, t);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
    src.connect(bp).connect(g2).connect(master);
    src.start(t); src.stop(t + 0.8);
  }

  // Выстрел винтовки думгая: резкий треск + густой удар
  function pistol() {
    const c = ensure();
    const t = c.currentTime;

    // Резкий пик — "хлёст" боевой винтовки
    const crack = c.createBufferSource();
    crack.buffer = noise(0.07);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + 0.06);
    bp.Q.value = 1.1;
    const gC = c.createGain();
    gC.gain.setValueAtTime(0.85, t);
    gC.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    crack.connect(bp).connect(gC).connect(master);
    crack.start(t); crack.stop(t + 0.08);

    // Плотный звук выстрела
    const body = c.createBufferSource();
    body.buffer = noise(0.14);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2000, t);
    lp.frequency.exponentialRampToValueAtTime(250, t + 0.12);
    const gB = c.createGain();
    gB.gain.setValueAtTime(0.8, t);
    gB.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    body.connect(lp).connect(gB).connect(master);
    body.start(t); body.stop(t + 0.16);

    // Низкий удар (отдача автомата)
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const gK = c.createGain();
    gK.gain.setValueAtTime(0.65, t);
    gK.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(gK).connect(master);
    osc.start(t); osc.stop(t + 0.13);
  }

  // ---- ХОДЬБА: зацикленный звук ----
  // Использует сэмпл игрока (когда загрузился), иначе процедурный.
  // Громкость плавно поднимается, пока игрок идёт, и гаснет при остановке.
  let walkSource = null;
  let walkGain = null;
  let walkOn = false;
  let wantWalk = false;

  function buildWalkBuffer(c) {
    const srate = c.sampleRate;
    const dur = 1.6;
    const buf = c.createBuffer(1, Math.floor(srate * dur), srate);
    const d = buf.getChannelData(0);
    // Тихий шорох — подошвы по траве/земле
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.38;
    // Ритм: 4 притопа за цикл (4 шага)
    const stepLen = 0.11 * srate;
    for (let s = 0; s < 4; s++) {
      const at = Math.floor(s * 0.4 * srate);
      for (let i = 0; i < stepLen; i++) {
        const idx = at + i;
        if (idx >= 0 && idx < d.length) {
          const env = Math.pow(Math.sin((i / stepLen) * Math.PI), 1.5);
          d[idx] += (Math.random() * 2 - 1) * 0.85 * env;
        }
      }
    }
    return buf;
  }

  function ensureWalk(c) {
    if (walkSource) return;
    walkSource = c.createBufferSource();
    walkSource.buffer = _buffers['walk'] || buildWalkBuffer(c);
    walkSource.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = _buffers['walk'] ? 9000 : 650;
    walkGain = c.createGain();
    walkGain.gain.value = 0;
    walkSource.connect(lp).connect(walkGain).connect(master);
    walkSource.start();
    walkOn = false;
    if (wantWalk) {
      walkGain.gain.setValueAtTime(0, c.currentTime);
      walkGain.gain.linearRampToValueAtTime(0.5, c.currentTime + 0.1);
      walkOn = true;
    }
  }

  function restartWalkSource() {
    try {
      if (walkSource) { walkSource.stop(); walkSource.disconnect(); }
    } catch (e) { /* источник мог не стартовать */ }
    if (walkGain) walkGain.disconnect();
    walkSource = null;
    walkGain = null;
    walkOn = false;
    if (ctx) ensureWalk(ctx);
  }

  function setWalking(moving) {
    const c = ensure();
    ensureWalk(c);
    wantWalk = !!moving;
    if (wantWalk === walkOn) return;
    const t = c.currentTime;
    walkGain.gain.cancelScheduledValues(t);
    walkGain.gain.setValueAtTime(walkGain.gain.value, t);
    walkGain.gain.linearRampToValueAtTime(wantWalk ? 0.5 : 0, t + (wantWalk ? 0.12 : 0.08));
    walkOn = wantWalk;
  }

  // Выстрел босса: мощный тяжёлый — басовый гул + треск + металлический лязг
  function bossGun() {
    const c = ensure();
    const t = c.currentTime;

    // Глубокий подземный гул
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(32, t + 0.4);
    const gK = c.createGain();
    gK.gain.setValueAtTime(1.1, t);
    gK.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(gK).connect(master);
    osc.start(t); osc.stop(t + 0.46);

    // Резкий треск (высокие частоты)
    const src = c.createBufferSource();
    src.buffer = noise(0.16);
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1100;
    const gC = c.createGain();
    gC.gain.setValueAtTime(1.05, t);
    gC.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(hp).connect(gC).connect(master);
    src.start(t); src.stop(t + 0.18);

    // Плотный бух
    const body = c.createBufferSource();
    body.buffer = noise(0.3);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 0.28);
    const gB = c.createGain();
    gB.gain.setValueAtTime(0.9, t);
    gB.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    body.connect(lp).connect(gB).connect(master);
    body.start(t); body.stop(t + 0.34);

    // Металлический лязг (пила вниз)
    const ring = c.createOscillator();
    ring.type = 'sawtooth';
    ring.frequency.setValueAtTime(1800, t);
    ring.frequency.exponentialRampToValueAtTime(200, t + 0.12);
    const gR = c.createGain();
    gR.gain.setValueAtTime(0.3, t);
    gR.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    ring.connect(gR).connect(master);
    ring.start(t); ring.stop(t + 0.15);
  }

  // ---- ФОНОВАЯ МУЗЫКА: зациклена навсегда, тихая ----
  let musicSource = null;
  let musicGain = null;
  let musicWanted = false;

  function ensureMusic(c) {
    if (musicSource || !_buffers['music']) return;
    musicSource = c.createBufferSource();
    musicSource.buffer = _buffers['music'];
    musicSource.loop = true;
    musicGain = c.createGain();
    musicGain.gain.value = 0;
    musicSource.connect(musicGain).connect(master);
    musicSource.start();
  }

  function playMusic() {
    musicWanted = true;
    const c = ensure();
    ensureMusic(c);
    if (!musicGain) return;
    const t = c.currentTime;
    musicGain.gain.cancelScheduledValues(t);
    musicGain.gain.setValueAtTime(musicGain.gain.value, t);
    musicGain.gain.linearRampToValueAtTime(0.62, t + 1.5);
  }

  function setMuted(v) {
    muted = v;
    if (master) master.gain.value = v ? 0 : volume;
  }
  function isMuted() { return muted; }

  // Изменить громкость на delta (0..1), вернуть проценты
  function changeVolume(delta) {
    volume = Math.max(0, Math.min(0.9, volume + delta));
    if (master && !muted) master.gain.value = volume;
    return Math.round(volume / 0.9 * 100);
  }
  function getVolume() { return volume; }

  // ---- ДВИГАТЕЛЬ МАШИНЫ: заведение + жужжание по газу ----
  let engOsc = null, engOsc2 = null, engNoise = null, engGain = null, engLP = null;

  function startCarEngine() {
    const c = ensure();
    if (engOsc) return;
    engGain = c.createGain();
    engGain.gain.value = 0;
    engLP = c.createBiquadFilter();
    engLP.type = 'lowpass';
    engLP.frequency.value = 350;
    engOsc = c.createOscillator();
    engOsc.type = 'sawtooth';
    engOsc.frequency.value = 60;
    engOsc2 = c.createOscillator();
    engOsc2.type = 'square';
    engOsc2.detune.value = 8;
    engOsc2.frequency.value = 30;
    engNoise = c.createBufferSource();
    engNoise.buffer = noise(2);
    engNoise.loop = true;
    const nG = c.createGain();
    nG.gain.value = 0.5;
    const nLP = c.createBiquadFilter();
    nLP.type = 'lowpass';
    nLP.frequency.value = 220;
    engNoise.connect(nLP).connect(nG);
    engOsc.connect(engLP);
    engOsc2.connect(engLP);
    nG.connect(engLP);
    engLP.connect(engGain).connect(master);
    engOsc.start();
    engOsc2.start();
    engNoise.start();
  }

  // throttle: 0..1 (газ), speed01: 0..1 (доля от макс скорости)
  function updateCarEngine(throttle, speed01) {
    if (!engOsc) startCarEngine();
    const t = ctx.currentTime;
    const sp = Math.abs(speed01);
    const rpm = 62 + sp * 165 + throttle * 85;
    engOsc.frequency.setTargetAtTime(rpm, t, 0.06);
    engOsc2.frequency.setTargetAtTime(rpm * 0.5, t, 0.06);
    engLP.frequency.setTargetAtTime(260 + sp * 1300 + throttle * 350, t, 0.07);
    const g = 0.045 + sp * 0.13 + throttle * 0.06;
    engGain.gain.setTargetAtTime(g, t, 0.06);
  }

  function stopCarEngine() {
    if (!engGain) return;
    const t = ctx.currentTime;
    engGain.gain.cancelScheduledValues(t);
    engGain.gain.setTargetAtTime(0.0001, t, 0.15);
    if (engOsc) {
      try {
        engOsc.stop(t + 0.7);
        engOsc2.stop(t + 0.7);
        engNoise.stop(t + 0.7);
      } catch (e) { /* уже остановлен */ }
    }
    engOsc = engOsc2 = engNoise = engGain = engLP = null;
  }

  // Стартер: несколько рывков, потом мотор завёлся
  function carStart() {
    const c = ensure();
    const t = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const t0 = t + i * 0.15;
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(130, t0);
      osc.frequency.exponentialRampToValueAtTime(42, t0 + 0.11);
      const g = c.createGain();
      g.gain.setValueAtTime(0.16, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.11);
      osc.connect(g).connect(master);
      osc.start(t0); osc.stop(t0 + 0.12);
    }
    startCarEngine();
    const tt = t + 0.42;
    engOsc.frequency.setTargetAtTime(95, tt, 0.05);
    engGain.gain.cancelScheduledValues(tt);
    engGain.gain.setTargetAtTime(0.08, tt, 0.05);
  }

  // Глухой стук при постройке
  function buildSound() {
    const c = ensure();
    const t = c.currentTime;
    for (let i = 0; i < 2; i++) {
      const t0 = t + i * 0.1;
      const osc = c.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(130, t0);
      osc.frequency.exponentialRampToValueAtTime(48, t0 + 0.09);
      const g = c.createGain();
      g.gain.setValueAtTime(0.22, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
      osc.connect(g).connect(master);
      osc.start(t0); osc.stop(t0 + 0.11);
    }
  }

  // Скрип двери
  function doorClick() {
    const c = ensure();
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = noise(0.3);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(900, t + 0.25);
    bp.Q.value = 4;
    const g = c.createGain();
    g.gain.setValueAtTime(0.25, t);
    g.gain.setValueAtTime(0.2, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    src.connect(bp).connect(g).connect(master);
    src.start(t); src.stop(t + 0.3);
  }

  Game.audio = { shoot, reload, growl, hurt, bite, wave, boom, pistol, bossGun, setWalking, loadSample, playMusic, setMuted, isMuted, changeVolume, getVolume, carStart, updateCarEngine, stopCarEngine, buildSound, doorClick };
})();