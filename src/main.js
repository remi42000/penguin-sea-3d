import * as THREE from 'three';
import { PolarWorld, getSeabedHeight } from './world.js';
import { Penguin } from './penguin.js';
import { CollectibleManager } from './collectibles.js';
import { SealManager } from './seals.js';
import { OceanAudio } from './audio.js';
import { XboxController } from './gamepad.js';
import { GAME_TITLE, GAME_VERSION } from './version.js';

// --- Apply Dynamic Game Title & Version ---
document.title = GAME_TITLE;
const mainTitleEl = document.getElementById('game-main-title');
if (mainTitleEl) mainTitleEl.textContent = GAME_TITLE;
const hudVerEl = document.getElementById('hud-version-label');
if (hudVerEl) hudVerEl.textContent = `SCORE · ${GAME_VERSION}`;

// --- DOM Elements ---
const container = document.getElementById('canvas-container');
const underwaterOverlay = document.getElementById('underwater-overlay');
const popupsLayer = document.getElementById('popups-layer');

const hudTop = document.getElementById('hud-top');
const hudBottom = document.getElementById('hud-bottom');
const scoreValEl = document.getElementById('score-val');
const fishValEl = document.getElementById('fish-val');
const heartsRowEl = document.getElementById('hearts-row');
const oxygenBarEl = document.getElementById('oxygen-bar');
const staminaBarEl = document.getElementById('stamina-bar');
const breathWarnEl = document.getElementById('breath-warning');
const depthValEl = document.getElementById('depth-val');

const startPadPill = document.getElementById('start-pad-pill');
const hudPadBadge = document.getElementById('hud-pad-badge');
const hudPadText = document.getElementById('hud-pad-text');

const chillBtn = document.getElementById('chill-btn');
const chillLabel = document.getElementById('chill-label');
const muteBtn = document.getElementById('mute-btn');
const muteLabel = document.getElementById('mute-label');

const startOverlay = document.getElementById('start-overlay');
const gameoverOverlay = document.getElementById('gameover-overlay');
const finalSummaryEl = document.getElementById('final-summary');
const playAdventureBtn = document.getElementById('play-adventure-btn');
const playChillBtn = document.getElementById('play-chill-btn');
const restartBtn = document.getElementById('restart-btn');

const radarCanvas = document.getElementById('radar-canvas');
const radarCtx = radarCanvas.getContext('2d');

// --- Three.js Scene & Renderer ---
const scene = new THREE.Scene();
const underwaterFogColor = new THREE.Color(0x064866);
const aboveWaterFogColor = new THREE.Color(0xcce8f6);
scene.fog = new THREE.FogExp2(underwaterFogColor.getHex(), 0.018);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.15, 380);
camera.position.set(0, 2.5, 9.5);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

// --- World, Entities, Controller & Audio ---
const audio = new OceanAudio();
const controller = new XboxController();
const world = new PolarWorld(scene);
const penguin = new Penguin(scene);
penguin.onRumble = (dur, weak, strong) => controller.rumble(dur, weak, strong);

const collectibles = new CollectibleManager(scene);
const seals = new SealManager(scene, world, collectibles);

// --- Game State ---
let gameState = 'title'; // 'title' | 'playing' | 'gameover'
let chillMode = false;
let score = 0;
let fishCaught = 0;
let zeroAirTimer = 0;

// --- Keyboard Input State ---
const input = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  up: false,
  down: false,
};

let camOrbitYaw = 0;
let camOrbitPitch = 0.22;
let camDistance = 6.2;
let isOrbitDragging = false;
let lastPointerX = 0;
let lastPointerY = 0;

function setKey(code, pressed) {
  switch (code) {
    case 'KeyW':
    case 'ArrowUp':
      input.forward = pressed;
      break;
    case 'KeyS':
    case 'ArrowDown':
      input.backward = pressed;
      break;
    case 'KeyA':
    case 'ArrowLeft':
      input.left = pressed;
      break;
    case 'KeyD':
    case 'ArrowRight':
      input.right = pressed;
      break;
    case 'Space':
      input.up = pressed;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
    case 'KeyC':
      input.down = pressed;
      break;
    case 'KeyE':
    case 'KeyF':
      if (pressed && gameState === 'playing') {
        penguin.triggerDash(audio);
      }
      break;
    case 'KeyP':
      if (pressed && gameState === 'playing') {
        toggleChillMode();
      }
      break;
    case 'KeyM':
      if (pressed) {
        toggleMute();
      }
      break;
  }
}

window.addEventListener('keydown', (e) => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  audio.init();
  setKey(e.code, true);
});

window.addEventListener('keyup', (e) => setKey(e.code, false));

window.addEventListener('blur', () => {
  Object.keys(input).forEach((k) => (input[k] = false));
  isOrbitDragging = false;
});

// Mouse / Pointer camera orbit (Right-drag) & Dash (Left-click)
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

renderer.domElement.addEventListener('pointerdown', (e) => {
  audio.init();
  if (gameState !== 'playing') return;
  if (e.button === 2 || e.button === 1) {
    isOrbitDragging = true;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
  } else if (e.button === 0) {
    penguin.triggerDash(audio);
  }
});

window.addEventListener('pointermove', (e) => {
  if (!isOrbitDragging) return;
  const dx = e.clientX - lastPointerX;
  const dy = e.clientY - lastPointerY;
  lastPointerX = e.clientX;
  lastPointerY = e.clientY;

  camOrbitYaw -= dx * 0.0065;
  camOrbitPitch = THREE.MathUtils.clamp(camOrbitPitch + dy * 0.005, -0.45, 0.85);
});

window.addEventListener('pointerup', () => {
  isOrbitDragging = false;
});

renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    if (gameState !== 'playing') return;
    camDistance = THREE.MathUtils.clamp(camDistance + e.deltaY * 0.004, 4.0, 10.5);
  },
  { passive: true }
);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- UI Helpers ---
function updateGamepadBadges() {
  if (controller.connected) {
    if (startPadPill) {
      startPadPill.textContent = '🎮 Xbox 360 Controller Connected — Press A or START';
      startPadPill.classList.add('connected');
    }
    if (hudPadBadge) hudPadBadge.classList.add('connected');
    if (hudPadText) hudPadText.textContent = 'Xbox Pad';
  } else {
    if (startPadPill) {
      startPadPill.textContent = '🎮 Xbox Controller: Press A or START';
      startPadPill.classList.remove('connected');
    }
    if (hudPadBadge) hudPadBadge.classList.remove('connected');
    if (hudPadText) hudPadText.textContent = 'Pad Ready';
  }
}

function spawnScorePopup(worldPos, text, isGolden = false) {
  const projected = worldPos.clone().project(camera);
  if (projected.z > 1) return;

  const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;

  const el = document.createElement('div');
  el.className = `score-popup${isGolden ? ' golden' : ''}`;
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  popupsLayer.appendChild(el);
  setTimeout(() => el.remove(), 1200);
}

function renderHearts() {
  heartsRowEl.innerHTML = '';
  if (chillMode) {
    const span = document.createElement('span');
    span.className = 'heart-icon';
    span.style.fontSize = '15px';
    span.style.fontWeight = '700';
    span.style.color = '#7ef9d4';
    span.textContent = 'Peaceful';
    heartsRowEl.appendChild(span);
    return;
  }
  for (let i = 0; i < penguin.maxHearts; i++) {
    const span = document.createElement('span');
    span.className = `heart-icon${i >= penguin.hearts ? ' lost' : ''}`;
    span.textContent = '\u2764\uFE0F';
    heartsRowEl.appendChild(span);
  }
}

function updateHUD() {
  scoreValEl.textContent = String(score);
  fishValEl.textContent = String(fishCaught);

  oxygenBarEl.style.width = `${penguin.oxygen.toFixed(1)}%`;
  oxygenBarEl.classList.toggle('low', penguin.oxygen < 28);
  breathWarnEl.classList.toggle('hidden', !(gameState === 'playing' && penguin.oxygen < 26));

  staminaBarEl.style.width = `${penguin.stamina.toFixed(1)}%`;

  if (penguin.onIceFloe) {
    depthValEl.textContent = 'On Ice Floe';
  } else if (penguin.pos.y > 0.15) {
    depthValEl.textContent = `Air: +${penguin.pos.y.toFixed(1)}m`;
  } else {
    depthValEl.textContent = `Depth: ${Math.max(0, -penguin.pos.y).toFixed(1)}m`;
  }
}

function drawRadar() {
  const w = radarCanvas.width;
  const h = radarCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const maxRange = 52;
  const scale = (w * 0.44) / maxRange;

  radarCtx.clearRect(0, 0, w, h);

  radarCtx.strokeStyle = 'rgba(145, 230, 255, 0.16)';
  radarCtx.lineWidth = 1;
  [0.45, 0.85].forEach((frac) => {
    radarCtx.beginPath();
    radarCtx.arc(cx, cy, (w / 2) * frac, 0, Math.PI * 2);
    radarCtx.stroke();
  });

  const cosY = Math.cos(penguin.yaw);
  const sinY = Math.sin(penguin.yaw);

  const projectToRadar = (wx, wz) => {
    const dx = wx - penguin.pos.x;
    const dz = wz - penguin.pos.z;
    const rx = (dx * cosY - dz * sinY) * scale;
    const ry = (dx * sinY + dz * cosY) * scale;
    const dist = Math.hypot(rx, ry);
    if (dist > w * 0.45) return null;
    return [cx + rx, cy + ry];
  };

  radarCtx.fillStyle = 'rgba(230, 248, 255, 0.35)';
  for (const floe of world.iceFloes) {
    const pt = projectToRadar(floe.x, floe.z);
    if (!pt) continue;
    radarCtx.beginPath();
    radarCtx.arc(pt[0], pt[1], Math.max(3, floe.radius * scale), 0, Math.PI * 2);
    radarCtx.fill();
  }

  for (const f of collectibles.fishes) {
    const pt = projectToRadar(f.group.position.x, f.group.position.z);
    if (!pt) continue;
    radarCtx.fillStyle = f.isGolden ? '#ffdf5c' : 'rgba(115, 232, 255, 0.72)';
    radarCtx.beginPath();
    radarCtx.arc(pt[0], pt[1], f.isGolden ? 2.6 : 1.7, 0, Math.PI * 2);
    radarCtx.fill();
  }

  for (const s of seals.seals) {
    const pt = projectToRadar(s.pos.x, s.pos.z);
    if (!pt) continue;
    const isDanger = s.type === 'leopard' && !chillMode;
    radarCtx.fillStyle = isDanger ? '#ff6b6b' : '#4ef5c2';
    radarCtx.beginPath();
    radarCtx.arc(pt[0], pt[1], isDanger ? 3.6 : 3.1, 0, Math.PI * 2);
    radarCtx.fill();
  }

  radarCtx.fillStyle = '#ffffff';
  radarCtx.beginPath();
  radarCtx.moveTo(cx, cy - 5);
  radarCtx.lineTo(cx - 3.8, cy + 4);
  radarCtx.lineTo(cx + 3.8, cy + 4);
  radarCtx.closePath();
  radarCtx.fill();
}

function toggleChillMode(forceVal) {
  chillMode = typeof forceVal === 'boolean' ? forceVal : !chillMode;
  chillLabel.textContent = chillMode ? 'Mode: Chill' : 'Mode: Adventure';
  renderHearts();
  if (chillMode) {
    seals.reset();
  }
}

function toggleMute() {
  audio.init();
  const muted = audio.toggleMute();
  muteLabel.textContent = muted ? 'Sound: Off' : 'Sound: On';
}

function startGame(useChillMode) {
  audio.init();
  score = 0;
  fishCaught = 0;
  zeroAirTimer = 0;
  camOrbitYaw = 0;
  camOrbitPitch = 0.22;

  penguin.reset();
  seals.reset();
  toggleChillMode(useChillMode);
  renderHearts();
  updateHUD();
  controller.rumble(100, 0.35, 0.2);

  startOverlay.classList.add('hidden');
  gameoverOverlay.classList.add('hidden');
  hudTop.classList.remove('hud-hidden');
  hudBottom.classList.remove('hud-hidden');
  gameState = 'playing';
}

function triggerGameOver() {
  gameState = 'gameover';
  breathWarnEl.classList.add('hidden');
  finalSummaryEl.textContent = `You scored ${score} points and caught ${fishCaught} fish while swimming with the seals!`;
  gameoverOverlay.classList.remove('hidden');
}

playAdventureBtn.addEventListener('click', () => startGame(false));
playChillBtn.addEventListener('click', () => startGame(true));
restartBtn.addEventListener('click', () => startGame(chillMode));
chillBtn.addEventListener('click', () => toggleChillMode());
muteBtn.addEventListener('click', () => toggleMute());

// --- Smart Third-Person Camera ---
const cameraTarget = new THREE.Vector3(0, -0.8, 0);
const desiredCamPos = new THREE.Vector3();

function updateCamera(dt, elapsed) {
  if (gameState === 'title') {
    const angle = elapsed * 0.22;
    camera.position.set(
      Math.sin(angle) * 10.5,
      2.4 + Math.sin(elapsed * 0.45) * 1.1,
      Math.cos(angle) * 10.5 - 2.0
    );
    camera.lookAt(0, -1.2, -3.5);
    return;
  }

  // Right Stick camera orbit on Xbox 360 Controller
  const rightStickActive = Math.abs(controller.lookX) > 0.01 || Math.abs(controller.lookY) > 0.01;
  if (rightStickActive) {
    camOrbitYaw -= controller.lookX * 2.4 * dt;
    camOrbitPitch = THREE.MathUtils.clamp(camOrbitPitch + controller.lookY * 1.6 * dt, -0.45, 0.85);
  }

  // Gently auto-recenter orbit yaw when swimming forward without manual camera input
  const movingActively =
    input.forward ||
    input.left ||
    input.right ||
    Math.abs(controller.moveX) > 0.1 ||
    Math.abs(controller.moveY) > 0.1;

  if (!isOrbitDragging && !rightStickActive && movingActively) {
    camOrbitYaw = THREE.MathUtils.lerp(camOrbitYaw, 0, 2.2 * dt);
  }

  const totalYaw = penguin.yaw + camOrbitYaw;
  const pitchOffset = camOrbitPitch - penguin.pitch * (1 - penguin.standBlend) * 0.55;

  const horizDist = Math.cos(pitchOffset) * camDistance;
  const vertOffset = Math.sin(pitchOffset) * camDistance + 0.85;

  desiredCamPos.set(
    penguin.pos.x + Math.sin(totalYaw) * horizDist,
    penguin.pos.y + vertOffset,
    penguin.pos.z + Math.cos(totalYaw) * horizDist
  );

  const minCamY = getSeabedHeight(desiredCamPos.x, desiredCamPos.z) + 0.85;
  if (desiredCamPos.y < minCamY) desiredCamPos.y = minCamY;

  camera.position.lerp(desiredCamPos, Math.min(1, 7.5 * dt));

  const lookAheadX = -Math.sin(penguin.yaw) * 1.8;
  const lookAheadZ = -Math.cos(penguin.yaw) * 1.8;
  const targetGoal = new THREE.Vector3(
    penguin.pos.x + lookAheadX,
    penguin.pos.y + 0.32,
    penguin.pos.z + lookAheadZ
  );
  cameraTarget.lerp(targetGoal, Math.min(1, 10 * dt));
  camera.lookAt(cameraTarget);
}

// --- Atmosphere Transition (Above vs Underwater) ---
function updateAtmosphere() {
  const camUnderwater = camera.position.y < 0.02;
  if (camUnderwater) {
    scene.fog.color.copy(underwaterFogColor);
    scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, 0.019, 0.15);
    underwaterOverlay.style.opacity = '1';
  } else {
    scene.fog.color.copy(aboveWaterFogColor);
    scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, 0.0035, 0.15);
    underwaterOverlay.style.opacity = '0';
  }
}

// --- Main Animation Loop ---
let lastTime = performance.now();
let elapsed = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
  lastTime = now;
  elapsed += dt;

  // Poll Xbox 360 Controller every frame
  controller.poll();
  updateGamepadBadges();

  if (controller.justPressedBack) {
    toggleMute();
  }

  if (gameState === 'title') {
    if (controller.justPressedA || controller.justPressedStart) {
      startGame(false);
    } else if (controller.justPressedY) {
      startGame(true);
    }
  } else if (gameState === 'gameover') {
    if (controller.justPressedA || controller.justPressedStart) {
      startGame(chillMode);
    } else if (controller.justPressedY) {
      startGame(!chillMode);
    }
  }

  if (gameState === 'playing') {
    if (controller.justPressedDash) {
      penguin.triggerDash(audio);
    }
    if (controller.justPressedY) {
      toggleChillMode();
    }
    if (controller.justPressedR3) {
      camOrbitYaw = 0;
      camOrbitPitch = 0.22;
      camDistance = 6.2;
    }

    const combinedInput = {
      forward: input.forward,
      backward: input.backward,
      left: input.left,
      right: input.right,
      up: input.up || controller.swimUp,
      down: input.down || controller.swimDown,
      turnAnalog: -controller.moveX,
      forwardAnalog: controller.moveY,
    };

    const prevHearts = penguin.hearts;
    penguin.update(dt, elapsed, combinedInput, world, audio);

    if (penguin.oxygen <= 0.1) {
      if (chillMode) {
        penguin.vel.y += 5.5 * dt;
      } else {
        zeroAirTimer += dt;
        if (zeroAirTimer >= 2.5) {
          zeroAirTimer = 0;
          penguin.hearts = Math.max(0, penguin.hearts - 1);
          penguin.vel.y = Math.max(penguin.vel.y, 4.5);
          audio.playBump();
          controller.rumble(240, 0.75, 0.65);
        }
      }
    } else {
      zeroAirTimer = Math.max(0, zeroAirTimer - dt * 2);
    }

    collectibles.update(dt, elapsed, penguin, audio, (event) => {
      score += event.points;
      if (event.type === 'fish' || event.type === 'golden-fish') {
        fishCaught += 1;
        controller.rumble(event.type === 'golden-fish' ? 140 : 65, 0.35, event.type === 'golden-fish' ? 0.3 : 0.1);
      }
      if (penguin.hearts !== prevHearts) renderHearts();
      spawnScorePopup(event.pos, event.label, event.type === 'golden-fish');
    });

    seals.update(dt, elapsed, penguin, chillMode, audio, (sealPos, label, pts) => {
      score += pts;
      spawnScorePopup(sealPos.clone().setY(sealPos.y + 0.9), label, false);
    });

    if (penguin.hearts !== prevHearts) {
      renderHearts();
    }
    if (!chillMode && penguin.hearts <= 0) {
      triggerGameOver();
    }

    updateHUD();
    drawRadar();
  } else {
    penguin.pos.set(0, -1.0 + Math.sin(elapsed * 1.8) * 0.22, -1.5);
    penguin.yaw = Math.sin(elapsed * 0.6) * 0.45;
    penguin.update(
      dt,
      elapsed,
      { forward: false, backward: false, left: false, right: false, up: false, down: false },
      world,
      null
    );
    collectibles.update(dt, elapsed, { pos: new THREE.Vector3(0, 999, 0), dashTimer: 0 }, null, null);
    seals.update(dt, elapsed, { pos: new THREE.Vector3(0, 999, 0), onIceFloe: true }, true, null, null);
  }

  updateCamera(dt, elapsed);
  updateAtmosphere();
  world.update(dt, elapsed, camera.position.y);
  audio.updateAmbient(camera.position.y, penguin.vel.length());

  renderer.render(scene, camera);
}

renderHearts();
requestAnimationFrame(animate);

// Expose lightweight debug handle
window.__PENGUDIVE__ = {
  startGame,
  penguin,
  seals,
  collectibles,
  world,
  camera,
  controller,
  version: GAME_VERSION,
  getState: () => ({
    version: GAME_VERSION,
    gameState,
    score,
    fishCaught,
    chillMode,
    hearts: penguin.hearts,
    oxygen: penguin.oxygen,
    padConnected: controller.connected,
  }),
};
