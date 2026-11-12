import * as THREE from 'three';

export const WORLD_RADIUS = 85;
export const SEABED_BASE_Y = -18.5;

export function getWaveHeight(x, z, time) {
  return (
    Math.sin(x * 0.14 + time * 1.45) * 0.22 +
    Math.cos(z * 0.17 - time * 1.15) * 0.18 +
    Math.sin((x + z) * 0.08 + time * 0.85) * 0.14
  );
}

export function getSeabedHeight(x, z) {
  const hills =
    Math.sin(x * 0.065) * 1.6 +
    Math.cos(z * 0.075) * 1.4 +
    Math.sin((x - z) * 0.04) * 1.1;
  // Gently rise near the outer edge to form a natural polar basin, staying safely submerged
  const dist = Math.hypot(x, z);
  const rim = Math.min(11.5, Math.max(0, (dist - 65) * 0.22));
  return SEABED_BASE_Y + hills + rim;
}

export class PolarWorld {
  constructor(scene) {
    this.scene = scene;
    this.iceFloes = []; // Walkable flat-topped ice floes
    this.obstacles = []; // Underwater iceberg keels & tall spires (cylindrical colliders)
    this.splashes = [];
    this.kelpClusters = [];
    this.ventColumns = [];

    this._setupLighting();
    this._createSkyAndHorizon();
    this._createOceanSurface();
    this._createSeabed();
    this._createIceStructures();
    this._createKelpAndRocks();
    this._createSunbeams();
    this._createAmbientParticles();
  }

  _setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xdff6ff, 0x0b3d59, 1.35);
    this.scene.add(this.hemiLight);

    this.sunDir = new THREE.Vector3(0.52, 0.76, -0.38).normalize();
    this.sunLight = new THREE.DirectionalLight(0xfff4dc, 2.1);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(70);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 160;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Subtle upward cyan bounce light from the glowing polar water
    this.underwaterFill = new THREE.DirectionalLight(0x28c7fa, 0.65);
    this.underwaterFill.position.set(-15, -25, 20);
    this.scene.add(this.underwaterFill);
  }

  _createSkyAndHorizon() {
    // Polar sky dome shader
    const skyGeo = new THREE.SphereGeometry(210, 36, 24);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunDir: { value: this.sunDir.clone() },
        uTime: { value: 0 },
        uCameraUnderwater: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir;
        uniform float uTime;
        uniform float uCameraUnderwater;
        varying vec3 vWorldDir;

        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, -0.3, 1.0);

          vec3 zenith = vec3(0.16, 0.48, 0.82);
          vec3 midSky = vec3(0.52, 0.80, 0.96);
          vec3 horizon = vec3(0.95, 0.91, 0.86);
          vec3 deepBelow = vec3(0.024, 0.282, 0.40);

          vec3 col = h >= 0.0
            ? mix(horizon, mix(midSky, zenith, pow(h, 0.65)), smoothstep(0.0, 0.42, h))
            : mix(horizon, deepBelow, smoothstep(-0.04, -0.25, h));

          // Soft polar aurora ribbon high in the sky
          float auroraWave = sin(dir.x * 6.0 + uTime * 0.25) * 0.5 + 0.5;
          float auroraBand = exp(-pow((h - 0.36 - auroraWave * 0.06) * 8.5, 2.0)) * smoothstep(0.1, 0.5, -dir.z);
          col += vec3(0.12, 0.55, 0.45) * auroraBand * 0.24;

          // Glowing polar sun disc & warm halo
          float sunAmt = max(dot(dir, normalize(uSunDir)), 0.0);
          col += vec3(1.0, 0.84, 0.58) * pow(sunAmt, 10.0) * 0.38;
          col += vec3(1.0, 0.97, 0.90) * smoothstep(0.9965, 0.9992, sunAmt) * 1.4;

          // Seamless deep ocean horizon when camera is underwater
          if (uCameraUnderwater > 0.5) {
            col = mix(deepBelow, col, smoothstep(0.02, 0.18, h));
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    // Distant ring of snowy polar mountains / glaciers on the horizon
    const mountainGroup = new THREE.Group();
    const snowPeakMat = new THREE.MeshStandardMaterial({
      color: 0xeaf6ff,
      roughness: 0.75,
      metalness: 0.05,
      flatShading: true,
    });
    const glacierBaseMat = new THREE.MeshStandardMaterial({
      color: 0x8cc9e8,
      roughness: 0.6,
      metalness: 0.08,
      flatShading: true,
    });

    const peakCount = 26;
    for (let i = 0; i < peakCount; i++) {
      const angle = (i / peakCount) * Math.PI * 2 + (i % 2) * 0.06;
      const dist = 132 + (i % 3) * 12;
      const height = 16 + ((i * 7) % 22);
      const radius = 14 + ((i * 5) % 12);

      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(radius, height, 6),
        i % 3 === 0 ? glacierBaseMat : snowPeakMat
      );
      cone.position.set(Math.cos(angle) * dist, height * 0.36 - 2.0, Math.sin(angle) * dist);
      cone.rotation.y = i * 0.9;
      mountainGroup.add(cone);
    }
    this.scene.add(mountainGroup);
  }

  _createOceanSurface() {
    const geo = new THREE.PlaneGeometry(460, 460, 160, 160);
    geo.rotateX(-Math.PI / 2);

    this.waterUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: this.sunDir.clone() },
      uCameraUnderwater: { value: 0 },
      uFogColor: { value: new THREE.Color(0x064866) },
      uFogDensity: { value: 0.022 },
      uFloeCenters: { value: [] },
      uFloeCount: { value: 0 },
    };

    // Pad uniform array to 12 vec4s (x, z, radius, unused)
    for (let i = 0; i < 12; i++) {
      this.waterUniforms.uFloeCenters.value.push(new THREE.Vector4(9999, 9999, 1, 0));
    }

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: this.waterUniforms,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;

        float waveH(vec2 p, float t) {
          return sin(p.x * 0.14 + t * 1.45) * 0.22
               + cos(p.y * 0.17 - t * 1.15) * 0.18
               + sin((p.x + p.y) * 0.08 + t * 0.85) * 0.14;
        }

        void main() {
          vec3 pos = position;
          float h = waveH(pos.xz, uTime);
          // Fine surface ripples
          h += sin(pos.x * 0.65 - uTime * 2.4) * 0.035 + cos(pos.z * 0.72 + uTime * 2.1) * 0.035;
          pos.y += h;

          float eps = 0.35;
          float hx = waveH(pos.xz + vec2(eps, 0.0), uTime) - waveH(pos.xz - vec2(eps, 0.0), uTime);
          float hz = waveH(pos.xz + vec2(0.0, eps), uTime) - waveH(pos.xz - vec2(0.0, eps), uTime);
          vec3 n = normalize(vec3(-hx, 2.0 * eps, -hz));

          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          vNormalW = n;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform float uCameraUnderwater;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        uniform vec4 uFloeCenters[12];
        uniform int uFloeCount;

        varying vec3 vWorldPos;
        varying vec3 vNormalW;

        void main() {
          vec3 viewVec = cameraPosition - vWorldPos;
          float dist = length(viewVec);
          vec3 V = viewVec / max(dist, 0.0001);
          vec3 N = normalize(vNormalW);

          // Foam ring around ice floes & icebergs
          float iceFoam = 0.0;
          for (int i = 0; i < 12; i++) {
            if (i >= uFloeCount) break;
            float d = length(vWorldPos.xz - uFloeCenters[i].xy) - uFloeCenters[i].z;
            float ring = smoothstep(1.6, 0.0, abs(d - 0.35)) * (0.65 + 0.35 * sin(d * 5.5 - uTime * 3.2));
            iceFoam = max(iceFoam, ring);
          }

          if (gl_FrontFacing) {
            // Looking DOWN at ocean from above
            float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.2);
            vec3 deepCol = vec3(0.03, 0.30, 0.48);
            vec3 shallowCol = vec3(0.08, 0.62, 0.78);
            vec3 skyRefl = vec3(0.72, 0.89, 0.99);

            vec3 col = mix(shallowCol, deepCol, clamp(dist / 95.0, 0.0, 1.0));
            col = mix(col, skyRefl, clamp(fresnel * 0.78, 0.0, 0.85));

            // Crisp sun sparkle
            vec3 H = normalize(normalize(uSunDir) + V);
            float spec = pow(max(dot(N, H), 0.0), 96.0);
            col += vec3(1.0, 0.96, 0.85) * spec * 1.15;

            // Wave crest shimmer + ice foam
            float crest = smoothstep(0.26, 0.46, vWorldPos.y);
            float foam = clamp(iceFoam * 0.85 + crest * 0.25, 0.0, 1.0);
            col = mix(col, vec3(0.95, 0.99, 1.0), foam);

            float alpha = mix(0.76, 0.96, clamp(fresnel + foam * 0.5, 0.0, 1.0));
            // Fade smoothly into horizon sky
            float horizonFade = smoothstep(115.0, 158.0, dist);
            col = mix(col, vec3(0.84, 0.90, 0.92), horizonFade);
            gl_FragColor = vec4(col, alpha);
          } else {
            // Looking UP at ocean surface from underwater (Snell's window!)
            vec3 Nu = -N;
            float cosTheta = max(dot(Nu, V), 0.0);
            // Critical angle for water-to-air (~48.6 deg -> cos ~ 0.66)
            float snellWindow = smoothstep(0.42, 0.74, cosTheta);

            vec3 skyThroughWater = vec3(0.66, 0.93, 1.0);
            vec3 totalInternalRefl = vec3(0.04, 0.44, 0.62);
            vec3 col = mix(totalInternalRefl, skyThroughWater, snellWindow);

            // Sun glow refracting through ripples
            vec3 H = normalize(normalize(uSunDir) + V);
            float sunSparkle = pow(max(dot(-Nu, normalize(uSunDir)), 0.0), 12.0) * snellWindow;
            col += vec3(1.0, 0.97, 0.85) * sunSparkle * 0.55;
            col = mix(col, vec3(0.94, 0.99, 1.0), iceFoam * 0.7);

            // Apply underwater exponential fog so distant surface blends cleanly
            float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist * 0.65);
            col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
            float alpha = mix(0.86, 0.52, snellWindow);
            gl_FragColor = vec4(col, alpha);
          }
        }
      `,
    });

    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.renderOrder = 2;
    this.scene.add(this.waterMesh);
  }

  _createSeabed() {
    const geo = new THREE.PlaneGeometry(240, 240, 96, 96);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, getSeabedHeight(x, z));
    }
    geo.computeVertexNormals();

    this.seabedUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: this.sunDir.clone() },
      uFogColor: { value: new THREE.Color(0x064866) },
      uFogDensity: { value: 0.018 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.seabedUniforms,
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec3 vNormalW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          vNormalW = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vWorldPos;
        varying vec3 vNormalW;

        float causticPattern(vec2 uv, float t) {
          vec2 p = uv * 0.26;
          float c1 = sin(p.x * 3.1 + t * 1.4 + cos(p.y * 2.7 - t * 1.1));
          float c2 = cos(p.y * 3.4 - t * 1.2 + sin(p.x * 2.9 + t * 1.5));
          float v = abs(c1 + c2);
          return pow(clamp(1.0 - v * 0.55, 0.0, 1.0), 3.0);
        }

        void main() {
          vec3 N = normalize(vNormalW);
          float diff = max(dot(N, normalize(uSunDir)), 0.0) * 0.65 + 0.35;

          // Blend warm polar sand in hollows and slate rock on slopes
          float slope = 1.0 - clamp(N.y, 0.0, 1.0);
          vec3 sandCol = vec3(0.24, 0.46, 0.54);
          vec3 rockCol = vec3(0.12, 0.25, 0.34);
          vec3 baseCol = mix(sandCol, rockCol, smoothstep(0.08, 0.35, slope));

          // Dancing underwater caustics stronger in shallower areas
          float c = causticPattern(vWorldPos.xz, uTime) + causticPattern(vWorldPos.xz * 1.45 + 7.3, uTime * 0.85) * 0.6;
          float depthAtten = smoothstep(-23.0, -7.0, vWorldPos.y);
          vec3 col = baseCol * diff + vec3(0.22, 0.72, 0.88) * c * 0.34 * depthAtten * max(N.y, 0.0);

          float dist = length(cameraPosition - vWorldPos);
          float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const seabed = new THREE.Mesh(geo, mat);
    seabed.receiveShadow = true;
    this.scene.add(seabed);
  }

  _createIceStructures() {
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xf5fbff,
      roughness: 0.65,
      metalness: 0.04,
      flatShading: true,
    });

    const submergedIceMat = new THREE.MeshStandardMaterial({
      color: 0x5fd3f3,
      emissive: 0x0b4c6b,
      emissiveIntensity: 0.35,
      roughness: 0.28,
      metalness: 0.1,
      flatShading: true,
    });

    // 1. Flat-topped walkable Ice Floes (penguin can jump on top & waddle, seals bask near them!)
    const floeConfigs = [
      { x: 0, z: 9, radius: 5.2, deckY: 0.55 },     // Home floe right behind spawn
      { x: -20, z: -16, radius: 6.0, deckY: 0.60 },
      { x: 24, z: -14, radius: 5.0, deckY: 0.52 },
      { x: -26, z: 22, radius: 4.8, deckY: 0.55 },
      { x: 26, z: 24, radius: 5.8, deckY: 0.58 },
      { x: 3, z: -36, radius: 6.4, deckY: 0.62 },
    ];

    floeConfigs.forEach((cfg, idx) => {
      const group = new THREE.Group();
      group.position.set(cfg.x, 0, cfg.z);

      // Walkable snowy top slab (10-sided slightly irregular polygon cylinder)
      const topGeo = new THREE.CylinderGeometry(cfg.radius * 0.96, cfg.radius * 1.05, cfg.deckY + 0.45, 10);
      const posAttr = topGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const angle = Math.atan2(vz, vx);
        const radialScale = 0.94 + 0.09 * Math.sin(angle * 3 + idx * 1.7);
        posAttr.setX(i, vx * radialScale);
        posAttr.setZ(i, vz * radialScale);
      }
      topGeo.computeVertexNormals();

      const topMesh = new THREE.Mesh(topGeo, snowMat);
      topMesh.position.y = (cfg.deckY - 0.45) * 0.5;
      topMesh.castShadow = true;
      topMesh.receiveShadow = true;
      group.add(topMesh);

      // Deep glowing blue underwater ice keel tapering down so penguin can swim under it!
      const keelDepth = 4.2 + (idx % 3) * 1.4;
      const keelGeo = new THREE.ConeGeometry(cfg.radius * 0.92, keelDepth, 9);
      keelGeo.rotateX(Math.PI); // Point downward
      const keelPos = keelGeo.attributes.position;
      for (let i = 0; i < keelPos.count; i++) {
        keelPos.setX(i, keelPos.getX(i) * (0.9 + 0.14 * Math.cos(i + idx)));
        keelPos.setZ(i, keelPos.getZ(i) * (0.9 + 0.14 * Math.sin(i * 1.3 + idx)));
      }
      keelGeo.computeVertexNormals();

      const keelMesh = new THREE.Mesh(keelGeo, submergedIceMat);
      keelMesh.position.y = -keelDepth * 0.5 - 0.2;
      group.add(keelMesh);

      this.scene.add(group);

      const floeData = {
        x: cfg.x,
        z: cfg.z,
        radius: cfg.radius * 0.92,
        deckY: cfg.deckY,
        keelBottomY: -keelDepth - 0.2,
        group,
        phase: idx * 1.15,
      };
      this.iceFloes.push(floeData);
    });

    // 2. Tall scenic sculpted Iceberg Spires around the sea
    const bergConfigs = [
      { x: -38, z: -4, radius: 5.5, height: 11.5, keelDepth: 9.5 },
      { x: 38, z: 4, radius: 6.2, height: 13.0, keelDepth: 11.0 },
      { x: -16, z: -44, radius: 5.0, height: 9.5, keelDepth: 8.5 },
      { x: 22, z: -42, radius: 5.8, height: 12.0, keelDepth: 10.0 },
      { x: -4, z: 42, radius: 6.5, height: 13.5, keelDepth: 10.5 },
    ];

    bergConfigs.forEach((cfg, idx) => {
      const group = new THREE.Group();
      group.position.set(cfg.x, 0, cfg.z);

      // Twin-peaked crystalline spire above water (sunk slightly so base never gaps in wave troughs)
      const spire1 = new THREE.Mesh(new THREE.ConeGeometry(cfg.radius, cfg.height + 1.2, 7), snowMat);
      spire1.position.y = cfg.height * 0.45 - 0.95;
      spire1.rotation.y = idx * 0.8;
      spire1.castShadow = true;
      spire1.receiveShadow = true;
      group.add(spire1);

      const spire2 = new THREE.Mesh(
        new THREE.ConeGeometry(cfg.radius * 0.68, cfg.height * 0.7 + 1.0, 6),
        snowMat
      );
      spire2.position.set(cfg.radius * 0.42, cfg.height * 0.3 - 0.9, cfg.radius * 0.22);
      spire2.rotation.z = -0.12;
      spire2.castShadow = true;
      group.add(spire2);

      // Deep underwater glacial root
      const rootGeo = new THREE.ConeGeometry(cfg.radius * 1.05, cfg.keelDepth, 7);
      rootGeo.rotateX(Math.PI);
      const rootMesh = new THREE.Mesh(rootGeo, submergedIceMat);
      rootMesh.position.y = -cfg.keelDepth * 0.5;
      group.add(rootMesh);

      this.scene.add(group);
      this.obstacles.push({
        x: cfg.x,
        z: cfg.z,
        radius: cfg.radius * 0.9,
        topY: cfg.height,
        bottomY: -cfg.keelDepth,
        group,
        phase: idx * 1.7 + 0.5,
      });
    });

    // Populate water shader foam ring centers
    const allFoamSources = [...this.iceFloes, ...this.obstacles].slice(0, 12);
    this.waterUniforms.uFloeCount.value = allFoamSources.length;
    allFoamSources.forEach((item, i) => {
      this.waterUniforms.uFloeCenters.value[i].set(item.x, item.z, item.radius, 0);
    });
  }

  _createKelpAndRocks() {
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x264659,
      roughness: 0.88,
      flatShading: true,
    });
    const coralColors = [0xff7a6b, 0xffbe55, 0xc77dff, 0x38e8b0];

    // Scatter seabed rocks & glowing polar sea anemones
    for (let i = 0; i < 38; i++) {
      const angle = i * 2.39996; // Golden angle distribution
      const r = 8 + Math.sqrt(i / 38) * 56;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const y = getSeabedHeight(x, z);

      const scale = 0.9 + (i % 5) * 0.48;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(scale, 0), rockMat);
      rock.position.set(x, y + scale * 0.32, z);
      rock.scale.set(1.25, 0.72, 1.05);
      rock.rotation.set(i * 0.5, i * 1.1, 0);
      this.scene.add(rock);

      // Add colorful polar sea anemone / coral tuft on every 2nd rock
      if (i % 2 === 0) {
        const col = coralColors[(i / 2) % coralColors.length];
        const anemoneMat = new THREE.MeshStandardMaterial({
          color: col,
          emissive: col,
          emissiveIntensity: 0.25,
          roughness: 0.5,
          flatShading: true,
        });
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(scale * 0.36, 1), anemoneMat);
        crown.position.set(x, y + scale * 0.72, z);
        crown.scale.set(1.2, 0.65, 1.2);
        this.scene.add(crown);
      }
    }

    // Swaying underwater kelp forests
    const kelpMat = new THREE.MeshStandardMaterial({
      color: 0x1ea87a,
      emissive: 0x083b2e,
      emissiveIntensity: 0.3,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });

    for (let k = 0; k < 28; k++) {
      const angle = k * 2.39996 + 0.9;
      const r = 10 + ((k * 13) % 48);
      const cx = Math.cos(angle) * r;
      const cz = Math.sin(angle) * r;
      const baseY = getSeabedHeight(cx, cz);

      const stalkCount = 3 + (k % 3);
      for (let s = 0; s < stalkCount; s++) {
        const ox = cx + (s - 1) * 0.85;
        const oz = cz + ((s * 7) % 3 - 1) * 0.75;
        const height = 4.2 + ((k + s) % 5) * 1.25;

        const segs = 7;
        const bladeGeo = new THREE.PlaneGeometry(0.46, height, 1, segs);
        bladeGeo.translate(0, height * 0.5, 0);
        // Taper tip & add natural wave curl
        const pos = bladeGeo.attributes.position;
        for (let vi = 0; vi < pos.count; vi++) {
          const py = pos.getY(vi);
          const t = py / height;
          const widthScale = Math.sin(t * Math.PI * 0.88 + 0.15);
          pos.setX(vi, pos.getX(vi) * widthScale);
          pos.setZ(vi, Math.sin(t * 5.0) * 0.18);
        }
        bladeGeo.computeVertexNormals();

        const mesh = new THREE.Mesh(bladeGeo, kelpMat);
        mesh.position.set(ox, baseY - 0.15, oz);
        mesh.rotation.y = (k * 1.7 + s * 2.1) % (Math.PI * 2);
        this.scene.add(mesh);
        this.kelpClusters.push({
          mesh,
          baseRotY: mesh.rotation.y,
          phase: k * 0.8 + s * 1.3,
          speed: 1.2 + (s % 3) * 0.25,
        });
      }
    }
  }

  _createSunbeams() {
    this.sunbeamGroup = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0x7ce8ff,
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    for (let i = 0; i < 12; i++) {
      const radiusTop = 1.4 + (i % 3) * 0.8;
      const radiusBottom = 4.2 + (i % 4) * 1.4;
      const height = 19;
      const geo = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 12, 1, true);
      const beam = new THREE.Mesh(geo, beamMat.clone());

      const angle = (i / 12) * Math.PI * 2 + 0.3;
      const dist = 8 + (i % 4) * 10;
      beam.position.set(Math.cos(angle) * dist, -9.2, Math.sin(angle) * dist);
      // Tilt parallel to refracted sunlight
      beam.rotation.z = -0.22;
      beam.rotation.x = 0.14;
      beam.userData = { baseOpacity: 0.04 + (i % 3) * 0.015, phase: i * 0.9 };
      this.sunbeamGroup.add(beam);
    }
    this.scene.add(this.sunbeamGroup);
  }

  _createAmbientParticles() {
    // Drifting underwater plankton / micro-bubbles + polar snow above water
    const count = 550;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 110;
      const isSnow = i >= 380;
      positions[i * 3 + 1] = isSnow ? Math.random() * 18 + 0.5 : -Math.random() * 17.5 - 0.3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 110;
      speeds[i] = isSnow ? -(0.6 + Math.random() * 0.7) : 0.35 + Math.random() * 0.55;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xdaf8ff,
      size: 0.22,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    this.ambientPoints = new THREE.Points(geo, mat);
    this.ambientSpeeds = speeds;
    this.scene.add(this.ambientPoints);
  }

  spawnSplash(x, z, intensity = 1.0) {
    const ringGeo = new THREE.RingGeometry(0.28, 0.58, 24);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(x, getWaveHeight(x, z, this.waterUniforms.uTime.value) + 0.06, z);
    this.scene.add(ring);

    // Droplets arc
    const droplets = [];
    const dropCount = Math.min(12, Math.round(6 * intensity));
    const dropGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0xe8fbff, transparent: true, opacity: 0.9 });
    for (let i = 0; i < dropCount; i++) {
      const m = new THREE.Mesh(dropGeo, dropMat);
      const a = (i / dropCount) * Math.PI * 2 + Math.random() * 0.4;
      const spd = (1.5 + Math.random() * 2.2) * intensity;
      m.position.set(x, ring.position.y + 0.1, z);
      this.scene.add(m);
      droplets.push({
        mesh: m,
        vx: Math.cos(a) * spd,
        vy: (2.8 + Math.random() * 2.4) * intensity,
        vz: Math.sin(a) * spd,
      });
    }

    this.splashes.push({
      ring,
      droplets,
      age: 0,
      maxAge: 0.85,
      intensity,
    });
  }

  // Returns walkable floe info if (x, z) is within a flat-topped ice floe
  getFloeAt(x, z, margin = 0) {
    for (const floe of this.iceFloes) {
      const d = Math.hypot(x - floe.x, z - floe.z);
      if (d <= floe.radius + margin) {
        return floe;
      }
    }
    return null;
  }

  update(dt, elapsed, cameraY) {
    this.waterUniforms.uTime.value = elapsed;
    const isCamUnder = cameraY < 0 ? 1.0 : 0.0;
    this.waterUniforms.uCameraUnderwater.value = isCamUnder;
    this.seabedUniforms.uTime.value = elapsed;
    this.skyMesh.material.uniforms.uTime.value = elapsed;
    this.skyMesh.material.uniforms.uCameraUnderwater.value = isCamUnder;

    // Gentle bobbing for floating ice floes & icebergs
    for (const floe of this.iceFloes) {
      const bob = Math.sin(elapsed * 1.1 + floe.phase) * 0.08;
      floe.group.position.y = bob;
      floe.currentDeckY = floe.deckY + bob;
    }
    for (const berg of this.obstacles) {
      berg.group.position.y = Math.sin(elapsed * 0.85 + berg.phase) * 0.07;
    }

    // Sway kelp fronds
    for (const k of this.kelpClusters) {
      k.mesh.rotation.z = Math.sin(elapsed * k.speed + k.phase) * 0.16;
      k.mesh.rotation.x = Math.cos(elapsed * k.speed * 0.8 + k.phase) * 0.1;
    }

    // Shimmer underwater sunbeams (visible primarily underwater)
    this.sunbeamGroup.visible = cameraY < 0.8;
    if (this.sunbeamGroup.visible) {
      for (const beam of this.sunbeamGroup.children) {
        const pulse = 0.7 + 0.3 * Math.sin(elapsed * 1.3 + beam.userData.phase);
        beam.material.opacity = beam.userData.baseOpacity * pulse;
      }
    }

    // Drift ambient plankton & snow
    const posAttr = this.ambientPoints.geometry.attributes.position;
    for (let i = 0; i < this.ambientSpeeds.length; i++) {
      let py = posAttr.getY(i) + this.ambientSpeeds[i] * dt;
      let px = posAttr.getX(i) + Math.sin(elapsed * 0.5 + i) * 0.25 * dt;
      if (this.ambientSpeeds[i] > 0) {
        // Underwater plankton/micro-bubbles rising
        if (py > -0.2) py = -17.5;
      } else {
        // Polar snow drifting down to the sea surface
        if (py < 0.1) py = 18.0;
      }
      posAttr.setX(i, px);
      posAttr.setY(i, py);
    }
    posAttr.needsUpdate = true;

    // Update surface splashes
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.age += dt;
      const t = s.age / s.maxAge;
      if (t >= 1) {
        this.scene.remove(s.ring);
        s.ring.geometry.dispose();
        s.ring.material.dispose();
        for (const d of s.droplets) {
          this.scene.remove(d.mesh);
        }
        if (s.droplets[0]) {
          s.droplets[0].mesh.geometry.dispose();
          s.droplets[0].mesh.material.dispose();
        }
        this.splashes.splice(i, 1);
        continue;
      }
      const scale = 1 + t * 4.5 * s.intensity;
      s.ring.scale.set(scale, 1, scale);
      s.ring.material.opacity = (1 - t) * 0.82;

      for (const d of s.droplets) {
        d.vy -= 12.5 * dt;
        d.mesh.position.x += d.vx * dt;
        d.mesh.position.y += d.vy * dt;
        d.mesh.position.z += d.vz * dt;
        d.mesh.material.opacity = 1 - t;
      }
    }
  }
}
