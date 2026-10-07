const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreElement = document.querySelector("#score");
const bestScoreElement = document.querySelector("#best-score");
const message = document.querySelector("#message");
const messageTitle = message.querySelector("h2");
const messageText = message.querySelector("p");
const startButton = document.querySelector("#start-button");
const pauseButton = document.querySelector("#pause-button");
const restartButton = document.querySelector("#restart-button");

const width = canvas.width;
const height = canvas.height;
const keys = new Set();
const stars = Array.from({ length: 95 }, () => ({
  x: Math.random() * width,
  y: Math.random() * height,
  size: Math.random() * 1.7 + .3,
  speed: Math.random() * 25 + 8,
  alpha: Math.random() * .65 + .2,
}));

let ship;
let meteors;
let score;
let bestScore = Number(localStorage.getItem("dodge-the-meteors-best")) || 0;
let lastTime = 0;
let spawnTimer = 0;
let running = false;
let paused = false;
let animationId;

bestScoreElement.textContent = bestScore;

function resetGame() {
  ship = { x: width / 2, y: height - 65, size: 22, speed: 310 };
  meteors = [];
  score = 0;
  spawnTimer = 0;
  scoreElement.textContent = score;
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
  animationId = requestAnimationFrame(gameLoop);
}

function endGame() {
  running = false;
  pauseButton.disabled = true;
  cancelAnimationFrame(animationId);
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem("dodge-the-meteors-best", bestScore);
    bestScoreElement.textContent = bestScore;
  }
  messageTitle.textContent = "Meteor impact!";
  messageText.textContent = `You survived ${score} points. ${score >= bestScore && score > 0 ? "New best score!" : "Try again and fly longer."}`;
  startButton.textContent = "Play again";
  message.hidden = false;
}

function togglePause() {
  if (!running) return;
  paused = !paused;
  pauseButton.textContent = paused ? "Resume" : "Pause";
  if (paused) {
    messageTitle.textContent = "Paused";
    messageText.textContent = "Take a breath. The meteors are waiting.";
    startButton.textContent = "Resume game";
    message.hidden = false;
  } else {
    message.hidden = true;
    lastTime = performance.now();
    animationId = requestAnimationFrame(gameLoop);
  }
}

function spawnMeteor() {
  const radius = 14 + Math.random() * 22;
  const difficulty = 1 + score / 350;
  meteors.push({
    x: radius + Math.random() * (width - radius * 2),
    y: -radius - 8,
    radius,
    speed: (105 + Math.random() * 105) * difficulty,
    rotation: Math.random() * Math.PI * 2,
    rotationSpeed: (Math.random() - .5) * 2.2,
    points: makeMeteorPoints(radius),
  });
}

function makeMeteorPoints(radius) {
  const count = 8;
  return Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2,
    distance: radius * (.72 + Math.random() * .3),
  }));
}

function update(delta) {
  const horizontal = (keys.has("ArrowRight") || keys.has("KeyD") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("KeyA") ? 1 : 0);
  const vertical = (keys.has("ArrowDown") || keys.has("KeyS") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("KeyW") ? 1 : 0);
  const length = Math.hypot(horizontal, vertical) || 1;
  ship.x += (horizontal / length) * ship.speed * delta;
  ship.y += (vertical / length) * ship.speed * delta;
  ship.x = Math.max(ship.size, Math.min(width - ship.size, ship.x));
  ship.y = Math.max(ship.size, Math.min(height - ship.size, ship.y));

  score += Math.ceil(delta * 10);
  scoreElement.textContent = score;
  spawnTimer -= delta;
  if (spawnTimer <= 0) {
    spawnMeteor();
    spawnTimer = Math.max(.24, .78 - score / 900) + Math.random() * .22;
  }

  for (const meteor of meteors) {
    meteor.y += meteor.speed * delta;
    meteor.rotation += meteor.rotationSpeed * delta;
  }
  meteors = meteors.filter((meteor) => meteor.y - meteor.radius < height + 20);

  if (meteors.some(collidesWithShip)) endGame();
}

function collidesWithShip(meteor) {
  const distance = Math.hypot(ship.x - meteor.x, ship.y - meteor.y);
  return distance < ship.size * .68 + meteor.radius * .76;
}

function draw() {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#0e1741");
  gradient.addColorStop(1, "#090b1d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (const star of stars) {
    star.y += star.speed / 60;
    if (star.y > height) star.y = 0;
    ctx.fillStyle = `rgb(215 235 255 / ${star.alpha})`;
    ctx.fillRect(star.x, star.y, star.size, star.size);
  }

  for (const meteor of meteors) drawMeteor(meteor);
  drawShip();
}

function drawMeteor(meteor) {
  ctx.save();
  ctx.translate(meteor.x, meteor.y);
  ctx.rotate(meteor.rotation);
  ctx.beginPath();
  meteor.points.forEach((point, index) => {
    const x = Math.cos(point.angle) * point.distance;
    const y = Math.sin(point.angle) * point.distance;
    index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = "#b76553";
  ctx.fill();
  ctx.strokeStyle = "#ffac7b";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-meteor.radius * .22, -meteor.radius * .1, meteor.radius * .19, 0, Math.PI * 2);
  ctx.fillStyle = "#77423f";
  ctx.fill();
  ctx.restore();
}

function drawShip() {
  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.beginPath();
  ctx.moveTo(0, -ship.size * 1.25);
  ctx.lineTo(ship.size * .78, ship.size);
  ctx.lineTo(0, ship.size * .55);
  ctx.lineTo(-ship.size * .78, ship.size);
  ctx.closePath();
  ctx.fillStyle = "#63ebff";
  ctx.shadowColor = "#63ebff";
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#bd91ff";
  ctx.fillRect(-3, -1, 6, 14);
  ctx.restore();
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

document.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "KeyP") togglePause();
  if (!running && (event.code === "Enter" || event.code === "Space")) resumeOrStart();
  keys.add(event.code);
});
document.addEventListener("keyup", (event) => keys.delete(event.code));
window.addEventListener("blur", () => { if (running && !paused) togglePause(); });
startButton.addEventListener("click", resumeOrStart);
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", startGame);

resetGame();
draw();
