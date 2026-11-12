import * as THREE from 'three';
import { WORLD_RADIUS, getWaveHeight, getSeabedHeight } from './world.js';

function lerpAngle(current, target, alpha) {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * Math.min(1, alpha);
}

function buildSealMesh(type = 'harbor') {
  const isLeopard = type === 'leopard';

  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const bodyRig = new THREE.Group();
  group.add(bodyRig);

  const coatColor = isLeopard ? 0x3b4a59 : 0x8f9aa5;
  const bellyColor = isLeopard ? 0xbecad4 : 0xdde5eb;
  const spotColor = isLeopard ? 0x1d2630 : 0x56616b;

  const coatMat = new THREE.MeshStandardMaterial({
    color: coatColor,
    roughness: 0.46,
    metalness: 0.06,
  });
  const bellyMat = new THREE.MeshStandardMaterial({
    color: bellyColor,
    roughness: 0.52,
    metalness: 0.04,
  });
  const spotMat = new THREE.MeshStandardMaterial({
    color: spotColor,
    roughness: 0.5,
  });
  const darkNoseMat = new THREE.MeshStandardMaterial({ color: 0x151920, roughness: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0c1017 });
  const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const whiskerMat = new THREE.MeshBasicMaterial({ color: 0xf0f6fa });

  // 1. Plump streamlined main torso along Z (-Z is forward)
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.56, 22, 18), coatMat);
  torso.scale.set(isLeopard ? 0.88 : 1.02, isLeopard ? 0.86 : 0.96, isLeopard ? 1.85 : 1.55);
  torso.castShadow = true;
  torso.receiveShadow = true;
  bodyRig.add(torso);

  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.50, 18, 16), bellyMat);
  belly.scale.set(isLeopard ? 0.78 : 0.90, 0.76, isLeopard ? 1.68 : 1.40);
  belly.position.set(0, -0.10, -0.04);
  bodyRig.add(belly);

  // Cute dorsal spots!
  const spotOffsets = [
    [-0.22, 0.34, -0.25, 0.085],
    [0.24, 0.32, -0.05, 0.095],
    [-0.14, 0.38, 0.18, 0.075],
    [0.18, 0.28, 0.38, 0.08],
    [-0.28, 0.18, 0.08, 0.07],
    [0.05, 0.41, -0.35, 0.068],
  ];
  for (const [sx, sy, sz, sr] of spotOffsets) {
    const spot = new THREE.Mesh(new THREE.SphereGeometry(sr, 8, 8), spotMat);
    spot.scale.set(1.2, 0.45, 1.3);
    spot.position.set(sx, sy, sz);
    bodyRig.add(spot);
  }

  // 2. Expressive Seal Head Group at front (-Z)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, isLeopard ? 0.08 : 0.14, isLeopard ? -0.92 : -0.78);
  bodyRig.add(headPivot);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 16), coatMat);
  head.scale.set(isLeopard ? 0.88 : 0.98, isLeopard ? 0.82 : 0.95, isLeopard ? 1.28 : 1.05);
  head.position.set(0, 0.04, -0.16);
  head.castShadow = true;
  headPivot.add(head);

  // Plump muzzle / snout pointing -Z
  const snout = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 14), bellyMat);
  snout.scale.set(1.05, 0.82, isLeopard ? 1.35 : 1.05);
  snout.position.set(0, -0.03, isLeopard ? -0.48 : -0.40);
  headPivot.add(snout);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 10), darkNoseMat);
  nose.scale.set(1.15, 0.8, 0.85);
  nose.position.set(0, 0.03, isLeopard ? -0.68 : -0.56);
  headPivot.add(nose);

  // Big puppy seal eyes & whiskers
  [-1, 1].forEach((side) => {
    const eyeRadius = isLeopard ? 0.058 : 0.078;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius, 12, 12), eyeMat);
    eye.position.set(side * 0.22, 0.11, -0.32);
    headPivot.add(eye);

    const shine = new THREE.Mesh(new THREE.SphereGeometry(eyeRadius * 0.34, 8, 8), shineMat);
    shine.position.set(side * 0.245, 0.135, -0.365);
    headPivot.add(shine);

    // 3 cute whiskers on each cheek
    for (let w = 0; w < 3; w++) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.003, 0.24, 5), whiskerMat);
      whisker.rotation.z = side * (Math.PI * 0.44 + (w - 1) * 0.14);
      whisker.rotation.y = side * -0.18;
      whisker.position.set(side * 0.23, -0.03 + (w - 1) * 0.03, isLeopard ? -0.47 : -0.41);
      headPivot.add(whisker);
    }
  });

  // 3. Articulated Front Flippers
  const makeFrontFlipper = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.44, -0.14, -0.28);

    const blade = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), coatMat);
    blade.scale.set(1.15, 0.20, 0.56);
    blade.position.set(side * 0.24, -0.04, 0.06);
    blade.rotation.y = side * -0.28;
    blade.castShadow = true;
    pivot.add(blade);

    bodyRig.add(pivot);
    return pivot;
  };
  const leftFlipper = makeFrontFlipper(-1);
  const rightFlipper = makeFrontFlipper(1);

  // 4. Sinuous Rear Body & Twin V-Tail Hind Flippers (+Z)
  const rearPivot = new THREE.Group();
  rearPivot.position.set(0, 0, isLeopard ? 0.72 : 0.58);
  bodyRig.add(rearPivot);

  const rearConeGeo = new THREE.ConeGeometry(isLeopard ? 0.36 : 0.40, isLeopard ? 0.95 : 0.78, 16);
  rearConeGeo.rotateX(Math.PI / 2); // Tip points +Z (backward)
  const rearMesh = new THREE.Mesh(rearConeGeo, coatMat);
  rearMesh.position.set(0, 0, isLeopard ? 0.40 : 0.32);
  rearPivot.add(rearMesh);

  const tailFlipperPivot = new THREE.Group();
  tailFlipperPivot.position.set(0, 0, isLeopard ? 0.78 : 0.64);
  rearPivot.add(tailFlipperPivot);

  [-1, 1].forEach((side) => {
    const fin = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), coatMat);
    fin.scale.set(0.32, 0.72, 1.25);
    fin.position.set(side * 0.13, 0, 0.22);
    fin.rotation.y = side * 0.24;
    fin.rotation.z = side * 0.18;
    tailFlipperPivot.add(fin);
  });

  // Alert "!" badge for Leopard Seals when chasing
  let alertBadge = null;
  if (isLeopard) {
    alertBadge = new THREE.Group();
    alertBadge.position.set(0, 0.95, -0.4);
    const bar = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.065, 0.26, 6, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4d4f })
    );
    bar.position.y = 0.22;
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.072, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4d4f })
    );
    dot.position.y = -0.06;
    alertBadge.add(bar, dot);
    alertBadge.visible = false;
    group.add(alertBadge);

    group.scale.setScalar(1.28);
  } else {
    group.scale.setScalar(1.02);
  }

  return {
    group,
    bodyRig,
    headPivot,
    leftFlipper,
    rightFlipper,
    rearPivot,
    tailFlipperPivot,
    alertBadge,
  };
}

export class SealManager {
  constructor(scene, world, collectibles) {
    this.scene = scene;
    this.world = world;
    this.collectibles = collectibles;
    this.seals = [];

    this._spawnSeals();
  }

  _spawnSeals() {
    // 1. Friendly swimming Harbor Seals (6 around the sea, including near spawn so player sees them immediately!)
    const harborSwimConfigs = [
      { cx: -6, cz: -9, radius: 9.5, baseY: -2.4, speed: 4.3, phase: 0.2 },
      { cx: 8, cz: -12, radius: 11.0, baseY: -3.2, speed: 4.6, phase: 2.1 },
      { cx: -16, cz: 6, radius: 12.5, baseY: -4.5, speed: 4.2, phase: 3.8 },
      { cx: 18, cz: 9, radius: 13.0, baseY: -3.8, speed: 4.5, phase: 1.3 },
      { cx: 0, cz: -25, radius: 14.0, baseY: -5.5, speed: 4.8, phase: 4.7 },
      { cx: -24, cz: -26, radius: 12.0, baseY: -6.2, speed: 4.4, phase: 5.5 },
    ];

    harborSwimConfigs.forEach((cfg, idx) => {
      const rig = buildSealMesh('harbor');
      const angle = cfg.phase;
      const sx = cfg.cx + Math.cos(angle) * cfg.radius;
      const sz = cfg.cz + Math.sin(angle) * cfg.radius;
      rig.group.position.set(sx, cfg.baseY, sz);
      this.scene.add(rig.group);

      this.seals.push({
        id: `harbor-${idx}`,
        type: 'harbor',
        mode: 'swim',
        rig,
        pos: rig.group.position,
        yaw: angle + Math.PI,
        pitch: 0,
        roll: 0,
        barrelRollTimer: 0,
        ringCooldown: 3 + idx * 1.6,
        greetCooldown: 0,
        swimCycle: idx * 1.3,
        wasUnderwater: true,
        ...cfg,
      });
    });

    // 2. Cute Basking Harbor Seals relaxing in "banana pose" on 2 Ice Floes!
    const baskingFloes = [this.world.iceFloes[0], this.world.iceFloes[1]].filter(Boolean);
    baskingFloes.forEach((floe, idx) => {
      const rig = buildSealMesh('harbor');
      const offsetAngle = idx === 0 ? -0.9 : 0.8;
      const bx = floe.x + Math.cos(offsetAngle) * (floe.radius * 0.56);
      const bz = floe.z + Math.sin(offsetAngle) * (floe.radius * 0.56);
      rig.group.position.set(bx, floe.deckY + 0.42, bz);
      rig.group.rotation.y = offsetAngle + 1.1;
      this.scene.add(rig.group);

      this.seals.push({
        id: `basking-${idx}`,
        type: 'harbor',
        mode: 'bask',
        rig,
        floe,
        pos: rig.group.position,
        yaw: rig.group.rotation.y,
        greetCooldown: 0,
        swimCycle: idx * 2.1,
      });
    });

    // 3. Sleek Patrolling Leopard Seals in outer waters (3 total)
    const leopardConfigs = [
      { cx: -28, cz: -8, radius: 15.0, baseY: -6.8, speed: 5.4, phase: 0.6 },
      { cx: 29, cz: -18, radius: 16.0, baseY: -7.5, speed: 5.6, phase: 2.8 },
      { cx: 4, cz: -44, radius: 15.5, baseY: -8.0, speed: 5.5, phase: 4.4 },
    ];

    leopardConfigs.forEach((cfg, idx) => {
      const rig = buildSealMesh('leopard');
      const sx = cfg.cx + Math.cos(cfg.phase) * cfg.radius;
      const sz = cfg.cz + Math.sin(cfg.phase) * cfg.radius;
      rig.group.position.set(sx, cfg.baseY, sz);
      this.scene.add(rig.group);

      this.seals.push({
        id: `leopard-${idx}`,
        type: 'leopard',
        mode: 'patrol',
        rig,
        pos: rig.group.position,
        yaw: cfg.phase + Math.PI,
        pitch: 0,
        roll: 0,
        chaseTimer: 0,
        chaseCooldown: 0,
        swimCycle: idx * 1.9,
        ...cfg,
      });
    });
  }

  reset() {
    for (const s of this.seals) {
      if (s.type === 'leopard') {
        s.chaseTimer = 0;
        s.chaseCooldown = 2.0;
        if (s.rig.alertBadge) s.rig.alertBadge.visible = false;
      }
    }
  }

  update(dt, elapsed, penguin, chillMode, audio, onBuddyBonus) {
    for (const s of this.seals) {
      if (s.greetCooldown > 0) s.greetCooldown -= dt;

      // --- BASKING HARBOR SEALS ON ICE FLOES ---
      if (s.mode === 'bask') {
        const deckY = s.floe.currentDeckY ?? s.floe.deckY;
        s.pos.y = deckY + 0.42;

        // Adorable harbor seal "banana pose" (head & hind flippers gently curved upward!)
        const relaxWave = Math.sin(elapsed * 1.8 + s.swimCycle);
        s.rig.headPivot.rotation.x = 0.34 + relaxWave * 0.08;
        s.rig.headPivot.rotation.y = Math.sin(elapsed * 0.9 + s.swimCycle) * 0.24;
        s.rig.rearPivot.rotation.x = 0.38 + relaxWave * 0.07;
        s.rig.leftFlipper.rotation.z = 0.25 + Math.sin(elapsed * 3.2 + s.swimCycle) * 0.22;
        s.rig.rightFlipper.rotation.z = -0.25;

        // Wave happily if the penguin waddles or swims close!
        const dPeng = s.pos.distanceTo(penguin.pos);
        if (dPeng < 6.5 && s.greetCooldown <= 0) {
          s.greetCooldown = 8.0;
          if (audio) audio.playSealGreeting();
          if (onBuddyBonus) onBuddyBonus(s.pos, 'Seal Hi-Five! +15', 15);
        }
        continue;
      }

      // --- SWIMMING HARBOR & LEOPARD SEALS ---
      let targetPoint = new THREE.Vector3();
      let moveSpeed = s.speed;
      const distToPenguin = s.pos.distanceTo(penguin.pos);

      if (s.type === 'harbor') {
        // Organic figure-8 / orbital cruise path with occasional playful surface breach
        s.phase += (0.34 + 0.06 * Math.sin(elapsed * 0.4)) * dt;
        const px = s.cx + Math.cos(s.phase) * s.radius;
        const pz = s.cz + Math.sin(s.phase * 1.5) * (s.radius * 0.78);
        const py = s.baseY + Math.sin(s.phase * 2.0) * 2.1;
        targetPoint.set(px, py, pz);

        // Curious friendly reaction when penguin swims near!
        if (distToPenguin < 8.5) {
          if (s.greetCooldown <= 0) {
            s.greetCooldown = 9.5;
            s.barrelRollTimer = 1.15; // Joyful 360 barrel roll!
            if (audio) audio.playSealGreeting();
            if (onBuddyBonus) onBuddyBonus(s.pos, 'Playful Seal! +15', 15);
          }
          if (s.ringCooldown <= 0 && s.pos.y < -1.2) {
            s.ringCooldown = 7.5;
            // Blow a shimmering bubble ring in front of the seal!
            const fwd = new THREE.Vector3(-Math.sin(s.yaw), Math.sin(s.pitch), -Math.cos(s.yaw)).normalize();
            this.collectibles.spawnBubbleRing(s.pos.clone().addScaledVector(fwd, 1.8), fwd);
          }
        }
        s.ringCooldown -= dt;
      } else {
        // Leopard Seal AI (patrols peacefully in Chill Mode, chases alertly in Adventure Mode!)
        if (s.chaseCooldown > 0) s.chaseCooldown -= dt;

        const penguinVulnerable = !chillMode && !penguin.onIceFloe && penguin.pos.y < 0.3;
        if (s.chaseTimer > 0) {
          s.chaseTimer -= dt;
          if (!penguinVulnerable || distToPenguin > 24) {
            s.chaseTimer = 0;
            s.chaseCooldown = 4.5;
          } else {
            targetPoint.copy(penguin.pos);
            moveSpeed = 8.1; // Fast, but slower than penguin turbo dash!
          }
        } else if (penguinVulnerable && s.chaseCooldown <= 0 && distToPenguin < 14.5) {
          s.chaseTimer = 5.2;
          if (audio) audio.playAlert();
          targetPoint.copy(penguin.pos);
          moveSpeed = 8.1;
        }

        if (s.chaseTimer <= 0) {
          // Calm sinuous patrol
          s.phase += 0.28 * dt;
          const px = s.cx + Math.cos(s.phase) * s.radius;
          const pz = s.cz + Math.sin(s.phase) * s.radius;
          const py = s.baseY + Math.sin(s.phase * 2.2) * 1.8;
          targetPoint.set(px, py, pz);
        }

        if (s.rig.alertBadge) {
          s.rig.alertBadge.visible = s.chaseTimer > 0 && !chillMode;
          if (s.rig.alertBadge.visible) {
            s.rig.alertBadge.scale.setScalar(1 + Math.sin(elapsed * 12) * 0.15);
          }
        }

        // Check bump collision with Penguin in Adventure Mode
        if (!chillMode && !penguin.onIceFloe && distToPenguin < 1.55) {
          const bumped = penguin.takeBump(s.pos, audio);
          if (bumped) {
            s.chaseTimer = 0;
            s.chaseCooldown = 5.5;
          }
        }
      }

      // Steer smoothly toward targetPoint
      const toTarget = targetPoint.sub(s.pos);
      const len = toTarget.length();
      if (len > 0.05) {
        toTarget.divideScalar(len);
        const desiredYaw = Math.atan2(-toTarget.x, -toTarget.z);
        const horiz = Math.hypot(toTarget.x, toTarget.z);
        const desiredPitch = THREE.MathUtils.clamp(Math.atan2(toTarget.y, horiz), -0.65, 0.65);

        const prevYaw = s.yaw;
        s.yaw = lerpAngle(s.yaw, desiredYaw, 3.2 * dt);
        s.pitch = THREE.MathUtils.lerp(s.pitch, desiredPitch, 3.5 * dt);

        const yawVel = (s.yaw - prevYaw) / Math.max(dt, 0.001);
        s.roll = THREE.MathUtils.lerp(s.roll, THREE.MathUtils.clamp(yawVel * 0.18, -0.45, 0.45), 5 * dt);
      }

      // Move forward along seal's -Z heading
      const cosP = Math.cos(s.pitch);
      const vx = -Math.sin(s.yaw) * cosP * moveSpeed;
      const vy = Math.sin(s.pitch) * moveSpeed;
      const vz = -Math.cos(s.yaw) * cosP * moveSpeed;

      s.pos.x += vx * dt;
      s.pos.y += vy * dt;
      s.pos.z += vz * dt;

      // Avoid seabed & icebergs cleanly
      const minFloor = getSeabedHeight(s.pos.x, s.pos.z) + 1.2;
      const maxSurf = getWaveHeight(s.pos.x, s.pos.z, elapsed) + 0.15;
      s.pos.y = THREE.MathUtils.clamp(s.pos.y, minFloor, maxSurf);

      for (const floe of this.world.iceFloes) {
        if (s.pos.y > floe.keelBottomY) {
          const dx = s.pos.x - floe.x;
          const dz = s.pos.z - floe.z;
          const d = Math.hypot(dx, dz) || 0.001;
          const minR = floe.radius + 1.4;
          if (d < minR) {
            s.pos.x = floe.x + (dx / d) * minR;
            s.pos.z = floe.z + (dz / d) * minR;
          }
        }
      }
      for (const berg of this.world.obstacles) {
        const dx = s.pos.x - berg.x;
        const dz = s.pos.z - berg.z;
        const d = Math.hypot(dx, dz) || 0.001;
        const minR = berg.radius + 1.6;
        if (d < minR) {
          s.pos.x = berg.x + (dx / d) * minR;
          s.pos.z = berg.z + (dz / d) * minR;
        }
      }

      const rWorld = Math.hypot(s.pos.x, s.pos.z);
      if (rWorld > WORLD_RADIUS - 6) {
        s.pos.x *= (WORLD_RADIUS - 6) / rWorld;
        s.pos.z *= (WORLD_RADIUS - 6) / rWorld;
      }

      // True phocid seal side-to-side hind-body swimming undulation!
      s.swimCycle += dt * (4.2 + moveSpeed * 0.72);
      const undulate = Math.sin(s.swimCycle);
      s.rig.rearPivot.rotation.y = undulate * 0.28;
      s.rig.tailFlipperPivot.rotation.y = Math.sin(s.swimCycle - 0.85) * 0.42;
      s.rig.headPivot.rotation.y = -undulate * 0.09;
      s.rig.bodyRig.rotation.y = undulate * 0.06;

      // Front flippers feather gently for steering
      s.rig.leftFlipper.rotation.z = 0.22 + Math.sin(s.swimCycle * 0.5) * 0.16;
      s.rig.rightFlipper.rotation.z = -0.22 - Math.sin(s.swimCycle * 0.5) * 0.16;

      // Joyful 360 barrel roll when greeting the penguin!
      let extraRoll = 0;
      if (s.barrelRollTimer > 0) {
        s.barrelRollTimer = Math.max(0, s.barrelRollTimer - dt);
        const progress = 1 - s.barrelRollTimer / 1.15;
        extraRoll = progress * Math.PI * 2;
      }

      s.rig.group.rotation.set(s.pitch, s.yaw, s.roll + extraRoll);
    }
  }
}
