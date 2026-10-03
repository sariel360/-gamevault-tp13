"use strict";

/* =========================================================================
   RUSH TRACK
   Mini-juego de esquive en Canvas 2D.
   El jugador cambia de carril para esquivar tráfico y junta cápsulas
   de nitro que le dan un empuje temporal de velocidad y puntaje.

   El archivo está organizado en secciones:
     1. Configuración y referencias al DOM
     2. Estado del juego
     3. Entrada (teclado y clics)
     4. Generación de obstáculos y power-ups
     5. Actualización (lógica por frame)
     6. Dibujo (render por frame)
     7. Bucle principal
   ========================================================================= */

/* ============================ 1. CONFIGURACIÓN ============================ */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const LANE_COUNT = 3;
const LANE_WIDTH = WIDTH / LANE_COUNT;

const PLAYER_WIDTH = 46;
const PLAYER_HEIGHT = 78;
const PLAYER_Y = HEIGHT - PLAYER_HEIGHT - 30;

const BASE_SPEED = 260; // px/seg, velocidad de desplazamiento del camino
const MAX_SPEED = 620;
const SPEED_RAMP_PER_SEC = 3.2; // cuánto sube la velocidad base con el tiempo

const NITRO_MAX = 100;
const NITRO_DRAIN_PER_SEC = 38; // consumo mientras se usa el nitro
const NITRO_REGEN_PER_SEC = 6; // recarga lenta cuando no se usa
const NITRO_PICKUP_AMOUNT = 35;
const NITRO_SPEED_MULTIPLIER = 1.8;

const METERS_PER_PIXEL = 0.05; // conversión de distancia recorrida a "metros" de HUD

// referencias al HUD y overlays
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const nitroFillEl = document.getElementById("nitroFill");
const startOverlay = document.getElementById("startOverlay");
const pauseOverlay = document.getElementById("pauseOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const finalScoreEl = document.getElementById("finalScore");
const newBestMsgEl = document.getElementById("newBestMsg");

const BEST_SCORE_KEY = "rushtrack_best_meters";

/* ============================ 2. ESTADO DEL JUEGO ============================ */

// "start" | "playing" | "paused" | "over"
let gameState = "start";

const player = {
  lane: 1, // carril central al empezar (0, 1 o 2)
  x: laneCenterX(1) - PLAYER_WIDTH / 2,
  y: PLAYER_Y,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
};

let obstacles = []; // { lane, y, width, height, kind: "cone" | "car" }
let pickups = []; // { lane, y, radius }

let distanceMeters = 0;
let bestMeters = Number(localStorage.getItem(BEST_SCORE_KEY)) || 0;
let currentSpeed = BASE_SPEED;
let nitroAmount = NITRO_MAX;
let isBoosting = false;

let obstacleSpawnTimer = 0;
let obstacleSpawnInterval = 1.1; // se recalcula en cada spawn
let pickupSpawnTimer = 0;
let pickupSpawnInterval = 4.5;

let roadScroll = 0; // desplazamiento acumulado de las líneas del camino

let lastTimestamp = 0;

bestEl.innerHTML = `${Math.floor(bestMeters)}<small> m</small>`;

/* ============================ 3. ENTRADA ============================ */

const keysDown = new Set();

window.addEventListener("keydown", (event) => {
  // evita que la página haga scroll con flechas/espacio mientras se juega
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar"].includes(event.key)) {
    event.preventDefault();
  }

  if (event.repeat) return;

  if (gameState === "playing") {
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      moveLane(-1);
    } else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      moveLane(1);
    } else if (event.key.toLowerCase() === "p") {
      pauseGame();
    }
  } else if (gameState === "paused" && event.key.toLowerCase() === "p") {
    resumeGame();
  }

  keysDown.add(event.key);
});

window.addEventListener("keyup", (event) => {
  keysDown.delete(event.key);
});

function isBoostKeyDown() {
  return keysDown.has(" ") || keysDown.has("Spacebar") || keysDown.has("ArrowUp") || keysDown.has("w") || keysDown.has("W");
}

function moveLane(direction) {
  const newLane = player.lane + direction;
  if (newLane >= 0 && newLane < LANE_COUNT) {
    player.lane = newLane;
  }
}

function laneCenterX(laneIndex) {
  return LANE_WIDTH * laneIndex + LANE_WIDTH / 2;
}

// botones con clic del mouse: arrancar, reanudar y reintentar
document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("resumeBtn").addEventListener("click", resumeGame);
document.getElementById("restartBtn").addEventListener("click", startGame);

function startGame() {
  obstacles = [];
  pickups = [];
  distanceMeters = 0;
  currentSpeed = BASE_SPEED;
  nitroAmount = NITRO_MAX;
  player.lane = 1;
  obstacleSpawnTimer = 0;
  pickupSpawnTimer = 0;
  roadScroll = 0;

  hide(startOverlay);
  hide(gameOverOverlay);
  hide(pauseOverlay);
  newBestMsgEl.classList.add("hidden");

  gameState = "playing";
  lastTimestamp = performance.now();
  requestAnimationFrame(loop);
}

function pauseGame() {
  if (gameState !== "playing") return;
  gameState = "paused";
  show(pauseOverlay);
}

function resumeGame() {
  if (gameState !== "paused") return;
  gameState = "playing";
  hide(pauseOverlay);
  lastTimestamp = performance.now();
  requestAnimationFrame(loop);
}

function endGame() {
  gameState = "over";
  finalScoreEl.textContent = Math.floor(distanceMeters);

  if (distanceMeters > bestMeters) {
    bestMeters = distanceMeters;
    localStorage.setItem(BEST_SCORE_KEY, String(bestMeters));
    bestEl.innerHTML = `${Math.floor(bestMeters)}<small> m</small>`;
    newBestMsgEl.classList.remove("hidden");
  } else {
    newBestMsgEl.classList.add("hidden");
  }

  show(gameOverOverlay);
}

function hide(el) {
  el.classList.add("hidden");
}
function show(el) {
  el.classList.remove("hidden");
}

/* ============================ 4. GENERACIÓN ============================ */

function spawnObstacle() {
  // deja como mínimo un carril libre para que siempre haya escapatoria
  const blockedLanes = new Set();
  const obstacleCount = Math.random() < 0.7 ? 1 : 2;
  while (blockedLanes.size < obstacleCount) {
    blockedLanes.add(Math.floor(Math.random() * LANE_COUNT));
  }

  blockedLanes.forEach((lane) => {
    const kind = Math.random() < 0.5 ? "cone" : "car";
    const width = kind === "cone" ? 26 : 44;
    const height = kind === "cone" ? 30 : 70;
    obstacles.push({ lane, y: -height, width, height, kind });
  });
}

function spawnPickup() {
  const lane = Math.floor(Math.random() * LANE_COUNT);
  pickups.push({ lane, y: -24, radius: 14 });
}

/* ============================ 5. ACTUALIZACIÓN ============================ */

function update(dt) {
  // la velocidad base crece lentamente con el tiempo para subir la dificultad
  currentSpeed = Math.min(MAX_SPEED, currentSpeed + SPEED_RAMP_PER_SEC * dt);

  isBoosting = isBoostKeyDown() && nitroAmount > 0;
  const effectiveSpeed = isBoosting ? currentSpeed * NITRO_SPEED_MULTIPLIER : currentSpeed;

  if (isBoosting) {
    nitroAmount = Math.max(0, nitroAmount - NITRO_DRAIN_PER_SEC * dt);
  } else {
    nitroAmount = Math.min(NITRO_MAX, nitroAmount + NITRO_REGEN_PER_SEC * dt);
  }

  distanceMeters += effectiveSpeed * dt * METERS_PER_PIXEL;
  roadScroll += effectiveSpeed * dt;

  // mover al jugador suavemente hacia el centro del carril elegido
  const targetX = laneCenterX(player.lane) - player.width / 2;
  player.x += (targetX - player.x) * Math.min(1, dt * 14);

  // mover obstáculos y descartar los que salieron de pantalla
  obstacles.forEach((obstacle) => {
    obstacle.y += effectiveSpeed * dt;
  });
  obstacles = obstacles.filter((obstacle) => obstacle.y < HEIGHT + 100);

  // mover power-ups
  pickups.forEach((pickup) => {
    pickup.y += effectiveSpeed * dt;
  });
  pickups = pickups.filter((pickup) => pickup.y < HEIGHT + 60);

  // generación programada de obstáculos y power-ups
  obstacleSpawnTimer += dt;
  if (obstacleSpawnTimer >= obstacleSpawnInterval) {
    obstacleSpawnTimer = 0;
    // el intervalo se acorta a medida que aumenta la velocidad
    obstacleSpawnInterval = Math.max(0.55, 1.3 - currentSpeed / 900);
    spawnObstacle();
  }

  pickupSpawnTimer += dt;
  if (pickupSpawnTimer >= pickupSpawnInterval) {
    pickupSpawnTimer = 0;
    pickupSpawnInterval = 4 + Math.random() * 3;
    spawnPickup();
  }

  checkCollisions();
}

function checkCollisions() {
  const playerRect = { x: player.x, y: player.y, width: player.width, height: player.height };

  for (const obstacle of obstacles) {
    const obstacleRect = {
      x: laneCenterX(obstacle.lane) - obstacle.width / 2,
      y: obstacle.y,
      width: obstacle.width,
      height: obstacle.height,
    };
    if (rectsOverlap(playerRect, obstacleRect)) {
      endGame();
      return;
    }
  }

  pickups = pickups.filter((pickup) => {
    const dx = laneCenterX(pickup.lane) - (player.x + player.width / 2);
    const dy = pickup.y - (player.y + player.height / 2);
    const distance = Math.sqrt(dx * dx + dy * dy);
    const collected = distance < pickup.radius + Math.min(player.width, player.height) / 2.4;
    if (collected) {
      nitroAmount = Math.min(NITRO_MAX, nitroAmount + NITRO_PICKUP_AMOUNT);
      distanceMeters += 5; // pequeño bono de puntaje por recolectar
    }
    return !collected;
  });
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/* ============================ 6. DIBUJO ============================ */

function draw() {
  drawRoad();
  drawPickups();
  drawObstacles();
  drawPlayer();
  updateHud();
}

function drawRoad() {
  ctx.fillStyle = "#14171b";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // banquinas laterales
  ctx.fillStyle = "#1d2126";
  ctx.fillRect(0, 0, 10, HEIGHT);
  ctx.fillRect(WIDTH - 10, 0, 10, HEIGHT);

  // líneas divisorias de carril, punteadas y en movimiento
  ctx.strokeStyle = "#ffc93c";
  ctx.lineWidth = 4;
  ctx.setLineDash([26, 22]);
  ctx.lineDashOffset = -roadScroll % 48;

  for (let lane = 1; lane < LANE_COUNT; lane++) {
    const x = LANE_WIDTH * lane;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    const x = laneCenterX(obstacle.lane) - obstacle.width / 2;
    if (obstacle.kind === "cone") {
      drawCone(x, obstacle.y, obstacle.width, obstacle.height);
    } else {
      drawRivalCar(x, obstacle.y, obstacle.width, obstacle.height);
    }
  });
}

function drawCone(x, y, width, height) {
  ctx.fillStyle = "#ff8a3c";
  ctx.beginPath();
  ctx.moveTo(x + width / 2, y);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(x + width * 0.15, y + height * 0.55, width * 0.7, height * 0.14);
}

function drawRivalCar(x, y, width, height) {
  ctx.fillStyle = "#3d4a5c";
  roundRect(x, y, width, height, 8);
  ctx.fill();

  ctx.fillStyle = "#1b232e";
  roundRect(x + width * 0.15, y + height * 0.18, width * 0.7, height * 0.28, 4);
  ctx.fill();

  ctx.fillStyle = "#ff3b30";
  ctx.fillRect(x + width * 0.1, y + height * 0.85, width * 0.18, height * 0.08);
  ctx.fillRect(x + width * 0.72, y + height * 0.85, width * 0.18, height * 0.08);
}

function drawPickups() {
  pickups.forEach((pickup) => {
    const x = laneCenterX(pickup.lane);
    const gradient = ctx.createRadialGradient(x, pickup.y, 2, x, pickup.y, pickup.radius * 1.6);
    gradient.addColorStop(0, "#c8fff9");
    gradient.addColorStop(1, "rgba(76, 224, 210, 0)");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, pickup.y, pickup.radius * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4ce0d2";
    ctx.beginPath();
    ctx.arc(x, pickup.y, pickup.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0d0f12";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("N", x, pickup.y + 1);
  });
}

function drawPlayer() {
  const x = player.x;
  const y = player.y;
  const width = player.width;
  const height = player.height;

  // estela de nitro cuando se está impulsando
  if (isBoosting) {
    const gradient = ctx.createLinearGradient(0, y + height, 0, y + height + 40);
    gradient.addColorStop(0, "rgba(76, 224, 210, 0.75)");
    gradient.addColorStop(1, "rgba(76, 224, 210, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x + width * 0.15, y + height, width * 0.28, 40);
    ctx.fillRect(x + width * 0.57, y + height, width * 0.28, 40);
  }

  ctx.fillStyle = "#ff3b30";
  roundRect(x, y, width, height, 10);
  ctx.fill();

  // parabrisas
  ctx.fillStyle = "#1b232e";
  roundRect(x + width * 0.14, y + height * 0.12, width * 0.72, height * 0.24, 4);
  ctx.fill();

  // faros
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(x + width * 0.08, y + 4, width * 0.18, 6);
  ctx.fillRect(x + width * 0.74, y + 4, width * 0.18, 6);
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function updateHud() {
  scoreEl.innerHTML = `${Math.floor(distanceMeters)}<small> m</small>`;
  const nitroPercent = (nitroAmount / NITRO_MAX) * 100;
  nitroFillEl.style.width = `${nitroPercent}%`;
  nitroFillEl.classList.toggle("boosting", isBoosting);
}

/* ============================ 7. BUCLE PRINCIPAL ============================ */

function loop(timestamp) {
  if (gameState !== "playing") return;

  const dt = Math.min(0.05, (timestamp - lastTimestamp) / 1000); // clamp para evitar saltos si la pestaña pierde foco
  lastTimestamp = timestamp;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

// dibuja un cuadro estático detrás de la pantalla de inicio para que no
// se vea un canvas vacío antes de arrancar
drawRoad();
