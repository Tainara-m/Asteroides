'use strict';

/* =========================================================================
   ASTEROIDES — versão aprimorada
   JavaScript puro + HTML5 Canvas
   ========================================================================= */
(() => {
  const TAU = Math.PI * 2;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, S = 1; // S = fator de escala para telas pequenas
  let bgGradient = null;

  /* ---------------------------------------------------------------- Storage */
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ }
    }
  };

  /* ----------------------------------------------------------------- Assets */
  function loadImg(src) { const i = new Image(); i.src = src; return i; }
  const shipImg = loadImg('assets/ship.png');
  const asteroidImg = loadImg('assets/asteroid.png');
  const hasImg = img => img.complete && img.naturalWidth > 0;

  if (document.fonts && document.fonts.load) document.fonts.load('20px Asteroides').catch(() => {});
  const FONT = "'Asteroides', Arial, Helvetica, sans-serif";

  /* ------------------------------------------------------------------ Áudio */
  let muted = store.get('muted', '0') === '1';
  let audioCtx = null;

  function synth(kind) {
    // Som sintetizado de reserva caso os arquivos de áudio não estejam disponíveis
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t = audioCtx.currentTime;
      const gain = audioCtx.createGain();
      gain.connect(audioCtx.destination);
      if (kind === 'shoot') {
        const o = audioCtx.createOscillator();
        o.type = 'square';
        o.frequency.setValueAtTime(880, t);
        o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(gain); o.start(t); o.stop(t + 0.13);
      } else {
        const len = Math.floor(audioCtx.sampleRate * 0.45);
        const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        const n = audioCtx.createBufferSource();
        n.buffer = buf;
        gain.gain.setValueAtTime(0.18, t);
        n.connect(gain); n.start(t);
      }
    } catch (e) { /* sem áudio */ }
  }

  function makePool(src, size, volume, fallbackKind) {
    const pool = [];
    let failed = false;
    for (let i = 0; i < size; i++) {
      const a = new Audio(src);
      a.volume = volume;
      a.preload = 'auto';
      a.addEventListener('error', () => { failed = true; });
      pool.push(a);
    }
    let idx = 0;
    return {
      play() {
        if (muted) return;
        if (failed) { synth(fallbackKind); return; }
        const a = pool[idx++ % size];
        try {
          a.currentTime = 0;
          const p = a.play();
          if (p && p.catch) p.catch(() => {});
        } catch (e) { /* ignora */ }
      }
    };
  }

  const shootSfx = makePool('assets/shoot.mp3', 4, 0.5, 'shoot');
  const explosionSfx = makePool('assets/explosion.wav', 4, 0.7, 'explosion');

  const bgMusic = new Audio('assets/bgMusic.mp3');
  bgMusic.loop = true;
  bgMusic.volume = 0.5;
  bgMusic.muted = muted;

  function playMusic() {
    try { const p = bgMusic.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignora */ }
  }

  const muteIcon = document.getElementById('muteIcon');
  function updateMuteIcon() { muteIcon.textContent = muted ? '🔇' : '🔊'; }
  function toggleMute() {
    muted = !muted;
    bgMusic.muted = muted;
    store.set('muted', muted ? '1' : '0');
    updateMuteIcon();
  }

  /* --------------------------------------------------------------- Constantes */
  const STATE = { START: 0, PLAYING: 1, PAUSED: 2, OVER: 3 };
  const TIERS = {
    3: { r: 48, score: 20, speed: 1.0 },
    2: { r: 28, score: 50, speed: 1.3 },
    1: { r: 15, score: 100, speed: 1.7 }
  };
  const POWER = {
    shield: { color: '#33ddff', label: 'S', name: 'ESCUDO', time: 600 },
    rapid:  { color: '#ffdd33', label: 'R', name: 'TIRO RÁPIDO', time: 900 },
    triple: { color: '#ff55dd', label: '3', name: 'TIRO TRIPLO', time: 900 },
    life:   { color: '#66ff66', label: '+', name: 'VIDA' }
  };
  const MAX_LIVES = 6;
  const EXTRA_LIFE_EVERY = 5000;

  /* ----------------------------------------------------------------- Estado */
  let state = STATE.START;
  let ship, bullets, asteroids, particles, rings, powerups, ufos, ufoBullets, texts, stars = [];
  let score, highScore = Number(store.get('highScore', 0)) || 0;
  let lives, level, nextLifeAt;
  let shake = 0, frameCount = 0, fade = 1;
  let banner = { text: '', timer: 0 };
  let levelClearTimer = 0, overTimer = 0, ufoTimer = 0, overAt = 0;
  let effects = { shield: 0, rapid: 0, triple: 0 };
  let newRecord = false;

  const down = new Set(); // teclas pressionadas
  const isLeft = () => down.has('ArrowLeft') || down.has('KeyA');
  const isRight = () => down.has('ArrowRight') || down.has('KeyD');
  const isUp = () => down.has('ArrowUp') || down.has('KeyW');
  const isDown = () => down.has('ArrowDown') || down.has('KeyS');
  const isFire = () => down.has('Space');

  /* ----------------------------------------------------------------- Layout */
  function initStars() {
    const count = Math.floor((W * H) / 5000);
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, z: rand(0.2, 1), p: Math.random() * TAU });
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    S = clamp(Math.min(W, H) / 800, 0.7, 1.15);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    bgGradient = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    bgGradient.addColorStop(0, '#0b1230');
    bgGradient.addColorStop(1, '#000000');
    initStars();
  }

  /* ----------------------------------------------------------- Criação/Reset */
  function newShip() {
    return {
      x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2,
      alive: true, respawn: 0, invuln: 0, cooldown: 0, hyperCd: 0, thrusting: false
    };
  }

  function makeAsteroid(x, y, tier, boost = 1) {
    const t = TIERS[tier];
    const r = t.r * S * rand(0.85, 1.15);
    const dir = Math.random() * TAU;
    const sp = (rand(0.7, 1.9) + 0.06 * (level - 1)) * t.speed * boost;
    const n = 9 + Math.floor(Math.random() * 4);
    const shape = [];
    for (let i = 0; i < n; i++) shape.push(rand(0.75, 1.1));
    return {
      x, y, tier, r, vx: Math.cos(dir) * sp, vy: Math.sin(dir) * sp,
      rot: Math.random() * TAU, spin: rand(-0.03, 0.03), shape
    };
  }

  function spawnWave() {
    const count = Math.min(4 + level, 12);
    for (let i = 0; i < count; i++) {
      let x, y, tries = 0;
      do { x = Math.random() * W; y = Math.random() * H; tries++; }
      while (Math.hypot(x - W / 2, y - H / 2) < 240 * S && tries < 40);
      asteroids.push(makeAsteroid(x, y, 3));
    }
  }

  function clearWorld() {
    bullets = []; asteroids = []; particles = []; rings = [];
    powerups = []; ufos = []; ufoBullets = []; texts = [];
    effects = { shield: 0, rapid: 0, triple: 0 };
    shake = 0;
  }

  function showStartScreen() {
    state = STATE.START;
    clearWorld();
    ship = newShip();
    score = 0; lives = 3; level = 1;
    for (let i = 0; i < 6; i++) {
      asteroids.push(makeAsteroid(Math.random() * W, Math.random() * H, 3, 0.7));
    }
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.getElementById('startScreen').style.display = 'flex';
    document.body.classList.remove('playing');
  }

  function startGame() {
    clearWorld();
    ship = newShip();
    ship.invuln = 120;
    score = 0; lives = 3; level = 1; nextLifeAt = EXTRA_LIFE_EVERY;
    newRecord = false;
    levelClearTimer = 0; overTimer = 0;
    ufoTimer = rand(1000, 1600);
    banner = { text: 'Fase 1', timer: 120 };
    spawnWave();
    state = STATE.PLAYING;
    document.getElementById('startScreen').style.display = 'none';
    document.getElementById('gameOverScreen').style.display = 'none';
    document.getElementById('pauseScreen').style.display = 'none';
    document.body.classList.add('playing');
    bgMusic.playbackRate = 1;
    bgMusic.currentTime = 0;
    playMusic();
  }

  function nextLevel() {
    level++;
    spawnWave();
    banner = { text: `Fase ${level}`, timer: 120 };
    ufoTimer = Math.max(500, 1500 - level * 70) + rand(0, 500);
    try { bgMusic.playbackRate = Math.min(1 + (level - 1) * 0.08, 1.8); } catch (e) { /* ignora */ }
  }

  function endGame() {
    state = STATE.OVER;
    overAt = performance.now();
    newRecord = score > highScore;
    if (newRecord) { highScore = score; store.set('highScore', String(highScore)); }
    document.getElementById('finalScore').textContent = `Final Score: ${score}`;
    document.getElementById('recordMsg').textContent = newRecord ? '🏆 Novo recorde!' : `Recorde: ${highScore}`;
    document.getElementById('gameOverScreen').style.display = 'flex';
    document.body.classList.remove('playing');
    bgMusic.pause();
  }

  function pauseGame() {
    if (state !== STATE.PLAYING) return;
    state = STATE.PAUSED;
    document.getElementById('pauseScreen').style.display = 'flex';
    bgMusic.pause();
    down.clear();
  }

  function resumeGame() {
    if (state !== STATE.PAUSED) return;
    state = STATE.PLAYING;
    document.getElementById('pauseScreen').style.display = 'none';
    playMusic();
  }

  /* ---------------------------------------------------------------- Efeitos */
  function explode(x, y, count, hue, speed = 3, life = 40) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * TAU;
      const s = Math.random() * speed;
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(life * 0.5, life), max: life,
        size: rand(1, 3.2), color: `hsl(${hue + rand(-15, 25)},100%,${rand(55, 80)}%)`
      });
    }
  }

  function addRing(x, y, maxR, color) { rings.push({ x, y, r: 0, maxR, color }); }
  function addText(x, y, text, color = '#fff') { texts.push({ x, y, text, color, life: 60 }); }
  function addShake(v) { shake = Math.max(shake, v); }

  function addScore(n) {
    score += n;
    while (score >= nextLifeAt) {
      nextLifeAt += EXTRA_LIFE_EVERY;
      if (lives < MAX_LIVES) lives++;
      addText(ship.x, ship.y - 40, 'VIDA EXTRA!', POWER.life.color);
    }
  }

  /* ------------------------------------------------------------------ Lógica */
  function wrap(o, m) {
    if (o.x < -m) o.x = W + m; else if (o.x > W + m) o.x = -m;
    if (o.y < -m) o.y = H + m; else if (o.y > H + m) o.y = -m;
  }

  function shoot() {
    const angles = effects.triple > 0 ? [-0.2, 0, 0.2] : [0];
    const maxBullets = effects.triple > 0 ? 18 : 8;
    if (bullets.length >= maxBullets) return;
    for (const off of angles) {
      const a = ship.angle + off;
      bullets.push({
        x: ship.x + Math.cos(a) * 18 * S, y: ship.y + Math.sin(a) * 18 * S,
        vx: Math.cos(a) * 10 + ship.vx * 0.3, vy: Math.sin(a) * 10 + ship.vy * 0.3, life: 55
      });
    }
    ship.cooldown = effects.rapid > 0 ? 5 : 11;
    shootSfx.play();
  }

  function safeToSpawn() {
    const cx = W / 2, cy = H / 2;
    for (const a of asteroids) if (Math.hypot(a.x - cx, a.y - cy) < a.r + 130 * S) return false;
    for (const u of ufos) if (Math.hypot(u.x - cx, u.y - cy) < 200) return false;
    for (const b of ufoBullets) if (Math.hypot(b.x - cx, b.y - cy) < 120) return false;
    return true;
  }

  function killShip() {
    ship.alive = false;
    lives--;
    explode(ship.x, ship.y, 70, 190, 5, 60);
    explode(ship.x, ship.y, 30, 30, 4, 50);
    addRing(ship.x, ship.y, 90 * S, '#66ddff');
    addShake(18);
    explosionSfx.play();
    effects = { shield: 0, rapid: 0, triple: 0 };
    ship.thrusting = false;
    if (lives <= 0) overTimer = 100; else ship.respawn = 110;
  }

  function hyperspace() {
    if (state !== STATE.PLAYING || !ship.alive || ship.hyperCd > 0) return;
    addRing(ship.x, ship.y, 50 * S, '#ffffff');
    ship.x = rand(40, W - 40); ship.y = rand(40, H - 40);
    ship.vx = ship.vy = 0;
    ship.hyperCd = 180;
    addRing(ship.x, ship.y, 50 * S, '#ffffff');
    if (Math.random() < 0.12) killShip(); // risco clássico do hiperespaço
  }

  function updateShip(dt) {
    if (ship.hyperCd > 0) ship.hyperCd -= dt;
    if (!ship.alive) {
      if (lives > 0 && overTimer <= 0) {
        ship.respawn -= dt;
        if (ship.respawn <= 0 && safeToSpawn()) {
          const fresh = newShip();
          fresh.invuln = 180;
          ship = fresh;
        }
      }
      return;
    }

    if (isLeft()) ship.angle -= 0.07 * dt;
    if (isRight()) ship.angle += 0.07 * dt;
    ship.thrusting = isUp();

    if (ship.thrusting) {
      ship.vx += Math.cos(ship.angle) * 0.12 * dt;
      ship.vy += Math.sin(ship.angle) * 0.12 * dt;
      const bx = ship.x - Math.cos(ship.angle) * 16 * S;
      const by = ship.y - Math.sin(ship.angle) * 16 * S;
      particles.push({
        x: bx, y: by,
        vx: -Math.cos(ship.angle) * rand(1.5, 3.5) + ship.vx * 0.5 + rand(-0.4, 0.4),
        vy: -Math.sin(ship.angle) * rand(1.5, 3.5) + ship.vy * 0.5 + rand(-0.4, 0.4),
        life: rand(10, 20), max: 20, size: rand(1.5, 3), color: `hsl(${rand(15, 50)},100%,60%)`
      });
    }
    if (isDown()) { const f = Math.pow(0.94, dt); ship.vx *= f; ship.vy *= f; }

    const fr = Math.pow(0.987, dt);
    ship.vx *= fr; ship.vy *= fr;
    const sp = Math.hypot(ship.vx, ship.vy);
    if (sp > 7.5) { ship.vx *= 7.5 / sp; ship.vy *= 7.5 / sp; }
    ship.x += ship.vx * dt;
    ship.y += ship.vy * dt;
    wrap(ship, 15);

    if (ship.cooldown > 0) ship.cooldown -= dt;
    if (ship.invuln > 0) ship.invuln -= dt;
    if (isFire() && ship.cooldown <= 0) shoot();
  }

  function updateEffects(dt) {
    for (const k of Object.keys(effects)) if (effects[k] > 0) effects[k] = Math.max(0, effects[k] - dt);
  }

  function updateBullets(dt) {
    for (const arr of [bullets, ufoBullets]) {
      for (let i = arr.length - 1; i >= 0; i--) {
        const b = arr[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        wrap(b, 0);
        if (b.life <= 0) arr.splice(i, 1);
      }
    }
  }

  function updateAsteroids(dt) {
    for (const a of asteroids) {
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.spin * dt;
      wrap(a, a.r);
    }
  }

  function spawnUfo() {
    const small = level >= 4 && Math.random() < 0.4;
    const fromLeft = Math.random() < 0.5;
    ufos.push({
      x: fromLeft ? -30 : W + 30, y: rand(H * 0.15, H * 0.85),
      vx: (fromLeft ? 1 : -1) * (small ? 2.2 : 1.5), baseY: 0, t: Math.random() * TAU,
      small, r: (small ? 14 : 22) * S, shootIn: rand(40, 90)
    });
    ufos[ufos.length - 1].baseY = ufos[ufos.length - 1].y;
  }

  function updateUfos(dt) {
    if (asteroids.length > 0 && level >= 2 && ship.alive) {
      ufoTimer -= dt;
      if (ufoTimer <= 0 && ufos.length === 0) {
        spawnUfo();
        ufoTimer = Math.max(600, 1500 - level * 70) + rand(0, 600);
      }
    }
    for (let i = ufos.length - 1; i >= 0; i--) {
      const u = ufos[i];
      u.t += 0.03 * dt;
      u.x += u.vx * dt;
      u.y = u.baseY + Math.sin(u.t) * 70 * S;
      u.shootIn -= dt;
      if (u.shootIn <= 0 && ship.alive) {
        const err = u.small ? 0.25 : 0.7;
        const a = Math.atan2(ship.y - u.y, ship.x - u.x) + rand(-err, err);
        ufoBullets.push({ x: u.x, y: u.y, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5, life: 130 });
        u.shootIn = rand(60, 110);
      }
      if (u.x < -60 || u.x > W + 60) ufos.splice(i, 1);
    }
  }

  function updatePowerups(dt) {
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
      wrap(p, 15);
      if (p.life <= 0) powerups.splice(i, 1);
    }
  }

  function updateFx(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      const f = Math.pow(0.97, dt); p.vx *= f; p.vy *= f;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += (r.maxR - r.r) * 0.12 * dt + 0.8 * dt;
      if (r.r >= r.maxR - 1) rings.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i];
      t.y -= 0.6 * dt; t.life -= dt;
      if (t.life <= 0) texts.splice(i, 1);
    }
    if (shake > 0) shake = Math.max(0, shake - 0.8 * dt);
    if (banner.timer > 0) banner.timer -= dt;
  }

  function maybeDropPowerup(x, y, tier, force = false) {
    const chance = tier === 3 ? 0.09 : tier === 2 ? 0.06 : 0.04;
    if (!force && Math.random() > chance) return;
    const pool = ['shield', 'rapid', 'triple', 'shield', 'rapid', 'triple'];
    if (lives < MAX_LIVES) pool.push('life');
    const type = pool[Math.floor(Math.random() * pool.length)];
    powerups.push({ x, y, vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6), type, life: 600, r: 14 * S });
  }

  function destroyAsteroid(i) {
    const a = asteroids[i];
    asteroids.splice(i, 1);
    const t = TIERS[a.tier];
    addScore(t.score);
    explode(a.x, a.y, 10 + a.tier * 8, 30, 2 + a.tier, 30 + a.tier * 8);
    addRing(a.x, a.y, a.r * 1.5, '#ffaa33');
    addShake(a.tier * 2);
    explosionSfx.play();
    if (a.tier > 1) {
      for (let k = 0; k < 2; k++) {
        const child = makeAsteroid(a.x, a.y, a.tier - 1);
        child.vx += a.vx * 0.4; child.vy += a.vy * 0.4;
        asteroids.push(child);
      }
    }
    maybeDropPowerup(a.x, a.y, a.tier);
  }

  function destroyUfo(i) {
    const u = ufos[i];
    ufos.splice(i, 1);
    const pts = u.small ? 500 : 200;
    addScore(pts);
    addText(u.x, u.y - 20, `+${pts}`, '#ff8899');
    explode(u.x, u.y, 50, 340, 4.5, 50);
    addRing(u.x, u.y, 70 * S, '#ff5577');
    addShake(8);
    explosionSfx.play();
    maybeDropPowerup(u.x, u.y, 3, true);
  }

  function applyPowerup(type) {
    const p = POWER[type];
    if (type === 'life') {
      if (lives < MAX_LIVES) lives++;
    } else {
      effects[type] = p.time;
    }
    addText(ship.x, ship.y - 36, p.name, p.color);
    addRing(ship.x, ship.y, 45 * S, p.color);
  }

  function collisions() {
    // tiros da nave x asteroides / óvnis
    for (let bi = bullets.length - 1; bi >= 0; bi--) {
      const b = bullets[bi];
      let hit = false;
      for (let ai = asteroids.length - 1; ai >= 0; ai--) {
        const a = asteroids[ai];
        if (Math.hypot(b.x - a.x, b.y - a.y) < a.r * 0.9) { destroyAsteroid(ai); hit = true; break; }
      }
      if (!hit) {
        for (let ui = ufos.length - 1; ui >= 0; ui--) {
          if (Math.hypot(b.x - ufos[ui].x, b.y - ufos[ui].y) < ufos[ui].r + 4) { destroyUfo(ui); hit = true; break; }
        }
      }
      if (hit) bullets.splice(bi, 1);
    }

    if (!ship.alive) return;
    const shipR = 12 * S;
    const vulnerable = ship.invuln <= 0;
    const shielded = effects.shield > 0;

    // power-ups
    for (let i = powerups.length - 1; i >= 0; i--) {
      const p = powerups[i];
      if (Math.hypot(p.x - ship.x, p.y - ship.y) < p.r + shipR + 6) {
        applyPowerup(p.type);
        powerups.splice(i, 1);
      }
    }

    // nave x asteroides
    for (let ai = asteroids.length - 1; ai >= 0; ai--) {
      const a = asteroids[ai];
      if (Math.hypot(a.x - ship.x, a.y - ship.y) < a.r * 0.8 + shipR) {
        if (shielded) { destroyAsteroid(ai); }
        else if (vulnerable) { killShip(); return; }
      }
    }

    // nave x óvnis
    for (let ui = ufos.length - 1; ui >= 0; ui--) {
      if (Math.hypot(ufos[ui].x - ship.x, ufos[ui].y - ship.y) < ufos[ui].r + shipR) {
        if (shielded) { destroyUfo(ui); }
        else if (vulnerable) { destroyUfo(ui); killShip(); return; }
      }
    }

    // nave x tiros inimigos
    for (let bi = ufoBullets.length - 1; bi >= 0; bi--) {
      const b = ufoBullets[bi];
      if (Math.hypot(b.x - ship.x, b.y - ship.y) < shipR + 4) {
        ufoBullets.splice(bi, 1);
        if (shielded) addRing(ship.x, ship.y, 40 * S, POWER.shield.color);
        else if (vulnerable) { killShip(); return; }
      }
    }
  }

  function progress(dt) {
    if (overTimer > 0) {
      overTimer -= dt;
      if (overTimer <= 0) { endGame(); return; }
    }
    if (lives > 0 && asteroids.length === 0 && ufos.length === 0 && ufoBullets.length === 0) {
      if (levelClearTimer <= 0) levelClearTimer = 100;
      levelClearTimer -= dt;
      if (levelClearTimer <= 0) { levelClearTimer = 0; nextLevel(); }
    }
  }

  function updateStars(dt, parallax) {
    for (const s of stars) {
      s.x -= (0.05 + (parallax ? ship.vx * 0.25 : 0)) * s.z * dt;
      s.y -= (parallax ? ship.vy * 0.25 : 0) * s.z * dt;
      if (s.x < 0) s.x += W; else if (s.x > W) s.x -= W;
      if (s.y < 0) s.y += H; else if (s.y > H) s.y -= H;
    }
  }

  function update(dt) {
    frameCount += dt;
    updateStars(dt, true);
    updateShip(dt);
    updateEffects(dt);
    updateBullets(dt);
    updateAsteroids(dt);
    updateUfos(dt);
    updatePowerups(dt);
    updateFx(dt);
    collisions();
    progress(dt);
  }

  function updateAmbient(dt) {
    frameCount += dt;
    updateStars(dt, false);
    updateAsteroids(dt);
    updateFx(dt);
  }

  /* ----------------------------------------------------------------- Desenho */
  function drawStars() {
    for (const s of stars) {
      const tw = 0.6 + 0.4 * Math.sin(frameCount * 0.04 + s.p);
      ctx.globalAlpha = s.z * tw;
      ctx.fillStyle = '#cfe3ff';
      const size = s.z > 0.8 ? 2 : 1.2;
      ctx.fillRect(s.x, s.y, size, size);
    }
    ctx.globalAlpha = 1;
  }

  function drawShipShape(x, y, angle, size, flame) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    if (flame) {
      const len = size * (0.35 + Math.random() * 0.25);
      ctx.beginPath();
      ctx.moveTo(-size * 0.12, size * 0.38);
      ctx.lineTo(0, size * 0.38 + len);
      ctx.lineTo(size * 0.12, size * 0.38);
      ctx.closePath();
      ctx.fillStyle = Math.random() < 0.5 ? '#ffb030' : '#ff6a20';
      ctx.shadowColor = '#ff8800';
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    if (hasImg(shipImg)) {
      ctx.drawImage(shipImg, -size / 2, -size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, -size * 0.5);
      ctx.lineTo(size * 0.38, size * 0.42);
      ctx.lineTo(0, size * 0.25);
      ctx.lineTo(-size * 0.38, size * 0.42);
      ctx.closePath();
      ctx.fillStyle = '#10243f';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#4de1ff';
      ctx.shadowColor = '#4de1ff';
      ctx.shadowBlur = 8;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShip() {
    if (!ship.alive) return;
    const size = 56 * S;
    const blink = ship.invuln > 0 && Math.floor(frameCount / 5) % 2 === 0;
    if (!blink) drawShipShape(ship.x, ship.y, ship.angle, size, ship.thrusting);

    if (effects.shield > 0) {
      const fading = effects.shield < 120 && Math.floor(frameCount / 6) % 2 === 0;
      if (!fading) {
        const pulse = 1 + Math.sin(frameCount * 0.15) * 0.05;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ship.x, ship.y, 30 * S * pulse, 0, TAU);
        ctx.fillStyle = 'rgba(51,221,255,0.12)';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(120,235,255,0.9)';
        ctx.shadowColor = '#33ddff';
        ctx.shadowBlur = 14;
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawAsteroids() {
    for (const a of asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.rot);
      if (hasImg(asteroidImg)) {
        ctx.drawImage(asteroidImg, -a.r, -a.r, a.r * 2, a.r * 2);
      } else {
        ctx.beginPath();
        const n = a.shape.length;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU;
          const rr = a.r * a.shape[i];
          const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = '#1a1f2b';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#9fb4d0';
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawBullets() {
    ctx.save();
    ctx.lineCap = 'round';
    for (const b of bullets) {
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#66e0ff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.9, b.y - b.vy * 0.9);
      ctx.stroke();
    }
    for (const b of ufoBullets) {
      ctx.fillStyle = '#ff5577';
      ctx.shadowColor = '#ff2255';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawUfos() {
    for (const u of ufos) {
      const k = u.r;
      ctx.save();
      ctx.translate(u.x, u.y);
      ctx.shadowColor = '#ff5577';
      ctx.shadowBlur = 12;
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ff6b88';
      ctx.fillStyle = '#25101a';
      ctx.beginPath(); // cúpula
      ctx.arc(0, -k * 0.15, k * 0.5, Math.PI, 0);
      ctx.fill(); ctx.stroke();
      ctx.beginPath(); // corpo
      ctx.ellipse(0, 0, k, k * 0.38, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = Math.floor(frameCount / 8 + i) % 2 ? '#ffee66' : '#ff5577';
        ctx.beginPath();
        ctx.arc(i * k * 0.5, 0, 2.2, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      if (p.life < 120 && Math.floor(frameCount / 6) % 2 === 0) continue;
      const def = POWER[p.type];
      const pulse = 1 + Math.sin(frameCount * 0.12) * 0.1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, p.r, 0, TAU);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = def.color;
      ctx.shadowColor = def.color;
      ctx.shadowBlur = 14;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = def.color;
      ctx.font = `bold ${Math.round(p.r * 1.2)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.label, 0, 1);
      ctx.restore();
    }
  }

  function drawFx() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.restore();

    for (const r of rings) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - r.r / r.maxR, 0, 1);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.lineWidth = 2;
      ctx.strokeStyle = r.color;
      ctx.stroke();
      ctx.restore();
    }

    for (const t of texts) {
      ctx.save();
      ctx.globalAlpha = clamp(t.life / 30, 0, 1);
      ctx.fillStyle = t.color;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'black';
      ctx.shadowBlur = 4;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }
  }

  function drawLives() {
    const size = 34;
    const shown = Math.min(lives, 5);
    for (let i = 0; i < shown; i++) {
      drawShipShape(20 + size / 2 + i * (size + 4), 20 + size / 2, -Math.PI / 2, size, false);
    }
    if (lives > shown) {
      ctx.save();
      ctx.fillStyle = '#4de1ff';
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`x${lives}`, 20 + shown * (size + 4), 44);
      ctx.restore();
    }
  }

  function drawHUD() {
    ctx.save();
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 4;
    ctx.textAlign = 'right';
    ctx.fillStyle = '#00ffff';
    ctx.font = `bold 20px ${FONT}`;
    ctx.fillText(`Score: ${score}`, W - 20, 30);
    ctx.fillText(`Recorde: ${Math.max(highScore, score)}`, W - 20, 60);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#9fb4d0';
    ctx.font = `bold 16px ${FONT}`;
    ctx.fillText(`Fase ${level}`, 20, 76);
    ctx.restore();

    drawLives();

    // barras dos power-ups ativos
    const active = Object.keys(effects).filter(k => effects[k] > 0);
    active.forEach((k, i) => {
      const def = POWER[k];
      const w = 120, x = W / 2 - w / 2, y = H - 30 - i * 26;
      ctx.save();
      ctx.font = `bold 12px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = def.color;
      ctx.fillText(def.name, W / 2, y - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y, w, 6);
      ctx.fillStyle = def.color;
      ctx.fillRect(x, y, w * (effects[k] / def.time), 6);
      ctx.restore();
    });
  }

  function drawBanner() {
    if (banner.timer <= 0) return;
    const op = clamp(banner.timer / 40, 0, 1);
    ctx.save();
    ctx.globalAlpha = op;
    const g = ctx.createLinearGradient(W / 2 - 200, 0, W / 2 + 200, 0);
    g.addColorStop(0, '#00ffcc');
    g.addColorStop(1, '#ff00cc');
    ctx.fillStyle = g;
    ctx.font = `bold ${Math.round(64 * S)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 10;
    ctx.fillText(banner.text, W / 2, H / 2 - 80 * S);
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = bgGradient || '#000';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
    drawStars();
    drawPowerups();
    drawAsteroids();
    drawUfos();
    drawBullets();
    if (state !== STATE.START) drawShip();
    drawFx();
    ctx.restore();

    if (state === STATE.PLAYING || state === STATE.PAUSED) {
      drawHUD();
      drawBanner();
    }

    if (fade > 0) {
      ctx.fillStyle = `rgba(0,0,0,${fade})`;
      ctx.fillRect(0, 0, W, H);
      fade = Math.max(0, fade - 0.02);
    }
  }

  /* ------------------------------------------------------------- Laço de jogo */
  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 16.667;
    last = now;
    if (!(dt > 0)) dt = 1;
    dt = Math.min(dt, 4);

    if (state === STATE.PLAYING) {
      const steps = Math.ceil(dt / 1.5); // sub-passos evitam que tiros "atravessem" asteroides
      for (let i = 0; i < steps; i++) update(dt / steps);
    } else if (state === STATE.START || state === STATE.OVER) {
      updateAmbient(dt);
    }
    render();
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------ Entrada */
  const BLOCK_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  document.addEventListener('keydown', e => {
    if (BLOCK_KEYS.has(e.code)) e.preventDefault();
    down.add(e.code);
    if (e.repeat) return;

    switch (e.code) {
      case 'Enter':
        if (state === STATE.START) startGame();
        else if (state === STATE.OVER && performance.now() - overAt > 500) startGame();
        break;
      case 'Escape':
        if (state === STATE.OVER && performance.now() - overAt > 300) showStartScreen();
        else if (state === STATE.PLAYING) pauseGame();
        else if (state === STATE.PAUSED) resumeGame();
        break;
      case 'KeyP':
        if (state === STATE.PLAYING) pauseGame(); else if (state === STATE.PAUSED) resumeGame();
        break;
      case 'KeyH':
        hyperspace();
        break;
      case 'KeyM':
        toggleMute();
        break;
    }
  });

  document.addEventListener('keyup', e => down.delete(e.code));
  window.addEventListener('blur', () => { down.clear(); pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('resize', resize);

  muteIcon.addEventListener('click', toggleMute);
  document.getElementById('pauseIcon').addEventListener('click', () => {
    if (state === STATE.PLAYING) pauseGame(); else if (state === STATE.PAUSED) resumeGame();
  });
  document.getElementById('startScreen').addEventListener('click', () => { if (state === STATE.START) startGame(); });
  document.getElementById('pauseScreen').addEventListener('click', resumeGame);
  document.getElementById('gameOverScreen').addEventListener('click', () => {
    if (state === STATE.OVER && performance.now() - overAt > 500) startGame();
  });

  // Controles de toque
  document.querySelectorAll('#touchControls button').forEach(btn => {
    const code = btn.dataset.key;
    const press = e => { e.preventDefault(); if (code === 'Hyper') hyperspace(); else down.add(code); };
    const release = e => { e.preventDefault(); down.delete(code); };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('contextmenu', e => e.preventDefault());
  });

  /* ---------------------------------------------------------------- Iniciar */
  updateMuteIcon();
  resize();
  showStartScreen();
  requestAnimationFrame(frame);
})();
