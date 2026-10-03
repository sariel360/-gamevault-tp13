/* ============================================================
   TP10 - Laboratorio de Programación 6° G
   Juego: ASTEROIDES (Nave Espacial)

   Figuras complejas usadas (mínimo 3 requeridas):
     1) LÍNEAS (moveTo/lineTo, lineCap, lineJoin)  -> nave espacial
     2) ARCOS  (arc)                               -> asteroides y llama del motor
     3) ESPIRAL (paramétrica r = a*theta)           -> efecto de explosión
     4) ESTRELLA (5 puntas)                        -> power-ups

   Mejoras de la versión anterior:
     - Power-ups temporales de disparo: "disparo rápido" y "triple disparo".
     - Área de juego delimitada: la nave no puede salir del canvas.
     - Cadencia de disparo limitada con un cooldown.

   Nuevas mejoras de esta versión:
     - CONFIG centralizado: todos los "números mágicos" (velocidades,
       radios, duraciones) viven en un solo objeto, fácil de ajustar.
     - Movimiento independiente del framerate (delta time): el juego se
       ve igual de rápido en una pantalla de 60Hz que en una de 144Hz.
     - Pausa (tecla P o Escape).
     - Récord persistente entre partidas (localStorage).
     - Sonido sintetizado con Web Audio API (sin archivos externos) y
       botón para silenciar.
     - Texto flotante de puntaje, sacudida de cámara al chocar y aviso
       de "nivel siguiente" para mejor feedback visual.
     - Se ya no puede hacer scroll de la página con las flechas/espacio
       mientras se juega.
   ============================================================ */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;

// =====================================================
// CONFIGURACIÓN CENTRALIZADA
// Todos los valores ajustables del juego en un solo lugar.
// Las velocidades/duraciones están expresadas "por frame a 60fps";
// el bucle principal las escala con deltaTime para que el juego
// funcione igual sin importar la frecuencia de refresco de pantalla.
// =====================================================
const CONFIG = {
  ship: {
    radius: 14,
    rotationSpeed: 0.06,
    thrustPower: 0.12,
    friction: 0.99,
    baseMaxSpeed: 6,
    boostedMaxSpeed: 9,
    fireRate: 20,       // frames mínimos entre disparos normales
    rapidFireRate: 6,   // frames mínimos entre disparos con power-up
    respawnInvulnerability: 120,
  },
  bullet: { radius: 2.5, speed: 8, life: 60 },
  asteroid: {
    radiusPerTier: 16,
    baseSpeed: 0.5,
    speedVariance: 1,
    levelSpeedBonus: 0.15,
    bumpCount: 8,
  },
  powerUp: {
    radius: 12,
    life: 400,        // desaparece si no se recoge
    dropChance: 0.15,
    duration: 300,     // duración del efecto al recogerlo (~5s a 60fps)
    driftSpeed: 0.6,
  },
  particle: { duration: 30 },
  floatingText: { duration: 45, riseSpeed: 0.6 },
  shake: { duration: 18, magnitude: 6 },
  levelBanner: { duration: 90 },
};

// ---------- Elementos de UI ----------
const scoreEl = document.getElementById("score-value");
const livesEl = document.getElementById("lives-value");
const levelEl = document.getElementById("level-value");
const highScoreEl = document.getElementById("highscore-value");
const startScreen = document.getElementById("start-screen");
const gameoverScreen = document.getElementById("gameover-screen");
const pauseScreen = document.getElementById("pause-screen");
const finalScoreEl = document.getElementById("final-score");
const newRecordEl = document.getElementById("new-record");
const startBtn = document.getElementById("start-btn");
const restartBtn = document.getElementById("restart-btn");
const muteBtn = document.getElementById("mute-btn");

// ---------- Estado general del juego ----------
let keys = {};
let bullets = [];
let asteroids = [];
let particles = [];
let powerUps = [];
let floatingTexts = [];
let score = 0;
let lives = 3;
let level = 1;
let gameState = "start"; // "start" | "playing" | "gameover"
let isPaused = false;
let shieldActive = false;
let shieldTimer = 0;
let speedBoostTimer = 0;
let rapidFireTimer = 0;   // mejora temporal: dispara con menor cooldown
let tripleShotTimer = 0;  // mejora temporal: dispara 3 balas en abanico
let shakeTimer = 0;
let levelBannerTimer = 0;

const HIGH_SCORE_KEY = "asteroides_tp10_highscore";
let highScore = loadHighScore();

// =====================================================
// AUDIO (sintetizado con Web Audio API — sin archivos externos)
// =====================================================
let audioCtx = null;
let soundEnabled = true;

function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) audioCtx = new AudioContextClass();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTone({ freq, duration, type = "square", volume = 0.15, slideTo = null }) {
  if (!soundEnabled) return;
  const ac = ensureAudioContext();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (slideTo !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), ac.currentTime + duration);
  }
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

const sfx = {
  shoot: () => playTone({ freq: 880, duration: 0.07, type: "square", volume: 0.07, slideTo: 440 }),
  explosion: () => playTone({ freq: 140, duration: 0.22, type: "sawtooth", volume: 0.16, slideTo: 40 }),
  hit: () => playTone({ freq: 220, duration: 0.3, type: "triangle", volume: 0.2, slideTo: 50 }),
  shieldBlock: () => playTone({ freq: 660, duration: 0.12, type: "sine", volume: 0.15, slideTo: 990 }),
  powerUp: () => playTone({ freq: 440, duration: 0.15, type: "sine", volume: 0.15, slideTo: 880 }),
  levelUp: () => playTone({ freq: 523, duration: 0.35, type: "sine", volume: 0.18, slideTo: 1047 }),
  gameOver: () => playTone({ freq: 300, duration: 0.6, type: "sawtooth", volume: 0.2, slideTo: 60 }),
};

// =====================================================
// FUNCIONES DE DIBUJO DE FIGURAS COMPLEJAS (helpers)
// =====================================================

// --- Figura: ESTRELLA (usada para los power-ups) ---
function drawStar(cx, cy, spikes, outerRadius, innerRadius, rotation, color) {
  let rot = (Math.PI / 2) * 3 + rotation;
  const step = Math.PI / spikes;

  ctx.beginPath();
  ctx.moveTo(cx, cy - outerRadius);
  for (let i = 0; i < spikes; i++) {
    let x = cx + Math.cos(rot) * outerRadius;
    let y = cy + Math.sin(rot) * outerRadius;
    ctx.lineTo(x, y);
    rot += step;

    x = cx + Math.cos(rot) * innerRadius;
    y = cy + Math.sin(rot) * innerRadius;
    ctx.lineTo(x, y);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerRadius);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// --- Figura: ESPIRAL (usada en el efecto de explosión) ---
// Dibuja una espiral paramétrica: r crece con el ángulo (r = a * theta)
function drawSpiral(cx, cy, radius, turns, progress, color) {
  const a = radius / (turns * Math.PI * 2);
  ctx.beginPath();
  const totalAngle = turns * Math.PI * 2 * progress;
  for (let theta = 0; theta <= totalAngle; theta += 0.15) {
    const r = a * theta;
    const x = cx + r * Math.cos(theta);
    const y = cy + r * Math.sin(theta);
    if (theta === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
}

// =====================================================
// CLASE: NAVE (usa LÍNEAS - lineTo, lineCap, lineJoin)
// =====================================================
class Ship {
  constructor() {
    this.x = W / 2;
    this.y = H / 2;
    this.radius = CONFIG.ship.radius;
    this.angle = -Math.PI / 2; // apunta hacia arriba
    this.velocity = { x: 0, y: 0 };
    this.thrusting = false;
    this.invulnerable = 0; // "frames" de invulnerabilidad tras respawn
    this.shootCooldown = 0;
  }

  update(dt) {
    if (keys["ArrowLeft"] || keys["a"]) this.angle -= CONFIG.ship.rotationSpeed * dt;
    if (keys["ArrowRight"] || keys["d"]) this.angle += CONFIG.ship.rotationSpeed * dt;

    this.thrusting = keys["ArrowUp"] || keys["w"];
    const maxSpeed = speedBoostTimer > 0 ? CONFIG.ship.boostedMaxSpeed : CONFIG.ship.baseMaxSpeed;

    if (this.thrusting) {
      this.velocity.x += Math.cos(this.angle) * CONFIG.ship.thrustPower * dt;
      this.velocity.y += Math.sin(this.angle) * CONFIG.ship.thrustPower * dt;
      const speed = Math.hypot(this.velocity.x, this.velocity.y);
      if (speed > maxSpeed) {
        this.velocity.x = (this.velocity.x / speed) * maxSpeed;
        this.velocity.y = (this.velocity.y / speed) * maxSpeed;
      }
    }

    // Fricción exponencial: Math.pow adapta la desaceleración al tiempo
    // real transcurrido, no solo a la cantidad de frames.
    const frictionFactor = Math.pow(CONFIG.ship.friction, dt);
    this.velocity.x *= frictionFactor;
    this.velocity.y *= frictionFactor;
    this.x += this.velocity.x * dt;
    this.y += this.velocity.y * dt;

    // Área de juego delimitada: a diferencia de asteroides/balas/power-ups
    // (que sí dan la vuelta con wrapAround), la nave queda contenida dentro
    // del canvas. Al chocar contra un borde se frena en ese eje.
    const margin = this.radius;
    if (this.x < margin) {
      this.x = margin;
      this.velocity.x = 0;
    } else if (this.x > W - margin) {
      this.x = W - margin;
      this.velocity.x = 0;
    }
    if (this.y < margin) {
      this.y = margin;
      this.velocity.y = 0;
    } else if (this.y > H - margin) {
      this.y = H - margin;
      this.velocity.y = 0;
    }

    if (this.invulnerable > 0) this.invulnerable = Math.max(0, this.invulnerable - dt);
    if (this.shootCooldown > 0) this.shootCooldown = Math.max(0, this.shootCooldown - dt);
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);

    // Parpadeo si es invulnerable
    if (this.invulnerable > 0 && Math.floor(this.invulnerable / 4) % 2 === 0) {
      ctx.restore();
      return;
    }

    // --- Cuerpo de la nave: LÍNEAS (moveTo/lineTo) ---
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.radius, 0);
    ctx.lineTo(-this.radius * 0.8, this.radius * 0.7);
    ctx.lineTo(-this.radius * 0.4, 0);
    ctx.lineTo(-this.radius * 0.8, -this.radius * 0.7);
    ctx.closePath();
    ctx.strokeStyle = shieldActive ? "#7ce0ff" : "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(124, 224, 255, 0.15)";
    ctx.fill();

    // --- Llama del motor: ARCO ---
    if (this.thrusting) {
      ctx.beginPath();
      ctx.arc(-this.radius * 0.6, 0, 4 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fillStyle = "#ffb703";
      ctx.fill();
    }

    // --- Escudo activo: se dibuja con un arco extra ---
    if (shieldActive) {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(124, 224, 255, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.restore();
  }
}

// =====================================================
// CLASE: BALA
// =====================================================
class Bullet {
  constructor(x, y, angle) {
    this.x = x;
    this.y = y;
    this.radius = CONFIG.bullet.radius;
    this.velocity = {
      x: Math.cos(angle) * CONFIG.bullet.speed,
      y: Math.sin(angle) * CONFIG.bullet.speed,
    };
    this.life = CONFIG.bullet.life;
  }

  update(dt) {
    this.x += this.velocity.x * dt;
    this.y += this.velocity.y * dt;
    this.life -= dt;
    wrapAround(this);
  }

  draw() {
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#ffdd57";
    ctx.fill();
  }
}

// =====================================================
// CLASE: ASTEROIDE (usa ARCOS - arc)
// =====================================================
class Asteroid {
  constructor(x, y, tier) {
    this.x = x;
    this.y = y;
    this.tier = tier; // 3 = grande, 2 = mediano, 1 = chico
    this.radius = tier * CONFIG.asteroid.radiusPerTier;
    const speed =
      CONFIG.asteroid.baseSpeed +
      Math.random() * CONFIG.asteroid.speedVariance +
      (level - 1) * CONFIG.asteroid.levelSpeedBonus;
    const angle = Math.random() * Math.PI * 2;
    this.velocity = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
    this.rotation = Math.random() * Math.PI * 2;
    this.rotationSpeed = (Math.random() - 0.5) * 0.03;

    // Pequeñas variaciones de radio para que no sea un círculo perfecto (toque personal)
    this.bumps = [];
    for (let i = 0; i < CONFIG.asteroid.bumpCount; i++) {
      this.bumps.push(0.8 + Math.random() * 0.4);
    }
  }

  update(dt) {
    this.x += this.velocity.x * dt;
    this.y += this.velocity.y * dt;
    this.rotation += this.rotationSpeed * dt;
    wrapAround(this);
  }

  draw() {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    // --- Cuerpo del asteroide: ARCO (círculo irregular por "bumps") ---
    ctx.beginPath();
    const segs = this.bumps.length;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const r = this.radius * this.bumps[i % segs];
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.strokeStyle = "#9fb4c7";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(159, 180, 199, 0.12)";
    ctx.fill();

    // Cráteres: arcos pequeños decorativos
    ctx.beginPath();
    ctx.arc(this.radius * 0.2, -this.radius * 0.2, this.radius * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // Divide el asteroide en dos más chicos (si corresponde)
  split() {
    const fragments = [];
    if (this.tier > 1) {
      for (let i = 0; i < 2; i++) {
        fragments.push(new Asteroid(this.x, this.y, this.tier - 1));
      }
    }
    return fragments;
  }
}

// =====================================================
// CLASE: PARTÍCULA DE EXPLOSIÓN (usa ESPIRAL)
// =====================================================
class ExplosionParticle {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.maxRadius = 25 + Math.random() * 15;
    this.turns = 2 + Math.random();
    this.age = 0;
    this.duration = CONFIG.particle.duration;
  }

  update(dt) {
    this.age += dt;
  }

  get finished() {
    return this.age >= this.duration;
  }

  draw() {
    const progress = Math.min(this.age / this.duration, 1);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    drawSpiral(this.x, this.y, this.maxRadius, this.turns, progress, this.color);
    ctx.restore();
  }
}

// =====================================================
// CLASE: POWER-UP (usa ESTRELLA)
// =====================================================
class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    const types = Object.keys(POWERUP_TYPES);
    this.type = types[Math.floor(Math.random() * types.length)];
    this.radius = CONFIG.powerUp.radius;
    this.rotation = 0;
    const angle = Math.random() * Math.PI * 2;
    this.velocity = {
      x: Math.cos(angle) * CONFIG.powerUp.driftSpeed,
      y: Math.sin(angle) * CONFIG.powerUp.driftSpeed,
    };
    this.life = CONFIG.powerUp.life;
  }

  update(dt) {
    this.x += this.velocity.x * dt;
    this.y += this.velocity.y * dt;
    this.rotation += 0.04 * dt;
    this.life -= dt;
    wrapAround(this);
  }

  draw() {
    drawStar(this.x, this.y, 5, this.radius, this.radius * 0.45, this.rotation, POWERUP_TYPES[this.type].color);
  }
}

// =====================================================
// CLASE: TEXTO FLOTANTE (feedback de puntaje al destruir asteroides)
// =====================================================
class FloatingText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.age = 0;
    this.duration = CONFIG.floatingText.duration;
  }

  update(dt) {
    this.age += dt;
    this.y -= CONFIG.floatingText.riseSpeed * dt;
  }

  get finished() {
    return this.age >= this.duration;
  }

  draw() {
    const progress = Math.min(this.age / this.duration, 1);
    ctx.save();
    ctx.globalAlpha = 1 - progress;
    ctx.fillStyle = this.color;
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.textAlign = "center";
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

// =====================================================
// TIPOS DE POWER-UP
// Un único lugar con el color, la etiqueta del HUD y el efecto de
// cada power-up (antes esta información estaba duplicada entre la
// clase PowerUp, el HUD y la lógica de colisión).
// =====================================================
const POWERUP_TYPES = {
  shield: {
    label: "ESCUDO",
    color: "#7ce0ff",
    apply: () => {
      shieldTimer = CONFIG.powerUp.duration;
      shieldActive = true;
    },
  },
  speed: {
    label: "VELOCIDAD",
    color: "#ffb703",
    apply: () => {
      speedBoostTimer = CONFIG.powerUp.duration;
    },
  },
  rapidfire: {
    label: "DISPARO RÁPIDO",
    color: "#ff5d5d",
    apply: () => {
      rapidFireTimer = CONFIG.powerUp.duration;
    },
  },
  triple: {
    label: "TRIPLE DISPARO",
    color: "#7cff9e",
    apply: () => {
      tripleShotTimer = CONFIG.powerUp.duration;
    },
  },
};

// =====================================================
// UTILIDADES
// =====================================================
function wrapAround(obj) {
  if (obj.x < -obj.radius) obj.x = W + obj.radius;
  if (obj.x > W + obj.radius) obj.x = -obj.radius;
  if (obj.y < -obj.radius) obj.y = H + obj.radius;
  if (obj.y > H + obj.radius) obj.y = -obj.radius;
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function spawnAsteroids(count) {
  for (let i = 0; i < count; i++) {
    let x, y;
    let attempts = 0;
    // Que no aparezcan encima de la nave (con un límite de intentos
    // por seguridad, para no quedar en un bucle infinito en un caso límite)
    do {
      x = Math.random() * W;
      y = Math.random() * H;
      attempts++;
    } while (ship && distance({ x, y }, ship) < 150 && attempts < 50);
    asteroids.push(new Asteroid(x, y, 3));
  }
}

function explode(x, y, color, count = 1) {
  for (let i = 0; i < count; i++) {
    particles.push(new ExplosionParticle(x, y, color));
  }
}

function loadHighScore() {
  try {
    return Number(localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch (e) {
    // localStorage puede no estar disponible (ej. archivo abierto
    // localmente en algunos navegadores); el juego sigue funcionando,
    // simplemente no persiste el récord entre partidas.
    return 0;
  }
}

function saveHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch (e) {
    /* no-op: ver comentario en loadHighScore */
  }
}

// =====================================================
// INICIALIZACIÓN / CONTROLES
// =====================================================
let ship = null;

function startGame() {
  ensureAudioContext(); // primer gesto del usuario: habilita el audio

  ship = new Ship();
  bullets = [];
  asteroids = [];
  particles = [];
  powerUps = [];
  floatingTexts = [];
  score = 0;
  lives = 3;
  level = 1;
  shieldActive = false;
  shieldTimer = 0;
  speedBoostTimer = 0;
  rapidFireTimer = 0;
  tripleShotTimer = 0;
  shakeTimer = 0;
  levelBannerTimer = 0;
  isPaused = false;
  updateHUD();

  spawnAsteroids(3 + level);
  gameState = "playing";
  startScreen.classList.add("hidden");
  gameoverScreen.classList.add("hidden");
  pauseScreen.classList.add("hidden");
}

function endGame() {
  gameState = "gameover";
  isPaused = false;
  pauseScreen.classList.add("hidden");

  const isNewRecord = score > highScore;
  if (isNewRecord) {
    highScore = score;
    saveHighScore(highScore);
  }

  finalScoreEl.textContent = score;
  newRecordEl.classList.toggle("hidden", !isNewRecord);
  updateHUD();
  sfx.gameOver();
  gameoverScreen.classList.remove("hidden");
}

function updateHUD() {
  scoreEl.textContent = score;
  livesEl.textContent = lives;
  levelEl.textContent = level;
  highScoreEl.textContent = highScore;
}

function togglePause() {
  if (gameState !== "playing") return;
  isPaused = !isPaused;
  pauseScreen.classList.toggle("hidden", !isPaused);
}

window.addEventListener("keydown", (e) => {
  keys[e.key] = true;

  // Evita que las flechas/espacio hagan scroll de la página mientras se juega.
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
    e.preventDefault();
  }

  if (e.key === " ") shoot();
  if (e.key === "p" || e.key === "P" || e.key === "Escape") togglePause();
});
window.addEventListener("keyup", (e) => {
  keys[e.key] = false;
});

function shoot() {
  if (gameState !== "playing" || isPaused || !ship) return;
  if (ship.shootCooldown > 0) return; // respeta la cadencia máxima de disparo

  // Mejora "disparo rápido": reduce el cooldown entre disparos.
  ship.shootCooldown = rapidFireTimer > 0 ? CONFIG.ship.rapidFireRate : CONFIG.ship.fireRate;
  sfx.shoot();

  if (tripleShotTimer > 0) {
    // Mejora "triple disparo": 3 balas en abanico en vez de una sola.
    const spread = 0.18; // radianes de separación entre cada bala
    [-spread, 0, spread].forEach((offset) => {
      const angle = ship.angle + offset;
      const tipX = ship.x + Math.cos(angle) * ship.radius;
      const tipY = ship.y + Math.sin(angle) * ship.radius;
      bullets.push(new Bullet(tipX, tipY, angle));
    });
  } else {
    const tipX = ship.x + Math.cos(ship.angle) * ship.radius;
    const tipY = ship.y + Math.sin(ship.angle) * ship.radius;
    bullets.push(new Bullet(tipX, tipY, ship.angle));
  }
}

startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", startGame);
muteBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  muteBtn.textContent = soundEnabled ? "🔊" : "🔇";
  muteBtn.setAttribute("aria-label", soundEnabled ? "Silenciar sonido" : "Activar sonido");
});

// =====================================================
// LOOP PRINCIPAL DEL JUEGO
// =====================================================

// dt ("delta time") representa cuántos "frames de 60fps equivalentes"
// pasaron desde el frame anterior. A 60Hz, dt ≈ 1 (igual que antes).
// A 144Hz, dt ≈ 0.42, y a 30Hz, dt ≈ 2: multiplicando cada movimiento
// por dt, el juego avanza a la misma velocidad real sin importar la
// frecuencia de refresco de la pantalla. Se limita a un máximo de 3
// para evitar saltos grandes (ej. al volver de otra pestaña).
function update(dt) {
  if (gameState !== "playing" || isPaused) return;

  ship.update(dt);
  if (shieldTimer > 0) {
    shieldTimer = Math.max(0, shieldTimer - dt);
    shieldActive = shieldTimer > 0;
  }
  if (speedBoostTimer > 0) speedBoostTimer = Math.max(0, speedBoostTimer - dt);
  if (rapidFireTimer > 0) rapidFireTimer = Math.max(0, rapidFireTimer - dt);
  if (tripleShotTimer > 0) tripleShotTimer = Math.max(0, tripleShotTimer - dt);
  if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
  if (levelBannerTimer > 0) levelBannerTimer = Math.max(0, levelBannerTimer - dt);

  bullets.forEach((b) => b.update(dt));
  bullets = bullets.filter((b) => b.life > 0);

  asteroids.forEach((a) => a.update(dt));
  powerUps.forEach((p) => p.update(dt));
  powerUps = powerUps.filter((p) => p.life > 0);
  particles.forEach((p) => p.update(dt));
  particles = particles.filter((p) => !p.finished);
  floatingTexts.forEach((t) => t.update(dt));
  floatingTexts = floatingTexts.filter((t) => !t.finished);

  // Colisión bala-asteroide
  for (let i = asteroids.length - 1; i >= 0; i--) {
    const a = asteroids[i];
    for (let j = bullets.length - 1; j >= 0; j--) {
      const b = bullets[j];
      if (distance(a, b) < a.radius) {
        const points = a.tier === 3 ? 20 : a.tier === 2 ? 50 : 100;
        score += points;
        explode(a.x, a.y, "#ffb703", 2 + a.tier);
        floatingTexts.push(new FloatingText(a.x, a.y, `+${points}`, "#ffdd57"));
        sfx.explosion();

        const fragments = a.split();
        asteroids.splice(i, 1, ...fragments);
        bullets.splice(j, 1);

        // Probabilidad de soltar power-up
        if (Math.random() < CONFIG.powerUp.dropChance) {
          powerUps.push(new PowerUp(a.x, a.y));
        }
        updateHUD();
        break;
      }
    }
  }

  // Colisión nave-asteroide
  if (ship.invulnerable === 0) {
    for (let i = asteroids.length - 1; i >= 0; i--) {
      const a = asteroids[i];
      if (distance(a, ship) < a.radius + ship.radius * 0.6) {
        if (shieldActive) {
          // El escudo absorbe el impacto: destruye el asteroide sin perder vida
          explode(a.x, a.y, "#7ce0ff", 3);
          asteroids.splice(i, 1, ...a.split());
          sfx.shieldBlock();
        } else {
          lives--;
          explode(ship.x, ship.y, "#ff5d5d", 4);
          shakeTimer = CONFIG.shake.duration;
          sfx.hit();
          ship.x = W / 2;
          ship.y = H / 2;
          ship.velocity = { x: 0, y: 0 };
          ship.invulnerable = CONFIG.ship.respawnInvulnerability;
          updateHUD();
          if (lives <= 0) {
            endGame();
          }
        }
        break;
      }
    }
  }

  // Colisión nave-powerUp
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const p = powerUps[i];
    if (distance(p, ship) < p.radius + ship.radius) {
      POWERUP_TYPES[p.type].apply();
      sfx.powerUp();
      powerUps.splice(i, 1);
    }
  }

  // Nivel siguiente
  if (asteroids.length === 0) {
    level++;
    levelBannerTimer = CONFIG.levelBanner.duration;
    sfx.levelUp();
    updateHUD();
    spawnAsteroids(3 + level);
  }
}

// Fondo estático de estrellas decorativas (puntos), dibujado una sola vez sobre un canvas offscreen
let starfield = null;
function buildStarfield() {
  const bg = document.createElement("canvas");
  bg.width = W;
  bg.height = H;
  const bgCtx = bg.getContext("2d");
  bgCtx.fillStyle = "#ffffff";
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H;
    const r = Math.random() * 1.3;
    bgCtx.globalAlpha = Math.random() * 0.8 + 0.2;
    bgCtx.beginPath();
    bgCtx.arc(x, y, r, 0, Math.PI * 2);
    bgCtx.fill();
  }
  return bg;
}

// Muestra en una esquina del canvas qué power-ups temporales están activos
function drawPowerUpStatus() {
  const items = [];
  if (shieldActive) items.push(POWERUP_TYPES.shield);
  if (speedBoostTimer > 0) items.push(POWERUP_TYPES.speed);
  if (rapidFireTimer > 0) items.push(POWERUP_TYPES.rapidfire);
  if (tripleShotTimer > 0) items.push(POWERUP_TYPES.triple);
  if (items.length === 0) return;

  ctx.save();
  ctx.font = "12px 'Courier New', monospace";
  ctx.textAlign = "left";
  items.forEach((item, i) => {
    ctx.fillStyle = item.color;
    ctx.fillText(`● ${item.label}`, 10, 20 + i * 16);
  });
  ctx.restore();
}

// Aviso grande y temporal de "¡Nivel X!" al limpiar todos los asteroides
function drawLevelBanner() {
  if (levelBannerTimer <= 0) return;
  const progress = 1 - levelBannerTimer / CONFIG.levelBanner.duration;
  const alpha = progress < 0.15 ? progress / 0.15 : progress > 0.7 ? (1 - progress) / 0.3 : 1;

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = "#ffdd57";
  ctx.font = "bold 32px 'Courier New', monospace";
  ctx.textAlign = "center";
  ctx.fillText(`¡NIVEL ${level}!`, W / 2, H / 2 - 40);
  ctx.restore();
}

function draw() {
  ctx.save();

  // Sacudida de cámara al chocar la nave contra un asteroide
  if (shakeTimer > 0) {
    const dx = (Math.random() - 0.5) * CONFIG.shake.magnitude;
    const dy = (Math.random() - 0.5) * CONFIG.shake.magnitude;
    ctx.translate(dx, dy);
  }

  ctx.clearRect(-10, -10, W + 20, H + 20);
  ctx.fillStyle = "#05070f";
  ctx.fillRect(-10, -10, W + 20, H + 20);
  if (starfield) ctx.drawImage(starfield, 0, 0);

  if (gameState === "playing") {
    ship.draw();
    bullets.forEach((b) => b.draw());
    asteroids.forEach((a) => a.draw());
    powerUps.forEach((p) => p.draw());
    particles.forEach((p) => p.draw());
    floatingTexts.forEach((t) => t.draw());
    drawPowerUpStatus();
    drawLevelBanner();
  }

  ctx.restore();
}

let lastTimestamp = 0;
function gameLoop(timestamp) {
  const rawDelta = lastTimestamp ? timestamp - lastTimestamp : 1000 / 60;
  lastTimestamp = timestamp;
  const dt = Math.min(rawDelta / (1000 / 60), 3); // normalizado y con tope de seguridad

  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

starfield = buildStarfield();
updateHUD(); // muestra el récord guardado ya en la pantalla de inicio
requestAnimationFrame(gameLoop);
