import * as THREE from 'three';
import { WORLD_RADIUS, getWaveHeight, getSeabedHeight } from './world.js';

export class Penguin {
  constructor(scene) {
    this.scene = scene;

    // Physics & state
    this.pos = new THREE.Vector3(0, -1.2, 2.5);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.yaw = 0; // 0 = facing -Z
    this.pitch = 0; // +pitch = nose up, -pitch = nose down
    this.bank = 0;
    this.standBlend = 0; // 0 = streamlined swimming, 1 = upright waddling on ice

    this.onIceFloe = false;
    this.inAir = false;
    this.wasUnderwater = true;

    // Gameplay stats
    this.oxygen = 100; // 0..100
    this.stamina = 100; // 0..100
    this.hearts = 3;
    this.maxHearts = 3;
    this.invincibleTimer = 0;
    this.dashTimer = 0;
    this.ringBoostTimer = 0;

    // Animation timers
    this.swimCycle = 0;
    this.waddleCycle = 0;
    this.onRumble = null;

    this._buildMesh();
    this._buildBubbleSystem();
  }

  _buildMesh() {
    this.root = new THREE.Group();
    this.root.rotation.order = 'YXZ';
    this.root.position.copy(this.pos);

    this.uprightRig = new THREE.Group();
    this.root.add(this.uprightRig);

    const blackFeatherMat = new THREE.MeshStandardMaterial({
      color: 0x17202b,
      roughness: 0.42,
      metalness: 0.08,
    });
    const whiteBellyMat = new THREE.MeshStandardMaterial({
      color: 0xf7fbff,
      roughness: 0.5,
      metalness: 0.02,
    });
    const goldenChestMat = new THREE.MeshStandardMaterial({
      color: 0xffcf5c,
      emissive: 0x4a3000,
      emissiveIntensity: 0.18,
      roughness: 0.48,
      metalness: 0.04,
    });
    const orangeMat = new THREE.MeshStandardMaterial({
      color: 0xff8524,
      emissive: 0x5c1f00,
      emissiveIntensity: 0.28,
      roughness: 0.42,
      metalness: 0.05,
    });
    const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0b0f17 });
    const blushMat = new THREE.MeshBasicMaterial({ color: 0xff8da1, transparent: true, opacity: 0.55 });

    this.blackFeatherMat = blackFeatherMat;

    // 1. Streamlined Torso
    const torso = new THREE.Mesh(new THREE.SphereGeometry(0.46, 26, 22), blackFeatherMat);
    torso.scale.set(0.92, 1.46, 0.84);
    torso.castShadow = true;
    torso.receiveShadow = true;
    this.uprightRig.add(torso);

    // Snowy white belly
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.41, 22, 18), whiteBellyMat);
    belly.scale.set(0.81, 1.28, 0.62);
    belly.position.set(0, -0.05, -0.14);
    this.uprightRig.add(belly);

    // Warm Emperor-penguin golden upper chest & ear-patch glow
    const chestGlow = new THREE.Mesh(new THREE.SphereGeometry(0.33, 18, 14), goldenChestMat);
    chestGlow.scale.set(0.76, 0.52, 0.56);
    chestGlow.position.set(0, 0.37, -0.165);
    this.uprightRig.add(chestGlow);

    // Neck bridge sphere so swimming head arch looks seamless
    const neckBridge = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 14), blackFeatherMat);
    neckBridge.position.set(0, 0.58, 0.01);
    this.uprightRig.add(neckBridge);

    // 2. Expressive Head Group
    this.headPivot = new THREE.Group();
    this.headPivot.position.set(0, 0.62, 0);
    this.uprightRig.add(this.headPivot);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 22, 18), blackFeatherMat);
    head.position.set(0, 0.13, 0);
    head.scale.set(0.96, 1.0, 0.98);
    head.castShadow = true;
    this.headPivot.add(head);

    // Golden cheek patches
    [-1, 1].forEach((side) => {
      const cheekGold = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), goldenChestMat);
      cheekGold.scale.set(0.55, 0.88, 0.78);
      cheekGold.position.set(side * 0.21, 0.08, -0.11);
      this.headPivot.add(cheekGold);

      // Eyes
      const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(0.068, 12, 12), eyeWhiteMat);
      eyeWhite.position.set(side * 0.165, 0.17, -0.235);
      this.headPivot.add(eyeWhite);

      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.044, 10, 10), pupilMat);
      pupil.position.set(side * 0.178, 0.175, -0.28);
      this.headPivot.add(pupil);

      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 8), eyeWhiteMat);
      shine.position.set(side * 0.19, 0.195, -0.312);
      this.headPivot.add(shine);

      // Cute rosy cheek dot
      const blush = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 8), blushMat);
      blush.scale.set(1.2, 0.7, 0.5);
      blush.position.set(side * 0.215, 0.11, -0.245);
      this.headPivot.add(blush);
    });

    // Sleek two-tone orange beak pointing -Z in head space
    const upperBeakGeo = new THREE.ConeGeometry(0.095, 0.30, 12);
    upperBeakGeo.rotateX(-Math.PI / 2); // Tip points toward -Z
    const upperBeak = new THREE.Mesh(upperBeakGeo, orangeMat);
    upperBeak.scale.set(1.0, 0.68, 1.0);
    upperBeak.position.set(0, 0.13, -0.37);
    this.headPivot.add(upperBeak);

    // 3. Articulated Flippers (extend outward along -X and +X)
    const createFlipper = (side) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.36, 0.24, 0.02);

      const bladeGroup = new THREE.Group();
      const topBlade = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), blackFeatherMat);
      topBlade.scale.set(1.05, 0.34, 0.14);
      topBlade.position.set(side * 0.30, 0, 0.012);
      topBlade.castShadow = true;
      bladeGroup.add(topBlade);

      const underBlade = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 10), whiteBellyMat);
      underBlade.scale.set(0.98, 0.29, 0.11);
      underBlade.position.set(side * 0.29, 0, -0.018);
      bladeGroup.add(underBlade);

      pivot.add(bladeGroup);
      this.uprightRig.add(pivot);
      return pivot;
    };

    this.leftFlipper = createFlipper(-1);
    this.rightFlipper = createFlipper(1);

    // 4. Webbed Orange Feet & Tail
    const createFoot = (side) => {
      const footPivot = new THREE.Group();
      footPivot.position.set(side * 0.16, -0.64, -0.05);

      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.07, 0.28), orangeMat);
      paddle.position.set(0, -0.03, -0.08);
      footPivot.add(paddle);

      this.uprightRig.add(footPivot);
      return footPivot;
    };
    this.leftFoot = createFoot(-1);
    this.rightFoot = createFoot(1);

    const tailGeo = new THREE.ConeGeometry(0.13, 0.28, 8);
    tailGeo.rotateX(Math.PI * 0.68);
    this.tail = new THREE.Mesh(tailGeo, blackFeatherMat);
    this.tail.position.set(0, -0.58, 0.27);
    this.uprightRig.add(this.tail);

    this.scene.add(this.root);
  }

  _buildBubbleSystem() {
    this.bubbles = [];
    this.bubbleGeo = new THREE.SphereGeometry(0.075, 8, 8);
    this.bubbleMat = new THREE.MeshBasicMaterial({
      color: 0xdff9ff,
      transparent: true,
      opacity: 0.72,
    });
    this.bubbleSpawnTimer = 0;
  }

  spawnBubbles(count = 1, spread = 0.22) {
    if (this.pos.y > -0.15) return;
    for (let i = 0; i < count; i++) {
      const b = new THREE.Mesh(this.bubbleGeo, this.bubbleMat.clone());
      const scale = 0.55 + Math.random() * 1.1;
      b.scale.setScalar(scale);

      // Spawn slightly behind the penguin's flippers/feet
      const backX = Math.sin(this.yaw) * 0.65;
      const backZ = Math.cos(this.yaw) * 0.65;
      b.position.set(
        this.pos.x + backX + (Math.random() - 0.5) * spread,
        this.pos.y + (Math.random() - 0.5) * spread,
        this.pos.z + backZ + (Math.random() - 0.5) * spread
      );
      this.scene.add(b);
      this.bubbles.push({
        mesh: b,
        vy: 1.4 + Math.random() * 1.4,
        wobblePhase: Math.random() * Math.PI * 2,
        age: 0,
        maxAge: 1.4 + Math.random() * 0.9,
      });
    }
  }

  triggerDash(audio) {
    if (this.stamina < 25 || this.dashTimer > 0.12) return false;
    this.stamina = Math.max(0, this.stamina - 28);
    this.dashTimer = 0.48;
    if (this.onIceFloe) {
      // Hop forward off the ice!
      this.onIceFloe = false;
      this.inAir = true;
      this.vel.y = 5.4;
      const fx = -Math.sin(this.yaw);
      const fz = -Math.cos(this.yaw);
      this.vel.x += fx * 7.5;
      this.vel.z += fz * 7.5;
    } else {
      this.spawnBubbles(10, 0.45);
    }
    if (audio) audio.playDash();
    if (this.onRumble) this.onRumble(140, 0.55, 0.35);
    return true;
  }

  applyRingBoost(audio) {
    this.ringBoostTimer = 1.1;
    this.oxygen = Math.min(100, this.oxygen + 30);
    this.stamina = Math.min(100, this.stamina + 40);
    this.spawnBubbles(12, 0.55);
    if (audio) audio.playBubbleRing();
    if (this.onRumble) this.onRumble(160, 0.45, 0.25);
  }

  takeBump(fromPos, audio) {
    if (this.invincibleTimer > 0) return false;
    this.hearts = Math.max(0, this.hearts - 1);
    this.invincibleTimer = 2.2;

    const push = this.pos.clone().sub(fromPos);
    push.y = 0.35;
    if (push.lengthSq() < 0.001) push.set(0, 0.35, 1);
    push.normalize().multiplyScalar(11.5);
    this.vel.copy(push);
    this.spawnBubbles(14, 0.6);
    if (audio) audio.playBump();
    if (this.onRumble) this.onRumble(260, 0.85, 0.75);
    return true;
  }

  reset() {
    this.pos.set(0, -1.2, 2.5);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.bank = 0;
    this.standBlend = 0;
    this.onIceFloe = false;
    this.inAir = false;
    this.wasUnderwater = true;
    this.oxygen = 100;
    this.stamina = 100;
    this.hearts = this.maxHearts;
    this.invincibleTimer = 0;
    this.dashTimer = 0;
    this.ringBoostTimer = 0;
  }

  update(dt, elapsed, input, world, audio) {
    if (this.invincibleTimer > 0) {
      this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);
      // Subtle invincibility blink
      this.root.visible = Math.floor(this.invincibleTimer * 14) % 2 === 0 || this.invincibleTimer < 0.1;
    } else {
      this.root.visible = true;
    }

    if (this.dashTimer > 0) this.dashTimer = Math.max(0, this.dashTimer - dt);
    if (this.ringBoostTimer > 0) this.ringBoostTimer = Math.max(0, this.ringBoostTimer - dt);

    // Recharge dash stamina
    this.stamina = Math.min(100, this.stamina + 20 * dt);

    const waveY = getWaveHeight(this.pos.x, this.pos.z, elapsed);
    const floe = world.getFloeAt(this.pos.x, this.pos.z, -0.15);
    const floeDeckY = floe ? (floe.currentDeckY ?? floe.deckY) : -999;

    // Steering & movement input (combines keyboard + analog Xbox stick smoothly)
    const kbTurn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const kbForward = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    const padTurn = input.turnAnalog || 0;
    const padForward = input.forwardAnalog || 0;

    const turnInput = Math.abs(padTurn) > Math.abs(kbTurn) ? padTurn : kbTurn;
    const forwardInput = Math.abs(padForward) > Math.abs(kbForward) ? padForward : kbForward;
    const vertInput = (input.up ? 1 : 0) - (input.down ? 1 : 0);

    const turnRate = this.onIceFloe ? 2.6 : 2.35;
    this.yaw += turnInput * turnRate * dt;

    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);

    if (this.onIceFloe) {
      // --- WADDLING ON ICE FLOE MODE ---
      if (!floe) {
        // Walked right off the edge of the ice floe into the sea!
        this.onIceFloe = false;
        this.inAir = true;
      } else {
        this.pos.y = floeDeckY + 0.68;
        this.vel.y = 0;
        const walkSpeed = 4.4;
        const targetVx = fwdX * forwardInput * walkSpeed;
        const targetVz = fwdZ * forwardInput * walkSpeed;
        this.vel.x = THREE.MathUtils.lerp(this.vel.x, targetVx, 10 * dt);
        this.vel.z = THREE.MathUtils.lerp(this.vel.z, targetVz, 10 * dt);

        if (input.up) {
          // Cute penguin hop!
          this.onIceFloe = false;
          this.inAir = true;
          this.vel.y = 6.2;
          this.vel.x += fwdX * 2.5;
          this.vel.z += fwdZ * 2.5;
        }
      }
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0, 8 * dt);
      this.bank = THREE.MathUtils.lerp(this.bank, 0, 8 * dt);
      this.oxygen = Math.min(100, this.oxygen + 42 * dt);
    } else if (this.pos.y > waveY + 0.12) {
      // --- AIRBORNE / PORPOISING ARC ---
      this.inAir = true;
      this.vel.y -= 13.8 * dt; // Crisp gravity arc
      // Slight air steering
      this.vel.x += fwdX * forwardInput * 4.5 * dt;
      this.vel.z += fwdZ * forwardInput * 4.5 * dt;

      // Pitch follows ballistic trajectory arc naturally!
      const horizSpd = Math.max(1.5, Math.hypot(this.vel.x, this.vel.z));
      const arcPitch = Math.atan2(this.vel.y, horizSpd);
      this.pitch = THREE.MathUtils.lerp(this.pitch, THREE.MathUtils.clamp(arcPitch, -1.05, 1.05), 8 * dt);
      this.bank = THREE.MathUtils.lerp(this.bank, turnInput * 0.35, 6 * dt);
      this.oxygen = Math.min(100, this.oxygen + 38 * dt);
    } else {
      // --- SWIMMING IN THE POLAR SEA ---
      this.inAir = false;

      // Smooth pitch control from Space (up) / Shift (down)
      let targetPitch = vertInput * 0.72;
      // Near the surface, if not pressing Up or Down, gently level out unless diving
      if (vertInput === 0) {
        targetPitch = 0;
      }
      this.pitch = THREE.MathUtils.lerp(this.pitch, targetPitch, 5.5 * dt);
      this.bank = THREE.MathUtils.lerp(this.bank, turnInput * 0.46, 6.5 * dt);

      const baseSwimSpeed = 8.8;
      const dashBonus = this.dashTimer > 0 ? 7.2 : 0;
      const ringBonus = this.ringBoostTimer > 0 ? 5.2 : 0;
      const maxSpeed = baseSwimSpeed + dashBonus + ringBonus;

      // Pressing Space/A or Shift/B alone also propels slightly so vertical swimming feels effortless
      const activeThrust =
        Math.abs(forwardInput) > 0.01
          ? forwardInput > 0
            ? forwardInput
            : forwardInput * 0.45
          : vertInput !== 0
            ? 0.55
            : this.dashTimer > 0 || this.ringBoostTimer > 0
              ? 1.0
              : 0;

      // 3D forward vector including pitch
      const cosP = Math.cos(this.pitch);
      const dirX = fwdX * cosP;
      const dirY = Math.sin(this.pitch);
      const dirZ = fwdZ * cosP;

      if (activeThrust !== 0) {
        const desiredVx = dirX * maxSpeed * activeThrust;
        const desiredVy = dirY * maxSpeed * Math.abs(activeThrust) + vertInput * 3.4;
        const desiredVz = dirZ * maxSpeed * activeThrust;
        this.vel.x = THREE.MathUtils.lerp(this.vel.x, desiredVx, 5.2 * dt);
        this.vel.y = THREE.MathUtils.lerp(this.vel.y, desiredVy, 5.2 * dt);
        this.vel.z = THREE.MathUtils.lerp(this.vel.z, desiredVz, 5.2 * dt);
      } else {
        // Gentle hydrodynamic water drag + subtle neutral buoyancy
        const drag = Math.exp(-2.6 * dt);
        this.vel.multiplyScalar(drag);
        this.vel.y += 0.35 * dt;
      }

      // Breaching! If swimming near surface and holding Space (Up), launch into a porpoise leap!
      if (input.up && this.pos.y > waveY - 0.85 && this.vel.y > 1.2) {
        this.vel.y = Math.max(this.vel.y, 6.8 + (this.dashTimer > 0 ? 2.2 : 0));
        this.vel.x += fwdX * 2.4;
        this.vel.z += fwdZ * 2.4;
      }

      // Oxygen: refills near surface, slowly drains deep underwater
      if (this.pos.y > waveY - 0.95) {
        this.oxygen = Math.min(100, this.oxygen + 36 * dt);
      } else {
        this.oxygen = Math.max(0, this.oxygen - 3.6 * dt);
      }
    }

    // Integrate position
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);

    // Check landing on a flat-topped Ice Floe from above!
    const postFloe = world.getFloeAt(this.pos.x, this.pos.z, -0.15);
    if (!this.onIceFloe && postFloe) {
      const deckTop = (postFloe.currentDeckY ?? postFloe.deckY) + 0.68;
      if (prevY >= deckTop - 0.45 && this.pos.y <= deckTop && this.vel.y <= 0) {
        this.pos.y = deckTop;
        this.vel.y = 0;
        this.onIceFloe = true;
        this.inAir = false;
      } else if (this.pos.y < deckTop - 0.35 && this.pos.y > postFloe.keelBottomY) {
        // Push horizontally outside the submerged ice keel
        const dx = this.pos.x - postFloe.x;
        const dz = this.pos.z - postFloe.z;
        // Tapered cone keel radius shrinks with depth
        const depthT = THREE.MathUtils.clamp(
          1 - Math.abs(this.pos.y) / Math.abs(postFloe.keelBottomY),
          0.15,
          1.0
        );
        const keelR = postFloe.radius * depthT + 0.55;
        const dist = Math.hypot(dx, dz) || 0.001;
        if (dist < keelR) {
          this.pos.x = postFloe.x + (dx / dist) * keelR;
          this.pos.z = postFloe.z + (dz / dist) * keelR;
        }
      }
    }

    // Collide smoothly with tall Iceberg Spires
    for (const berg of world.obstacles) {
      if (this.pos.y > berg.bottomY) {
        const dx = this.pos.x - berg.x;
        const dz = this.pos.z - berg.z;
        const depthFactor =
          this.pos.y < 0
            ? THREE.MathUtils.clamp(1 - Math.abs(this.pos.y) / Math.abs(berg.bottomY), 0.25, 1.05)
            : 1.0;
        const minR = berg.radius * depthFactor + 0.65;
        const dist = Math.hypot(dx, dz) || 0.001;
        if (dist < minR) {
          const nx = dx / dist;
          const nz = dz / dist;
          this.pos.x = berg.x + nx * minR;
          this.pos.z = berg.z + nz * minR;
          const dot = this.vel.x * nx + this.vel.z * nz;
          if (dot < 0) {
            this.vel.x -= nx * dot;
            this.vel.z -= nz * dot;
          }
        }
      }
    }

    // Seabed floor clamp
    const floorY = getSeabedHeight(this.pos.x, this.pos.z) + 0.75;
    if (this.pos.y < floorY) {
      this.pos.y = floorY;
      if (this.vel.y < 0) this.vel.y = 0;
    }

    // Soft polar basin world boundary
    const radialDist = Math.hypot(this.pos.x, this.pos.z);
    if (radialDist > WORLD_RADIUS - 4) {
      const nx = this.pos.x / radialDist;
      const nz = this.pos.z / radialDist;
      this.pos.x = nx * (WORLD_RADIUS - 4);
      this.pos.z = nz * (WORLD_RADIUS - 4);
      this.vel.x -= nx * 4 * dt;
      this.vel.z -= nz * 4 * dt;
    }

    // Detect crossing the water surface for splashes & sound!
    const nowUnderwater = this.pos.y <= waveY + 0.05 && !this.onIceFloe;
    if (nowUnderwater !== this.wasUnderwater && !this.onIceFloe) {
      const impact = THREE.MathUtils.clamp(Math.abs(this.vel.y) / 6.0, 0.45, 1.4);
      world.spawnSplash(this.pos.x, this.pos.z, impact);
      if (audio) audio.playSplash(impact);
      if (this.onRumble) this.onRumble(110, 0.3 * impact, 0.18 * impact);
      if (nowUnderwater) {
        this.spawnBubbles(8, 0.4);
      }
    }
    this.wasUnderwater = nowUnderwater;

    // Continuous swimming bubble trail
    const speed = this.vel.length();
    if (nowUnderwater && speed > 2.2) {
      const rate = this.dashTimer > 0 || this.ringBoostTimer > 0 ? 0.03 : 0.09;
      this.bubbleSpawnTimer += dt;
      if (this.bubbleSpawnTimer >= rate) {
        this.bubbleSpawnTimer = 0;
        this.spawnBubbles(this.dashTimer > 0 ? 2 : 1, 0.25);
      }
    }

    this._updateAnimations(dt, speed, turnInput);
    this._updateBubbles(dt, waveY);
  }

  _updateAnimations(dt, speed, turnInput) {
    const targetStand = this.onIceFloe ? 1.0 : 0.0;
    this.standBlend = THREE.MathUtils.lerp(this.standBlend, targetStand, 9.0 * dt);

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    this.root.rotation.x = this.pitch * (1 - this.standBlend);
    this.root.rotation.z = this.bank * (1 - this.standBlend);

    // Transition body between horizontal torpedo (-90 deg) and upright waddle (0 deg)
    this.uprightRig.rotation.x = THREE.MathUtils.lerp(-Math.PI / 2, 0, this.standBlend);

    // Arch head sleekly forward when swimming, level when standing
    this.headPivot.rotation.x = THREE.MathUtils.lerp(1.36, 0, this.standBlend);
    this.headPivot.rotation.y = THREE.MathUtils.lerp(0, turnInput * 0.25, this.standBlend);

    if (this.standBlend > 0.5) {
      // Cute side-to-side waddling animation on ice floes!
      const moveFactor = THREE.MathUtils.clamp(speed / 3.8, 0, 1);
      this.waddleCycle += dt * (3.0 + speed * 2.6);
      this.uprightRig.rotation.z = Math.sin(this.waddleCycle) * 0.14 * moveFactor;

      // Flippers tucked slightly out to balance while waddling
      const flapBal = Math.sin(this.waddleCycle * 2) * 0.08 * moveFactor;
      this.leftFlipper.rotation.set(0, 0, 1.05 - moveFactor * 0.3 + flapBal);
      this.rightFlipper.rotation.set(0, 0, -1.05 + moveFactor * 0.3 - flapBal);

      // Alternating webbed foot steps
      this.leftFoot.rotation.x = Math.sin(this.waddleCycle) * 0.45 * moveFactor;
      this.rightFoot.rotation.x = -Math.sin(this.waddleCycle) * 0.45 * moveFactor;
    } else {
      this.uprightRig.rotation.z = 0;

      // Underwater wing-propelled flight!
      const flapFreq = 4.2 + speed * 0.95 + (this.dashTimer > 0 ? 6.0 : 0);
      this.swimCycle += dt * flapFreq;
      const amp = 0.22 + THREE.MathUtils.clamp(speed / 10, 0, 0.52);

      // Rotate around local Y so wings beat dorsally/ventrally in swimming posture, with feathering pitch!
      const stroke = Math.sin(this.swimCycle) * amp;
      const feather = Math.cos(this.swimCycle) * 0.28;

      this.leftFlipper.rotation.set(feather, stroke, 0.08);
      this.rightFlipper.rotation.set(feather, -stroke, -0.08);

      // Alternating rudder kicks on feet & tail wiggle
      this.leftFoot.rotation.x = 0.45 + Math.sin(this.swimCycle * 1.5) * 0.28;
      this.rightFoot.rotation.x = 0.45 - Math.sin(this.swimCycle * 1.5) * 0.28;
      this.tail.rotation.z = Math.sin(this.swimCycle) * 0.14;
    }
  }

  _updateBubbles(dt, waveY) {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.age += dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.position.x += Math.sin(b.age * 7 + b.wobblePhase) * 0.35 * dt;
      b.mesh.position.z += Math.cos(b.age * 6 + b.wobblePhase) * 0.35 * dt;

      const lifeT = b.age / b.maxAge;
      b.mesh.material.opacity = (1 - lifeT) * 0.72;

      if (b.age >= b.maxAge || b.mesh.position.y >= waveY) {
        this.scene.remove(b.mesh);
        b.mesh.material.dispose();
        this.bubbles.splice(i, 1);
      }
    }
  }
}
