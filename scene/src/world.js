import * as THREE from 'three';

const PLAZA_R = 20;
const STAIR_TOP_Z = 20;
const STAIR_RISE = 0.24;
const STAIR_RUN = 0.75;
const STAIR_STEPS = 51;
const stairTop = (z) => -(z - STAIR_TOP_Z) * (STAIR_RISE / STAIR_RUN);
export const STAIR_FOOT = { z: STAIR_TOP_Z + STAIR_RUN * STAIR_STEPS, y: -STAIR_RISE * STAIR_STEPS };
export const ZHANG_POS = new THREE.Vector3(23, 0, 55);
export const ZHANG_FACING = new THREE.Vector3(-1, 0, 0.55).normalize();

function hash(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * noise(x * f, y * f); f *= 2.03; amp *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r < PLAZA_R) return -0.4;
  let h = -(r - PLAZA_R) * 0.34;
  h += (fbm(x / 22, z / 22, 3) - 0.5) * 6 * smooth(PLAZA_R + 2, 45, r);
  h += (Math.pow(fbm(x / 170 + 7, z / 170 + 3, 5), 1.5) * 190 - 30) * smooth(140, 420, r);
  h += (fbm(x / 38 + 2, z / 38 - 5, 4) - 0.5) * 26 * smooth(160, 420, r);
  if (z > STAIR_TOP_Z - 2 && z < STAIR_FOOT.z + 22) {
    const limit = Math.max(stairTop(z), STAIR_FOOT.y) - 0.35;
    const half = z < STAIR_FOOT.z ? 3.3 : 6.1;
    const s = Math.max(smooth(half, half + 7, Math.abs(x)), smooth(STAIR_FOOT.z + 10, STAIR_FOOT.z + 22, z));
    h = limit + (h - limit) * s;
  }
  return h;
}

export function forestDensity(x, z) {
  return smooth(0.38, 0.62, fbm(x / 34 + 11, z / 34 - 4, 3));
}

let loader, imageLoader;
const sources = {};
function tex(name, repeat = 1, color = true) {
  const url = `img/${name}`;
  let entry = sources[url];
  if (!entry) {
    entry = sources[url] = { source: new THREE.Source(null), users: [] };
    imageLoader.load(url, (img) => { entry.source.data = img; entry.users.forEach((u) => { u.needsUpdate = true; }); });
  }
  const t = new THREE.Texture();
  t.source = entry.source;
  if (entry.source.data) t.needsUpdate = true; else entry.users.push(t);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (Array.isArray(repeat)) t.repeat.set(...repeat); else t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}
function pbr(name, repeat, opts = {}) {
  return new THREE.MeshStandardMaterial({
    map: tex(`tex-${name}.jpg`, repeat),
    normalMap: tex(`tex-${name}-n.jpg`, repeat, false),
    roughness: 0.9, metalness: 0, ...opts,
  });
}
const shadowed = (o, cast = true, receive = true) => { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; };

function makeTerrain(mobile) {
  const seg = mobile ? 140 : 200;
  const geo = new THREE.PlaneGeometry(1800, 1800, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const colors = [];
  const light = new THREE.Color('#f2ead8'), dark = new THREE.Color('#8e9466'), rock = new THREE.Color('#c9c1b4'), forest = new THREE.Color('#4f5c3c'), floor = new THREE.Color('#59603f'), green = new THREE.Color('#d6e2b0'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
    p.setY(i, h);
    c.copy(light).lerp(dark, 0.35 + 0.3 * fbm(x / 30, z / 30, 3));
    const steep = Math.abs(terrainHeight(x + 2, z) - h) + Math.abs(terrainHeight(x, z + 2) - h);
    const rr = Math.hypot(x, z);
    c.lerp(floor, forestDensity(x, z) * smooth(PLAZA_R + 2, PLAZA_R + 10, rr) * 0.85);
    c.lerp(forest, smooth(90, 260, rr) * (0.55 + 0.45 * fbm(x / 40 + 3, z / 40, 3)));
    c.lerp(rock, Math.min(0.6, Math.max(0, steep - 1.2) * 0.3));
    if (rr > PLAZA_R) c.multiply(green);
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = pbr('ground', 150, { vertexColors: true, roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.161;
      vec3 macro = texture2D(map, uv2).rgb;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * macro * 2.2, 0.45);`);
  };
  return shadowed(new THREE.Mesh(geo, mat), false, true);
}

function fence(points, material, postH = 1.0) {
  const g = new THREE.Group();
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, postH, 0.2), material, points.length);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.09, 1), material, (points.length - 1) * 2);
  const d = new THREE.Object3D();
  points.forEach((pt, i) => {
    d.position.set(pt.x, pt.y + postH / 2, pt.z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1); d.updateMatrix();
    posts.setMatrixAt(i, d.matrix);
  });
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    [postH * 0.92, postH * 0.3].forEach((hh, k) => {
      d.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + hh, (a.z + b.z) / 2);
      d.scale.set(1, 1, a.distanceTo(b));
      d.lookAt(b.x, b.y + hh, b.z);
      d.updateMatrix();
      rails.setMatrixAt(i * 2 + k, d.matrix);
    });
  }
  g.add(posts, rails);
  return g;
}

function makeMonument() {
  const g = new THREE.Group();
  const white = pbr('monument', 0.22, { color: '#ffffff', roughness: 0.78 });
  const whiteBox = pbr('monument', 1, { color: '#ffffff', roughness: 0.78 });
  const greyStone = pbr('paving', 2, { color: '#cfc8bc', roughness: 0.85 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(16, 0.9, 14), greyStone);
  base.position.set(0, 0.45, -0.5);
  g.add(base);
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(14 - i * 0.4, 0.3, 0.55), greyStone);
    step.position.set(0, 0.15 + i * 0.3, 6.8 + (2 - i) * 0.55);
    g.add(step);
  }

  const H = 30, W = 4.4, T = 1.25, R0 = 1.8;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(W, 0); shape.lineTo(W, H);
  shape.quadraticCurveTo(W * 0.12, H - 0.15 * W, 0, H - 1.25 * W);
  shape.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 16 });
  bladeGeo.translate(0, 0, -T / 2);
  const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 6);
  const rodMat = new THREE.MeshStandardMaterial({ color: '#4a4744', metalness: 0.7, roughness: 0.45 });
  for (const deg of [150, 30, 270]) {
    const th = THREE.MathUtils.degToRad(deg);
    const blade = new THREE.Mesh(bladeGeo, white);
    blade.position.set(R0 * Math.cos(th), 0.9, R0 * Math.sin(th));
    blade.rotation.y = -th;
    g.add(blade);
    const rod = new THREE.Mesh(rodGeo, rodMat);
    rod.position.set((R0 + W - 0.1) * Math.cos(th), 0.9 + H + 0.7, (R0 + W - 0.1) * Math.sin(th));
    g.add(rod);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.9, R0 * 0.9, 9, 3), whiteBox);
  core.position.y = 0.9 + 4.5;
  g.add(core);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 7.2, 16), whiteBox);
  pillar.position.set(0, 0.9 + 3.6, 3.7);
  g.add(pillar);
  const plaqueSide = new THREE.MeshStandardMaterial({ color: '#4a2320', roughness: 0.55 });
  const plaqueFront = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, map: tex('tex-plaque.jpg', 1) });
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(9.2, 11.8, 0.6), [plaqueSide, plaqueSide, plaqueSide, plaqueSide, plaqueFront, plaqueSide]);
  plaque.position.set(0, 13.9, 3.9);
  g.add(plaque);

  const planter = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.7, 2.8), greyStone);
  planter.position.set(0, 0.9 + 0.85, 5.4);
  g.add(planter);
  const hedge = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.9, 2.2, 8, 2, 4), new THREE.MeshStandardMaterial({ map: tex('tex-hedge.jpg', [3, 1]), color: '#7d8f5a', roughness: 1 }));
  const hp = hedge.geometry.attributes.position;
  for (let i = 0; i < hp.count; i++) hp.setY(i, hp.getY(i) + (hash(i, 7) - 0.5) * 0.12);
  hedge.geometry.computeVertexNormals();
  hedge.position.set(0, 0.9 + 1.7 + 0.4, 5.4);
  g.add(hedge);
  return shadowed(g);
}

function makePlaza() {
  const g = new THREE.Group();
  const side = pbr('rock', [12, 1], { color: '#bdb5a6' });
  const top = pbr('paving', 9, { color: '#d8d2c6', roughness: 0.8 });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 1.5, 4, 64), [side, top, side]);
  plaza.position.y = -2;
  g.add(plaza);

  const stepMat = pbr('paving', [1.5, 0.5], { color: '#cbc4b8', roughness: 0.85 });
  const riser = pbr('rock', [3, 0.2], { color: '#8f877b', roughness: 0.95 });
  const stepGeo = new THREE.BoxGeometry(6, 2, STAIR_RUN + 0.02);
  const steps = new THREE.InstancedMesh(stepGeo, [riser, riser, stepMat, riser, riser, riser], STAIR_STEPS);
  const d = new THREE.Object3D();
  for (let i = 0; i < STAIR_STEPS; i++) {
    d.position.set(0, -STAIR_RISE * (i + 1) - 1, STAIR_TOP_Z + STAIR_RUN * (i + 0.5));
    d.updateMatrix();
    steps.setMatrixAt(i, d.matrix);
  }
  g.add(steps);
  const nosing = new THREE.InstancedMesh(new THREE.BoxGeometry(6.02, 0.05, 0.1), new THREE.MeshStandardMaterial({ color: '#eee8dc', roughness: 0.7 }), STAIR_STEPS);
  for (let i = 0; i < STAIR_STEPS; i++) {
    d.position.set(0, -STAIR_RISE * (i + 1) + 0.005, STAIR_TOP_Z + STAIR_RUN * (i + 1) - 0.05);
    d.updateMatrix();
    nosing.setMatrixAt(i, d.matrix);
  }
  g.add(nosing);
  const landing = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 8), pbr('paving', [3, 2], { color: '#cbc4b8', roughness: 0.85 }));
  landing.position.set(0, STAIR_FOOT.y - 3, STAIR_FOOT.z + 4);
  g.add(landing);

  const marble = pbr('monument', 0.5, { color: '#efebe2', roughness: 0.7 });
  for (const sx of [-3.25, 3.25]) {
    const pts = [];
    for (let i = 0; i <= STAIR_STEPS; i += 3) {
      const z = STAIR_TOP_Z + STAIR_RUN * i;
      pts.push(new THREE.Vector3(sx, stairTop(z), z));
    }
    g.add(fence(pts, marble, 1.1));
  }
  const ring = [];
  const gap = Math.asin(3.6 / PLAZA_R);
  for (let a = Math.PI / 2 + gap; a <= Math.PI * 2.5 - gap + 1e-6; a += (Math.PI * 2 - 2 * gap) / 40) {
    ring.push(new THREE.Vector3((PLAZA_R - 0.4) * Math.cos(a), 0, (PLAZA_R - 0.4) * Math.sin(a)));
  }
  g.add(fence(ring, marble, 1.0));
  return shadowed(g);
}

function blocks({ pos, target, radius = 14, cone = 0.6, range = 90, sightline = false }, x, z, top = Infinity) {
  const dx = x - pos.x, dz = z - pos.z, dist = Math.hypot(dx, dz);
  if (dist < radius) return true;
  if (!target) return false;
  const tx = target.x - pos.x, tz = target.z - pos.z, tLen = Math.hypot(tx, tz);
  if (dist >= range || (dx * tx + dz * tz) / (dist * tLen) <= Math.cos(cone)) return false;
  if (!sightline) return true;
  const lookDown = (target.y - pos.y) / tLen;
  return top > pos.y + lookDown * dist + dist * 0.1;
}

function billboards({ atlas, cols, rows, aspect, count, tint }, place) {
  const geo = new THREE.PlaneGeometry(aspect, 1);
  geo.translate(0, 0.5, 0);
  const vars = new Float32Array(count * 4);
  geo.setAttribute('aVar', new THREE.InstancedBufferAttribute(vars, 4));
  const mat = new THREE.MeshBasicMaterial({ map: tex(atlas, 1), color: tint, alphaTest: 0.45, side: THREE.DoubleSide });
  mat.map.wrapS = mat.map.wrapT = THREE.ClampToEdgeWrapping;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aVar;\nvarying float vShade;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vec2((vMapUv.x + mod(aVar.x, ${cols}.0)) / ${cols}.0, (vMapUv.y + ${rows - 1}.0 - floor(aVar.x / ${cols}.0)) / ${rows}.0);
        vShade = aVar.z * mix(0.62, 1.0, uv.y);`)
      .replace('#include <project_vertex>', `
        vec3 base = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float sc = length(instanceMatrix[1].xyz);
        vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec4 mvPosition = viewMatrix * vec4(base + right * position.x * sc * aVar.y * aVar.w + vec3(0.0, position.y * sc, 0.0), 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShade;')
      .replace('#include <alphatest_fragment>', '#include <alphatest_fragment>\ndiffuseColor.rgb *= vShade;');
  };
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.frustumCulled = false;
  const placed = [];
  for (let guard = 0; placed.length < count && guard < count * 40; guard++) {
    const p = place();
    if (p) placed.push(p);
  }
  placed.sort((p, q) => Math.hypot(p[0], p[2]) - Math.hypot(q[0], q[2]));
  const d = new THREE.Object3D();
  placed.forEach(([x, y, z, h, cell, shade, width], k) => {
    d.position.set(x, y, z); d.scale.setScalar(h); d.updateMatrix();
    mesh.setMatrixAt(k, d.matrix);
    vars.set([cell, Math.random() < 0.5 ? -1 : 1, shade, width], k * 4);
  });
  mesh.count = placed.length;
  return mesh;
}

const onStairs = (x, z, pad) => Math.abs(x) < 3.3 + pad && z > STAIR_TOP_Z - 1 && z < STAIR_FOOT.z + 9;
const nearZhang = (x, z, keepOut) => Math.hypot(x - ZHANG_POS.x, z - ZHANG_POS.z) < 8 || Math.hypot(x - keepOut.x, z - keepOut.z) < 9;

function makeVegetation(mobile, clear) {
  const keepOut = ZHANG_POS.clone().addScaledVector(ZHANG_FACING, 7);
  const ring = (r0, span, pow) => { const r = r0 + Math.pow(Math.random(), pow) * span, a = Math.random() * Math.PI * 2; return [r * Math.cos(a), r * Math.sin(a), r]; };
  const g = new THREE.Group();
  g.add(billboards({ atlas: 'pines.webp', cols: 4, rows: 1, aspect: 0.5, count: mobile ? 1100 : 2400, tint: '#efe2c4' }, () => {
    const [x, z, r] = ring(24, 400, 1.5);
    if (Math.random() > 0.4 + 0.6 * forestDensity(x, z)) return null;
    const y = terrainHeight(x, z) - 0.4, h = 8 + Math.random() * 10;
    if (onStairs(x, z, 2.2) || nearZhang(x, z, keepOut) || clear.some((c) => blocks(c, x, z, y + h))) return null;
    return [x, y, z, h, Math.floor(Math.random() * 4), 0.78 + Math.random() * 0.3, 0.8 + Math.random() * 0.45];
  }));
  g.add(billboards({ atlas: 'undergrowth.webp', cols: 4, rows: 2, aspect: 1, count: mobile ? 500 : 1500, tint: '#e8dcbc' }, () => {
    const [x, z, r] = ring(PLAZA_R + 2, 150, 1.6);
    if (Math.random() > 0.3 + 0.7 * forestDensity(x, z)) return null;
    const y = terrainHeight(x, z) - 0.2, h = 2.2 + Math.random() * 3.2;
    if (onStairs(x, z, 1.4) || nearZhang(x, z, keepOut) || clear.some((c) => Math.hypot(x - c.pos.x, z - c.pos.z) < 7 || (c.sightline && blocks(c, x, z, y + h)))) return null;
    return [x, y, z, h, Math.floor(Math.random() * 4), 0.8 + Math.random() * 0.3, 0.8 + Math.random() * 0.4];
  }));
  g.add(billboards({ atlas: 'undergrowth.webp', cols: 4, rows: 2, aspect: 1, count: mobile ? 1600 : 6000, tint: '#c4c08e' }, () => {
    const [x, z] = ring(PLAZA_R + 1.2, 85, 1.2);
    if (onStairs(x, z, 0.35) || nearZhang(x, z, keepOut) || clear.some((c) => Math.hypot(x - c.pos.x, z - c.pos.z) < 3)) return null;
    return [x, terrainHeight(x, z) - 0.1, z, 0.5 + Math.random() * 0.6, Math.random() < 0.5 ? 5 : 7, 0.75 + Math.random() * 0.35, 1 + Math.random() * 0.6];
  }));
  return g;
}

function makeZhangRock() {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(5, 5);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const local = ZHANG_FACING.clone();
  const K = 4.3;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.78 + fbm(v.x * 0.35 + v.z * 0.21 + 9, v.y * 0.42 - v.z * 0.17, 4) * 0.45;
    v.multiplyScalar(n).multiply(new THREE.Vector3(1.5, 0.85, 1.25));
    const dpt = v.dot(local);
    if (dpt > K) v.addScaledVector(local, K - dpt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, pbr('rock', 2, { color: '#e2dacb' }));
  g.add(rock);
  const insc = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.85), new THREE.MeshStandardMaterial({ map: tex('tex-zhang-inscription.jpg', 1), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
  insc.position.copy(local).multiplyScalar(K + 0.05).add(new THREE.Vector3(0, 0.6, 0));
  insc.lookAt(insc.position.clone().add(local));
  g.add(insc);
  g.position.copy(ZHANG_POS);
  return shadowed(g);
}

export function buildWorld(scene, mobile, clear, onReady) {
  const manager = new THREE.LoadingManager(onReady);
  loader = new THREE.TextureLoader(manager);
  imageLoader = new THREE.ImageLoader(manager);
  const sky = loader.load('img/sky.jpg');
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  scene.environment = sky;
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog('#e0cfae', 70, 950);
  scene.add(new THREE.HemisphereLight('#ffe7c2', '#4b3d2c', 0.55));
  const sun = new THREE.DirectionalLight('#ffd4a0', 3.0);
  sun.position.set(-0.55, 0.45, 0.72).multiplyScalar(140);
  sun.target.position.set(0, 4, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(mobile ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 40, far: 320 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  scene.add(makeTerrain(mobile));
  scene.add(makePlaza());
  scene.add(makeVegetation(mobile, clear));
  scene.add(makeMonument(), makeZhangRock());
}

ZHANG_POS.y = terrainHeight(ZHANG_POS.x, ZHANG_POS.z) + 2.6;
