import * as THREE from 'three';
import { getSeabedHeight } from './world.js';

function createFishMesh(isGolden = false) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';

  const bodyMat = new THREE.MeshStandardMaterial({
    color: isGolden ? 0xffcf40 : 0x6fe3ff,
    emissive: isGolden ? 0x6b4400 : 0x0b4c6e,
    emissiveIntensity: isGolden ? 0.45 : 0.3,
    roughness: 0.22,
    metalness: 0.65,
  });

  // Fusiform body along Z (-Z is forward)
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), bodyMat);
  body.scale.set(0.46, 0.72, 1.55);
  group.add(body);

  // Dorsal fin
  const dorsalGeo = new THREE.ConeGeometry(0.08, 0.20, 4);
  const dorsal = new THREE.Mesh(dorsalGeo, bodyMat);
  dorsal.position.set(0, 0.16, 0.04);
  dorsal.rotation.x = -0.35;
  group.add(dorsal);

  // Tail fin pivot at +Z
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, 0.30);
  const tailGeo = new THREE.ConeGeometry(0.16, 0.26, 4);
  tailGeo.rotateX(-Math.PI / 2); // Base at +Z, apex at torso
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.scale.set(0.28, 1.15, 1.0);
  tail.position.set(0, 0, 0.12);
  tailPivot.add(tail);
  group.add(tailPivot);

  // Tiny dark eyes
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x0a1017 });
  [-1, 1].forEach((side) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 6), eyeMat);
    eye.position.set(side * 0.085, 0.035, -0.22);
    group.add(eye);
  });

  if (isGolden) {
    group.scale.setScalar(1.32);
  }

  return { group, tailPivot };
}

export class CollectibleManager {
  constructor(scene) {
    this.scene = scene;
    this.fishes = [];
    this.rings = [];
    this.popEffects = [];

    this._spawnInitialFish();
    this._spawnCourseRings();
  }

  _spawnInitialFish() {
    const totalFish = 34;
    for (let i = 0; i < totalFish; i++) {
      const isGolden = i % 8 === 7;
      const { group, tailPivot } = createFishMesh(isGolden);
      const fish = {
        group,
        tailPivot,
        isGolden,
        cx: 0,
        cz: 0,
        baseY: -3,
        orbitRadius: 4,
        angle: 0,
        angularSpeed: 0.7,
        wigglePhase: Math.random() * Math.PI * 2,
      };
      this._placeFishRandomly(fish, i < 8);
      this.scene.add(group);
      this.fishes.push(fish);
    }
  }

  _placeFishRandomly(fish, nearCenter = false) {
    const minR = nearCenter ? 5 : 9;
    const maxR = nearCenter ? 18 : 54;
    const r = minR + Math.random() * (maxR - minR);
    const theta = Math.random() * Math.PI * 2;
    fish.cx = Math.cos(theta) * r;
    fish.cz = Math.sin(theta) * r;

    const floorY = getSeabedHeight(fish.cx, fish.cz);
    fish.baseY = THREE.MathUtils.clamp(-1.8 - Math.random() * 11.5, floorY + 2.0, -1.5);
    fish.orbitRadius = 2.8 + Math.random() * 4.5;
    fish.angle = Math.random() * Math.PI * 2;
    fish.angularSpeed = (0.55 + Math.random() * 0.55) * (Math.random() < 0.5 ? 1 : -1);

    const x = fish.cx + Math.cos(fish.angle) * fish.orbitRadius;
    const z = fish.cz + Math.sin(fish.angle) * fish.orbitRadius;
    fish.group.position.set(x, fish.baseY, z);
  }

  _spawnCourseRings() {
    // 6 permanent shimmering underwater bubble rings to swim through!
    const ringSpots = [
      { x: 0, y: -3.2, z: -10, yaw: 0 },
      { x: -12, y: -5.0, z: -20, yaw: 0.55 },
      { x: 14, y: -4.4, z: -18, yaw: -0.45 },
      { x: -18, y: -6.5, z: 8, yaw: 1.2 },
      { x: 19, y: -5.8, z: 10, yaw: -1.1 },
      { x: 2, y: -7.5, z: -32, yaw: 0.1 },
    ];

    ringSpots.forEach((spot, i) => {
      this._createRing(new THREE.Vector3(spot.x, spot.y, spot.z), spot.yaw, true, i);
    });
  }

  _createRing(pos, yaw, permanent = false, seed = 0) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = yaw;

    const torusMat = new THREE.MeshStandardMaterial({
      color: permanent ? 0x62f4ff : 0xb5fffc,
      emissive: 0x16a8c7,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.82,
      roughness: 0.15,
    });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.42, 0.085, 12, 32), torusMat);
    group.add(torus);

    // Tiny decorative pearl bubbles around the ring
    const pearlGeo = new THREE.SphereGeometry(0.075, 8, 8);
    const pearlMat = new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const p = new THREE.Mesh(pearlGeo, pearlMat);
      p.position.set(Math.cos(a) * 1.42, Math.sin(a) * 1.42, 0);
      group.add(p);
    }

    this.scene.add(group);
    const ringObj = {
      group,
      torus,
      permanent,
      cooldown: 0,
      vel: new THREE.Vector3(0, 0, 0),
      age: 0,
      maxAge: permanent ? Infinity : 9.0,
      seed,
      baseY: pos.y,
    };
    this.rings.push(ringObj);
    return ringObj;
  }

  spawnBubbleRing(origin, forwardDir) {
    if (this.rings.filter((r) => !r.permanent).length >= 5) return;
    const yaw = Math.atan2(-forwardDir.x, -forwardDir.z);
    const ring = this._createRing(origin, yaw, false, Math.random() * 10);
    ring.vel.copy(forwardDir).multiplyScalar(1.35);
    ring.vel.y += 0.25; // Slowly floats upward
  }

  _spawnSparkleBurst(pos, colorHex) {
    const count = 10;
    const geo = new THREE.SphereGeometry(0.07, 6, 6);
    const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 1 });
    const particles = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(pos);
      this.scene.add(m);
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.5) * Math.PI;
      const spd = 2.2 + Math.random() * 2.5;
      particles.push({
        mesh: m,
        vx: Math.cos(theta) * Math.cos(phi) * spd,
        vy: Math.sin(phi) * spd + 1.0,
        vz: Math.sin(theta) * Math.cos(phi) * spd,
      });
    }
    this.popEffects.push({ particles, mat, geo, age: 0, maxAge: 0.55 });
  }

  update(dt, elapsed, penguin, audio, onCollect) {
    // 1. Update Fish Schools & Catch Check
    for (const f of this.fishes) {
      const prevX = f.group.position.x;
      const prevZ = f.group.position.z;

      f.angle += f.angularSpeed * dt;
      const nx = f.cx + Math.cos(f.angle) * f.orbitRadius;
      const nz = f.cz + Math.sin(f.angle) * f.orbitRadius;
      const ny = f.baseY + Math.sin(elapsed * 1.8 + f.wigglePhase) * 0.42;

      f.group.position.set(nx, ny, nz);

      const dx = nx - prevX;
      const dz = nz - prevZ;
      if (Math.abs(dx) + Math.abs(dz) > 0.0001) {
        f.group.rotation.y = Math.atan2(-dx, -dz);
      }
      f.tailPivot.rotation.y = Math.sin(elapsed * 15 + f.wigglePhase) * 0.48;

      // Catch check!
      const catchDist = penguin.dashTimer > 0 ? 1.65 : 1.32;
      if (f.group.position.distanceTo(penguin.pos) < catchDist) {
        const pts = f.isGolden ? 50 : 10;
        this._spawnSparkleBurst(f.group.position, f.isGolden ? 0xffdf5e : 0x7ef2ff);
        if (audio) audio.playCatchFish(f.isGolden);

        penguin.stamina = Math.min(100, penguin.stamina + (f.isGolden ? 50 : 18));
        if (f.isGolden && penguin.hearts < penguin.maxHearts) {
          penguin.hearts += 1;
        }

        if (onCollect) {
          onCollect({
            type: f.isGolden ? 'golden-fish' : 'fish',
            points: pts,
            label: f.isGolden ? 'Golden Fish! +50' : '+10',
            pos: f.group.position.clone(),
          });
        }

        // Respawn fish in another polar reef spot
        this._placeFishRandomly(f, false);
      }
    }

    // 2. Update Shimmering Bubble Rings
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      if (r.cooldown > 0) {
        r.cooldown = Math.max(0, r.cooldown - dt);
        r.torus.material.opacity = 0.25;
      } else {
        r.torus.material.opacity = r.permanent ? 0.82 : (1 - r.age / r.maxAge) * 0.85;
      }

      if (r.permanent) {
        r.group.position.y = r.baseY + Math.sin(elapsed * 1.4 + r.seed) * 0.28;
        r.group.rotation.z = elapsed * 0.65;
      } else {
        r.age += dt;
        r.group.position.addScaledVector(r.vel, dt);
        r.vel.multiplyScalar(Math.exp(-0.5 * dt));
        r.group.rotation.z = elapsed * 1.1;
        if (r.age >= r.maxAge || r.group.position.y > -0.25) {
          this.scene.remove(r.group);
          r.torus.geometry.dispose();
          r.torus.material.dispose();
          this.rings.splice(i, 1);
          continue;
        }
      }

      // Check penguin swimming through the ring!
      if (r.cooldown <= 0 && r.group.position.distanceTo(penguin.pos) < 1.75) {
        penguin.applyRingBoost(audio);
        this._spawnSparkleBurst(r.group.position, 0x99ffff);
        if (onCollect) {
          onCollect({
            type: 'ring',
            points: 25,
            label: 'Bubble Ring Boost! +25',
            pos: r.group.position.clone(),
          });
        }
        if (r.permanent) {
          r.cooldown = 6.5;
        } else {
          this.scene.remove(r.group);
          r.torus.geometry.dispose();
          r.torus.material.dispose();
          this.rings.splice(i, 1);
        }
      }
    }

    // 3. Update Sparkle Bursts
    for (let i = this.popEffects.length - 1; i >= 0; i--) {
      const fx = this.popEffects[i];
      fx.age += dt;
      const t = fx.age / fx.maxAge;
      if (t >= 1) {
        for (const p of fx.particles) this.scene.remove(p.mesh);
        fx.geo.dispose();
        fx.mat.dispose();
        this.popEffects.splice(i, 1);
        continue;
      }
      fx.mat.opacity = 1 - t;
      for (const p of fx.particles) {
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
      }
    }
  }
}
