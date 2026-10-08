const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const waveElement = document.querySelector("#wave");
const hullElement = document.querySelector("#hull");
const message = document.querySelector("#message");
const messageText = document.querySelector("#message-text");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");
const soundButton = document.querySelector("#sound-button");
const difficultySelect = document.querySelector("#difficulty");
const pulseFill = document.querySelector("#pulse-fill");
const pulseLabel = document.querySelector("#pulse-label");
const pulseMeter = document.querySelector("#pulse-meter");
const touchPulse = document.querySelector("#touch-pulse");
const touchPulseLabel = document.querySelector("#touch-pulse-label");
const toast = document.querySelector("#toast");

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const MAX_HULL = 3;
const PULSE_COST = 100;
const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);
const STORAGE_KEYS = { best: "starfall-last-light-best-v1", sound: "starfall-last-light-sound-v1" };
const FLIGHT_MODES = {
  cadet: { speed: .82, spawn: .84, score: .9 },
  pilot: { speed: 1, spawn: 1, score: 1 },
  ace: { speed: 1.24, spawn: 1.16, score: 1.2 },
};

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* Saving is optional in private browsing. */ }
}

const stars = Array.from({ length: 125 }, () => ({
  x: Math.random() * WIDTH,
  y: Math.random() * HEIGHT,
  size: Math.random() * 1.8 + .25,
  speed: Math.random() * 34 + 9,
  alpha: Math.random() * .62 + .18,
  tint: Math.random() < .18 ? "180 207 255" : "222 240 255",
}));

let ship;
let hazards = [];
let pickups = [];
let particles = [];
let pulseRings = [];
let heldKeys = new Set();
let score = 0;
let survivalScore = 0;
let bonusScore = 0;
let bestScore = Math.max(0, Number(readStorage(STORAGE_KEYS.best, "0")) || 0);
let elapsed = 0;
let wave = 1;
let hull = MAX_HULL;
let pulseCharge = 35;
let shieldTime = 0;
let invulnerableTime = 0;
let hazardTimer = .6;
let pickupTimer = 4.2;
let toastTimer = 0;
let lastTime = 0;
let running = false;
let paused = false;
let animationId;
let audioContext;
let soundEnabled = readStorage(STORAGE_KEYS.sound, "on") !== "off";

bestScoreElement.textContent = bestScore.toLocaleString();
soundButton.textContent = soundEnabled ? "♫ Sound on" : "♫ Sound off";
soundButton.setAttribute("aria-pressed", String(soundEnabled));

function freshShip() {
  return { x: WIDTH / 2, y: HEIGHT * .76, radius: 16, speed: 275, enginePhase: 0 };
}

function resetGame() {
  ship = freshShip();
  hazards = [];
  pickups = [];
  particles = [];
  pulseRings = [];
  elapsed = 0;
  survivalScore = 0;
  bonusScore = 0;
  score = 0;
  wave = 1;
  hull = MAX_HULL;
  pulseCharge = 35;
  shieldTime = 0;
  invulnerableTime = 0;
  hazardTimer = .55;
  pickupTimer = 3.5;
  heldKeys.clear();
  toastTimer = 0;
  toast.classList.remove("show");
  updateHud();
}

function updateHud() {
  score = Math.floor(survivalScore + bonusScore);
  scoreElement.textContent = score.toLocaleString();
  bestScoreElement.textContent = bestScore.toLocaleString();
  waveElement.textContent = String(wave).padStart(2, "0");
  hullElement.textContent = `${"♥ ".repeat(hull)}${"♡ ".repeat(MAX_HULL - hull)}`.trim();
  const charge = Math.min(100, pulseCharge);
  pulseFill.style.width = `${charge}%`;
  pulseLabel.textContent = charge >= PULSE_COST ? "Ready · press SPACE" : `Charging · ${Math.floor(charge)}%`;
  pulseMeter.setAttribute("aria-valuenow", String(Math.floor(charge)));
  touchPulseLabel.textContent = `${Math.floor(charge)}%`;
  touchPulse.disabled = !running || paused || charge < PULSE_COST;
}

function startGame() {
  cancelAnimationFrame(animationId);
  resetGame();
  running = true;
  paused = false;
  lastTime = performance.now();
  message.hidden = true;
  pauseButton.disabled = false;
  pauseButton.textContent = "Pause";
  ensureAudio();
  setToast("OUTPOST LUMA · SIGNAL LOCKED", 2.4);
  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  running = false;
  paused = false;
  heldKeys.clear();
  pauseButton.disabled = true;
  pauseButton.textContent = "Pause";
  cancelAnimationFrame(animationId);
  const earnedBest = score > bestScore;
  if (earnedBest) {
    bestScore = score;
    writeStorage(STORAGE_KEYS.best, bestScore);
  }
  updateHud();
  message.querySelector(".message-kicker").textContent = earnedBest ? "NEW FLIGHT RECORD" : "SIGNAL LOST · FLIGHT LOG RECOVERED";
  message.querySelector("h2").innerHTML = `You made it<br /><em>to sector ${String(wave).padStart(2, "0")}.</em>`;
  messageText.textContent = earnedBest
    ? `Your best flight yet: ${score.toLocaleString()} points. Outpost Luma's signal is still out there.`
    : `Flight score ${score.toLocaleString()}. The black box is saved. Luma is still waiting for a pilot.`;
  startButton.textContent = "Fly again";
  message.hidden = false;
  playSound(180, .25, "triangle", .045);
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  heldKeys.clear();
  pauseButton.textContent = paused ? "Resume" : "Pause";
  touchPulse.disabled = paused || pulseCharge < PULSE_COST;
  if (paused) {
    message.querySelector(".message-kicker").textContent = "FLIGHT SUSPENDED";
    message.querySelector("h2").innerHTML = "The stars<br /><em>can wait.</em>";
    messageText.textContent = "Your ship is holding position. Resume when you are ready.";
    startButton.textContent = "Resume flight";
    message.hidden = false;
  } else {
    message.hidden = true;
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }
}

function setToast(text, duration = 1.5) {
  toast.textContent = text;
  toastTimer = duration;
  toast.classList.add("show");
}

function difficulty() {
  return FLIGHT_MODES[difficultySelect.value] || FLIGHT_MODES.pilot;
}

function ensureAudio() {
  if (!soundEnabled) return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
}

function playSound(frequency, duration = .1, type = "sine", volume = .025) {
  if (!soundEnabled) return;
  ensureAudio();
  if (!audioContext) return;
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(.001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + .012);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + .02);
}

function spawnHazard() {
  if (hazards.length >= 58) return;
  const mode = difficulty();
  const typeRoll = Math.random();
  let type = "rock";
  if (wave >= 2 && typeRoll < .2) type = "comet";
  else if (wave >= 3 && typeRoll > .78) type = "drone";

  const radius = type === "comet" ? 12 + Math.random() * 7 : type === "drone" ? 15 : 16 + Math.random() * 15;
  const x = radius + Math.random() * (WIDTH - radius * 2);
  const baseSpeed = (type === "comet" ? 205 + Math.random() * 70 : type === "drone" ? 92 + Math.random() * 40 : 112 + Math.random() * 92)
    * mode.speed * (1 + (wave - 1) * .075);
  const hazard = {
    type, x, y: -radius - (type === "comet" ? 35 : 5), radius,
    vx: type === "rock" ? (Math.random() - .5) * 38 : 0,
    vy: baseSpeed,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - .5) * 2.3,
    points: makeRockPoints(radius),
    nearMissAwarded: false,
    phase: Math.random() * Math.PI * 2,
    originX: x,
    sway: 45 + Math.random() * 45,
  };
  if (type === "comet") {
    const aim = (ship.x - x) / Math.max(1, Math.hypot(ship.x - x, ship.y));
    hazard.vx = Math.max(-baseSpeed * .7, Math.min(baseSpeed * .7, aim * baseSpeed * .9));
    hazard.vy = Math.sqrt(Math.max(0, baseSpeed * baseSpeed - hazard.vx * hazard.vx));
  }
  hazards.push(hazard);
}

function makeRockPoints(radius) {
  const count = 9;
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2,
    distance: radius * (.72 + Math.random() * .3),
  }));
}

function spawnPickup() {
  const roll = Math.random();
  const type = roll < .36 ? "shield" : roll < .64 ? "repair" : "pulse";
  pickups.push({ type, x: 35 + Math.random() * (WIDTH - 70), y: -20, radius: 14, speed: 54 + Math.random() * 20, phase: Math.random() * Math.PI * 2, age: 0 });
}

function spawnParticles(x, y, color, count = 12, force = 120) {
  for (let i = 0; i < count && particles.length < 220; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = force * (.35 + Math.random() * .8);
    const life = .35 + Math.random() * .55;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size: 1.5 + Math.random() * 3.5, color });
  }
}

function collisionDistance(hazard) {
  return ship.radius * .72 + hazard.radius * (hazard.type === "drone" ? .78 : .72);
}

function takeHit(hazard) {
  hazards.splice(hazards.indexOf(hazard), 1);
  if (shieldTime > 0) {
    bonusScore += 15;
    spawnParticles(hazard.x, hazard.y, "#7af1ea", 13, 150);
    playSound(640, .08, "sine", .025);
    return;
  }
  if (invulnerableTime > 0) return;
  hull -= 1;
  invulnerableTime = 1.35;
  spawnParticles(ship.x, ship.y, "#ff7689", 24, 200);
  setToast(hull > 0 ? "HULL HIT · KEEP FLYING" : "HULL CRITICAL · SIGNAL LOST", 1.35);
  playSound(115, .2, "sawtooth", .04);
  if (hull <= 0) endGame();
}

function collectPickup(pickup) {
  const index = pickups.indexOf(pickup);
  if (index !== -1) pickups.splice(index, 1);
  const colors = { shield: "#6ee8f2", repair: "#9af0a8", pulse: "#f0ce87" };
  spawnParticles(pickup.x, pickup.y, colors[pickup.type], 17, 130);
  if (pickup.type === "shield") {
    shieldTime = Math.max(shieldTime, 6);
    bonusScore += 80;
    setToast("SHIELD ONLINE · 6 SECONDS", 1.5);
    playSound(720, .15, "sine", .03);
  } else if (pickup.type === "repair") {
    if (hull < MAX_HULL) {
      hull += 1;
      setToast("HULL PATCHED · +1 INTEGRITY", 1.5);
      playSound(540, .12, "triangle", .03);
    } else {
      bonusScore += 180;
      setToast("HULL FULL · SUPPLY BONUS +180", 1.5);
      playSound(580, .12, "triangle", .03);
    }
  } else {
    pulseCharge = Math.min(PULSE_COST, pulseCharge + 42);
    bonusScore += 60;
    setToast("PULSE CELL · +42% CHARGE", 1.5);
    playSound(820, .12, "sine", .03);
  }
}

function activatePulse() {
  if (!running || paused || pulseCharge < PULSE_COST) return;
  pulseCharge = 0;
  const radius = 300;
  let cleared = 0;
  hazards = hazards.filter((hazard) => {
    if (Math.hypot(hazard.x - ship.x, hazard.y - ship.y) <= radius) {
      spawnParticles(hazard.x, hazard.y, hazard.type === "comet" ? "#ffbc7a" : "#a8d9ff", 8, 175);
      cleared += 1;
      return false;
    }
    return true;
  });
  if (cleared) bonusScore += cleared * 25;
  pulseRings.push({ x: ship.x, y: ship.y, radius: 0, life: .55, maxLife: .55 });
  setToast(cleared ? `STAR PULSE · ${cleared} THREAT${cleared === 1 ? "" : "S"} CLEARED` : "STAR PULSE · FIELD DISPERSED", 1.5);
  playSound(250, .38, "sine", .055);
  setTimeout(() => playSound(520, .23, "triangle", .035), 70);
  updateHud();
}

function update(delta) {
  const mode = difficulty();
  elapsed += delta;
  survivalScore += delta * 12 * mode.score;
  pulseCharge = Math.min(PULSE_COST, pulseCharge + delta * 2.25);
  shieldTime = Math.max(0, shieldTime - delta);
  invulnerableTime = Math.max(0, invulnerableTime - delta);

  const horizontal = Number(heldKeys.has("ArrowRight") || heldKeys.has("KeyD")) - Number(heldKeys.has("ArrowLeft") || heldKeys.has("KeyA"));
  const vertical = Number(heldKeys.has("ArrowDown") || heldKeys.has("KeyS")) - Number(heldKeys.has("ArrowUp") || heldKeys.has("KeyW"));
  const length = Math.hypot(horizontal, vertical) || 1;
  ship.x += (horizontal / length) * ship.speed * delta;
  ship.y += (vertical / length) * ship.speed * delta;
  ship.x = Math.max(ship.radius + 2, Math.min(WIDTH - ship.radius - 2, ship.x));
  ship.y = Math.max(ship.radius + 2, Math.min(HEIGHT - ship.radius - 2, ship.y));
  ship.enginePhase += delta * 18;

  const nextWave = Math.floor(elapsed / 18) + 1;
  if (nextWave !== wave) {
    wave = nextWave;
    setToast(`SECTOR ${String(wave).padStart(2, "0")} · HOSTILE ACTIVITY RISING`, 2);
    playSound(420 + wave * 18, .18, "triangle", .025);
  }

  hazardTimer -= delta;
  if (hazardTimer <= 0) {
    spawnHazard();
    hazardTimer = Math.max(.34, .94 - (wave - 1) * .055) / mode.spawn + Math.random() * .19;
  }
  pickupTimer -= delta;
  if (pickupTimer <= 0) {
    spawnPickup();
    pickupTimer = Math.max(4.5, 7.2 - elapsed / 100) + Math.random() * 2;
  }

  for (let i = hazards.length - 1; i >= 0; i -= 1) {
    const hazard = hazards[i];
    hazard.x += hazard.vx * delta;
    hazard.y += hazard.vy * delta;
    hazard.rotation += hazard.rotationSpeed * delta;
    if (hazard.type === "drone") {
      hazard.x = hazard.originX + Math.sin(elapsed * 2.4 + hazard.phase) * hazard.sway;
      hazard.x = Math.max(hazard.radius, Math.min(WIDTH - hazard.radius, hazard.x));
    }
    if (hazard.y - hazard.radius > HEIGHT + 8) { hazards.splice(i, 1); continue; }

    const distance = Math.hypot(ship.x - hazard.x, ship.y - hazard.y);
    const impactDistance = collisionDistance(hazard);
    if (!hazard.nearMissAwarded && distance > impactDistance && distance < impactDistance + 22) {
      hazard.nearMissAwarded = true;
      bonusScore += 35;
      pulseCharge = Math.min(PULSE_COST, pulseCharge + 7);
      spawnParticles(hazard.x, hazard.y, "#ffda9a", 5, 75);
      setToast("NEAR MISS · +35 FLIGHT SCORE", .9);
    }
    if (distance <= impactDistance) {
      if (shieldTime > 0) { takeHit(hazard); continue; }
      if (invulnerableTime <= 0) {
        takeHit(hazard);
        if (hull <= 0) break;
        continue;
      }
    }
  }

  for (let i = pickups.length - 1; i >= 0; i -= 1) {
    const pickup = pickups[i];
    pickup.y += pickup.speed * delta;
    pickup.age += delta;
    pickup.x += Math.sin(pickup.age * 2.4 + pickup.phase) * 14 * delta;
    if (pickup.y - pickup.radius > HEIGHT + 8) { pickups.splice(i, 1); continue; }
    if (Math.hypot(ship.x - pickup.x, ship.y - pickup.y) < ship.radius + pickup.radius) collectPickup(pickup);
  }

  for (const star of stars) {
    star.y += star.speed * delta;
    if (star.y > HEIGHT) { star.y = 0; star.x = Math.random() * WIDTH; }
  }
  particles = particles.filter((particle) => {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.vx *= Math.max(0, 1 - 2.5 * delta);
    particle.vy *= Math.max(0, 1 - 2.5 * delta);
    particle.life -= delta;
    return particle.life > 0;
  });
  for (const ring of pulseRings) { ring.radius += 560 * delta; ring.life -= delta; }
  pulseRings = pulseRings.filter((ring) => ring.life > 0);
  toastTimer = Math.max(0, toastTimer - delta);
  if (toastTimer === 0) toast.classList.remove("show");
  updateHud();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  sky.addColorStop(0, "#101c3c"); sky.addColorStop(.5, "#090f24"); sky.addColorStop(1, "#17102e");
  ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const nebula = ctx.createRadialGradient(WIDTH * .23, HEIGHT * .36, 4, WIDTH * .23, HEIGHT * .36, 250);
  nebula.addColorStop(0, "rgb(44 105 146 / 14%)"); nebula.addColorStop(1, "rgb(44 105 146 / 0%)");
  ctx.fillStyle = nebula; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const nebulaTwo = ctx.createRadialGradient(WIDTH * .83, HEIGHT * .62, 3, WIDTH * .83, HEIGHT * .62, 230);
  nebulaTwo.addColorStop(0, "rgb(126 54 132 / 11%)"); nebulaTwo.addColorStop(1, "rgb(126 54 132 / 0%)");
  ctx.fillStyle = nebulaTwo; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const star of stars) { ctx.fillStyle = `rgb(${star.tint} / ${star.alpha})`; ctx.fillRect(star.x, star.y, star.size, star.size); }
  ctx.strokeStyle = "rgb(116 162 204 / 5%)"; ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
}

function drawRock(hazard) {
  ctx.save(); ctx.translate(hazard.x, hazard.y); ctx.rotate(hazard.rotation);
  ctx.beginPath();
  hazard.points.forEach((point, index) => {
    const x = Math.cos(point.angle) * point.distance;
    const y = Math.sin(point.angle) * point.distance;
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath(); ctx.fillStyle = "#84685f"; ctx.fill();
  ctx.strokeStyle = "#f0aa7d"; ctx.lineWidth = 2; ctx.shadowColor = "#df795d"; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.arc(-hazard.radius * .22, -hazard.radius * .1, hazard.radius * .18, 0, Math.PI * 2); ctx.fillStyle = "#4b414b"; ctx.fill();
  ctx.restore();
}

function drawHazard(hazard) {
  if (hazard.type === "rock") { drawRock(hazard); return; }
  if (hazard.type === "comet") {
    const trail = ctx.createLinearGradient(hazard.x - hazard.vx * .12, hazard.y - hazard.vy * .12, hazard.x, hazard.y);
    trail.addColorStop(0, "rgb(255 111 89 / 0%)"); trail.addColorStop(1, "rgb(255 183 103 / 65%)");
    ctx.strokeStyle = trail; ctx.lineWidth = hazard.radius * .85; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(hazard.x - hazard.vx * .16, hazard.y - hazard.vy * .16); ctx.lineTo(hazard.x, hazard.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius, 0, Math.PI * 2); ctx.fillStyle = "#ffe1a3"; ctx.shadowColor = "#ff855c"; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, hazard.radius * .48, 0, Math.PI * 2); ctx.fillStyle = "#fff8de"; ctx.fill();
    return;
  }
  ctx.save(); ctx.translate(hazard.x, hazard.y); ctx.rotate(hazard.rotation);
  ctx.shadowColor = "#f575a6"; ctx.shadowBlur = 15; ctx.fillStyle = "#e46e98";
  ctx.beginPath(); ctx.moveTo(0, -hazard.radius); ctx.lineTo(hazard.radius * .88, 0); ctx.lineTo(0, hazard.radius); ctx.lineTo(-hazard.radius * .88, 0); ctx.closePath(); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = "#fff0f4"; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
}

function drawPickup(pickup) {
  const colors = { shield: "#69e2ef", repair: "#9eeca5", pulse: "#f1ca7d" };
  const color = colors[pickup.type];
  const bob = Math.sin(pickup.age * 4 + pickup.phase) * 3;
  ctx.save(); ctx.translate(pickup.x, pickup.y + bob); ctx.shadowColor = color; ctx.shadowBlur = 18; ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "rgb(9 17 34 / 90%)"; ctx.fill(); ctx.shadowBlur = 0;
  ctx.fillStyle = color; ctx.font = "700 15px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(pickup.type === "shield" ? "S" : pickup.type === "repair" ? "+" : "✦", 0, 1); ctx.restore();
}

function drawShip() {
  ctx.save(); ctx.translate(ship.x, ship.y);
  if (invulnerableTime > 0 && Math.floor(invulnerableTime * 12) % 2 === 0) ctx.globalAlpha = .42;
  const flame = 12 + Math.sin(ship.enginePhase) * 5;
  ctx.beginPath(); ctx.moveTo(-5, 11); ctx.lineTo(0, 11 + flame); ctx.lineTo(5, 11); ctx.closePath(); ctx.fillStyle = "#f19c73"; ctx.shadowColor = "#ff9c72"; ctx.shadowBlur = 16; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -ship.radius * 1.4); ctx.lineTo(ship.radius * .82, ship.radius * .82); ctx.lineTo(0, ship.radius * .48); ctx.lineTo(-ship.radius * .82, ship.radius * .82); ctx.closePath();
  ctx.fillStyle = "#8cebe9"; ctx.shadowColor = "#67f5f0"; ctx.shadowBlur = 20; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = "#e7ffff"; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = "#f0cd8e"; ctx.fillRect(-2, -5, 4, 11);
  if (shieldTime > 0) {
    ctx.beginPath(); ctx.arc(0, 0, 28 + Math.sin(elapsed * 10) * 2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgb(105 226 239 / ${.6 + Math.sin(elapsed * 8) * .16})`; ctx.lineWidth = 2; ctx.shadowColor = "#69e2ef"; ctx.shadowBlur = 17; ctx.stroke();
  }
  ctx.restore();
}

function drawEffects() {
  for (const ring of pulseRings) {
    ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgb(255 225 159 / ${Math.max(0, ring.life / ring.maxLife)})`; ctx.lineWidth = 4; ctx.shadowColor = "#f5d48e"; ctx.shadowBlur = 20; ctx.stroke(); ctx.shadowBlur = 0;
  }
  for (const particle of particles) {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife); ctx.fillStyle = particle.color; ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  drawBackground();
  for (const pickup of pickups) drawPickup(pickup);
  for (const hazard of hazards) drawHazard(hazard);
  drawEffects(); drawShip();
  if (running && !paused && shieldTime > 0) {
    ctx.fillStyle = "#83eaf0"; ctx.font = "500 11px 'DM Mono', monospace"; ctx.textAlign = "center";
    ctx.fillText(`SHIELD ${shieldTime.toFixed(1)}s`, ship.x, ship.y + 43);
  }
}

function gameLoop(time) {
  if (!running || paused) return;
  const delta = Math.min((time - lastTime) / 1000, .05);
  lastTime = time;
  update(delta);
  draw();
  if (running) animationId = requestAnimationFrame(gameLoop);
}

function resumeOrStart() {
  if (paused) togglePause();
  else startGame();
}

function setKey(code, down) {
  if (!MOVE_KEYS.has(code)) return;
  if (down) heldKeys.add(code);
  else heldKeys.delete(code);
}

document.addEventListener("keydown", (event) => {
  if (MOVE_KEYS.has(event.code) || event.code === "Space") event.preventDefault();
  if (event.code === "KeyP") { togglePause(); return; }
  if (event.code === "KeyM") { toggleSound(); return; }
  if (event.code === "Space") {
    if (running) activatePulse();
    else resumeOrStart();
    return;
  }
  if (!running && event.code === "Enter") { resumeOrStart(); return; }
  if (running && !paused) setKey(event.code, true);
});
document.addEventListener("keyup", (event) => setKey(event.code, false));
window.addEventListener("blur", () => { if (running && !paused) togglePause(); heldKeys.clear(); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && running && !paused) togglePause();
});

for (const button of document.querySelectorAll(".dpad [data-key]")) {
  const code = button.dataset.key;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    if (!running || paused) return;
    setKey(code, true);
    button.setPointerCapture(event.pointerId);
  });
  const release = () => setKey(code, false);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  writeStorage(STORAGE_KEYS.sound, soundEnabled ? "on" : "off");
  soundButton.textContent = soundEnabled ? "♫ Sound on" : "♫ Sound off";
  soundButton.setAttribute("aria-pressed", String(soundEnabled));
  if (soundEnabled) { ensureAudio(); playSound(500, .08, "sine", .025); }
}

startButton.addEventListener("click", resumeOrStart);
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startGame);
soundButton.addEventListener("click", toggleSound);
touchPulse.addEventListener("click", activatePulse);

resetGame();
draw();
