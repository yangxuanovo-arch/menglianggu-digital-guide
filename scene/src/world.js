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
  h += (Math.pow(fbm(x / 150 + 7, z / 150 + 3, 5), 1.6) * 260 - 30) * smooth(140, 420, r);
  if (z > STAIR_TOP_Z - 2 && Math.abs(x) < 7) {
    const limit = Math.max(stairTop(z), STAIR_FOOT.y) - 0.4;
    h = Math.min(h, limit + smooth(4, 7, Math.abs(x)) * 4);
  }
  return h;
}

function canvasTexture(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function speckle(g, s, base, n, spread) {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    const v = Math.floor(Math.random() * spread);
    g.fillStyle = `rgba(${v},${v},${v},0.07)`;
    g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
  }
}

function makeSky() {
  const geo = new THREE.SphereGeometry(1200, 32, 16);
  const colors = [];
  const stops = [[-0.2, '#d8b98a'], [0, '#efd2a0'], [0.08, '#f3dfbd'], [0.3, '#c4ced6'], [1, '#5f7899']];
  const ca = new THREE.Color(), cb = new THREE.Color();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / 1200;
    let j = 0;
    while (j < stops.length - 2 && y > stops[j + 1][0]) j++;
    const [y0, c0] = stops[j], [y1, c1] = stops[j + 1];
    ca.set(c0).lerp(cb.set(c1), Math.min(1, Math.max(0, (y - y0) / (y1 - y0))));
    colors.push(ca.r, ca.g, ca.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
}

function makeTerrain(mobile) {
  const seg = mobile ? 120 : 170;
  const geo = new THREE.PlaneGeometry(1800, 1800, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const colors = [];
  const grass = new THREE.Color('#4d6a33'), dark = new THREE.Color('#2f4a26'), rock = new THREE.Color('#8b8173'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = terrainHeight(x, z);
    p.setY(i, h);
    const n = fbm(x / 9, z / 9, 2);
    c.copy(grass).lerp(dark, n);
    const steep = Math.abs(terrainHeight(x + 2, z) - h) + Math.abs(terrainHeight(x, z + 2) - h);
    c.lerp(rock, Math.min(0.85, Math.max(0, steep - 0.9) * 0.5 + (h > 60 ? 0.3 : 0)));
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

function fence(points, material, postH = 1.0) {
  const g = new THREE.Group();
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.26, postH, 0.26), material, points.length);
  const rails = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.12, 1), material, (points.length - 1) * 2);
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

function makeMonument(tex) {
  const g = new THREE.Group();
  const granite = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#ecebe6', 2500, 120);
    ctx.strokeStyle = 'rgba(120,120,120,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(0, i * s / 2); ctx.lineTo(s, i * s / 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
  }, 0.55);
  const white = new THREE.MeshLambertMaterial({ map: granite });
  const greyStone = new THREE.MeshLambertMaterial({ color: '#a4a19b' });

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
  const bladeGeo = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1, curveSegments: 12 });
  bladeGeo.translate(0, 0, -T / 2);
  const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4, 5);
  const rodMat = new THREE.MeshLambertMaterial({ color: '#555' });
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
  const core = new THREE.Mesh(new THREE.CylinderGeometry(R0 * 0.9, R0 * 0.9, 9, 3), white);
  core.position.y = 0.9 + 4.5;
  g.add(core);

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 7.2, 10), white);
  pillar.position.set(0, 0.9 + 3.6, 3.7);
  g.add(pillar);
  const plaqueSide = new THREE.MeshLambertMaterial({ color: '#4e2522' });
  const plaqueFront = new THREE.MeshLambertMaterial({ color: '#5a2a26' });
  if (tex.plaque) plaqueFront.map = tex.plaque;
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(9.2, 11.8, 0.6), [plaqueSide, plaqueSide, plaqueSide, plaqueSide, plaqueFront, plaqueSide]);
  plaque.position.set(0, 13.9, 3.9);
  g.add(plaque);

  const relief = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#e6e3dc', 1200, 120);
    ctx.strokeStyle = 'rgba(110,100,90,0.55)'; ctx.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath(); ctx.arc(20 + i * 45, s / 2, 18, 0, Math.PI * 1.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * 45, s / 2 + 40); ctx.bezierCurveTo(i * 45 + 15, s / 2 + 10, i * 45 + 30, s / 2 + 70, i * 45 + 45, s / 2 + 40); ctx.stroke();
    }
    ctx.strokeRect(6, 30, s - 12, s - 60);
  });
  relief.repeat.set(1, 1);
  const planter = new THREE.Mesh(new THREE.BoxGeometry(8.8, 1.7, 2.8), new THREE.MeshLambertMaterial({ map: relief }));
  planter.position.set(0, 0.9 + 0.85, 5.4);
  g.add(planter);
  const shrub = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5, 1), new THREE.MeshLambertMaterial({ color: '#3f6b2c', flatShading: true }));
  shrub.scale.set(1.6, 0.75, 0.9);
  shrub.position.set(0, 3.0, 5.4);
  g.add(shrub);
  return g;
}

function makePlaza() {
  const g = new THREE.Group();
  const tiles = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, '#b9b3a8', 3000, 140);
    ctx.strokeStyle = 'rgba(80,70,60,0.35)'; ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, i * s / 4); ctx.lineTo(s, i * s / 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i * s / 4, 0); ctx.lineTo(i * s / 4, s); ctx.stroke();
    }
  });
  tiles.repeat.set(10, 10);
  const side = new THREE.MeshLambertMaterial({ color: '#8f8778' });
  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(PLAZA_R, PLAZA_R + 1.5, 4, 48), [side, new THREE.MeshLambertMaterial({ map: tiles }), side]);
  plaza.position.y = -2;
  g.add(plaza);

  const stepMat = new THREE.MeshLambertMaterial({ color: '#9d978c' });
  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 2, STAIR_RUN + 0.02), stepMat, STAIR_STEPS);
  const d = new THREE.Object3D();
  for (let i = 0; i < STAIR_STEPS; i++) {
    d.position.set(0, -STAIR_RISE * (i + 1) - 1, STAIR_TOP_Z + STAIR_RUN * (i + 0.5));
    d.updateMatrix();
    steps.setMatrixAt(i, d.matrix);
  }
  g.add(steps);
  const landing = new THREE.Mesh(new THREE.BoxGeometry(12, 2, 8), stepMat);
  landing.position.set(0, STAIR_FOOT.y - 1, STAIR_FOOT.z + 4);
  g.add(landing);

  const marble = new THREE.MeshLambertMaterial({ color: '#f1efe9' });
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
  return g;
}

function blocks({ pos, target, radius = 14, cone = 0.6, range = 90 }, x, z) {
  const dx = x - pos.x, dz = z - pos.z, dist = Math.hypot(dx, dz);
  if (dist < radius) return true;
  if (!target) return false;
  const tx = target.x - pos.x, tz = target.z - pos.z;
  return dist < range && (dx * tx + dz * tz) / (dist * Math.hypot(tx, tz)) > Math.cos(cone);
}

function makeTrees(mobile, clear) {
  const count = mobile ? 170 : 300;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 3, 5), new THREE.MeshLambertMaterial({ color: '#5a3d2b' }), count);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 5.5, 7), new THREE.MeshLambertMaterial({ color: '#2f5129', flatShading: true }), count);
  const d = new THREE.Object3D();
  const keepOut = ZHANG_POS.clone().addScaledVector(ZHANG_FACING, 7);
  let i = 0, guard = 0;
  while (i < count && guard++ < 6000) {
    const r = 29 + Math.pow(Math.random(), 1.3) * 150, a = Math.random() * Math.PI * 2;
    const x = r * Math.cos(a), z = r * Math.sin(a);
    if (Math.abs(x) < 7.5 && z > 15 && z < STAIR_FOOT.z + 14) continue;
    if (Math.hypot(x - ZHANG_POS.x, z - ZHANG_POS.z) < 8 || Math.hypot(x - keepOut.x, z - keepOut.z) < 9) continue;
    if (clear.some((c) => blocks(c, x, z))) continue;
    const y = terrainHeight(x, z), s = 0.7 + Math.random() * 0.8;
    d.position.set(x, y + 1.5 * s, z); d.scale.set(s, s, s); d.rotation.set(0, Math.random() * 6, 0); d.updateMatrix();
    trunk.setMatrixAt(i, d.matrix);
    d.position.y = y + (3 + 2.4) * s; d.updateMatrix();
    crown.setMatrixAt(i, d.matrix);
    i++;
  }
  trunk.count = crown.count = i;
  return [trunk, crown];
}

function makeZhangRock(tex) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(5, 2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  const local = ZHANG_FACING.clone();
  const K = 4.3;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 0.85 + hash(Math.round(v.x * 10), Math.round(v.y * 10 + v.z * 7)) * 0.3;
    v.multiplyScalar(n).multiply(new THREE.Vector3(1.5, 0.85, 1.25));
    const dpt = v.dot(local);
    if (dpt > K) v.addScaledVector(local, K - dpt);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const rock = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#a39684', flatShading: true }));
  g.add(rock);
  const insc = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.85), new THREE.MeshLambertMaterial({ color: '#ffffff', map: tex.zhang || null }));
  insc.position.copy(local).multiplyScalar(K + 0.05).add(new THREE.Vector3(0, 0.6, 0));
  insc.lookAt(insc.position.clone().add(local));
  g.add(insc);
  g.position.copy(ZHANG_POS);
  return g;
}

export function buildWorld(scene, mobile, clear, onProgress) {
  scene.background = new THREE.Color('#efd2a0');
  scene.fog = new THREE.Fog('#ead3a8', 90, 760);
  scene.add(makeSky());
  scene.add(new THREE.HemisphereLight('#fff3db', '#5a4632', 1.6));
  const sun = new THREE.DirectionalLight('#ffdca8', 2.4);
  sun.position.set(-70, 90, 60);
  scene.add(sun);
  scene.add(makeTerrain(mobile));
  scene.add(makePlaza());
  scene.add(...makeTrees(mobile, clear));

  const tex = {};
  const monument = makeMonument(tex);
  const rock = makeZhangRock(tex);
  scene.add(monument, rock);
  const loader = new THREE.TextureLoader();
  const load = (url, apply) => loader.load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; apply(t); onProgress && onProgress(); });
  load('img/tex-plaque.jpg', (t) => { const m = monument.children.find((c) => Array.isArray(c.material)).material[4]; m.map = t; m.color.set('#ffffff'); m.needsUpdate = true; });
  load('img/tex-zhang-inscription.jpg', (t) => { const m = rock.children[1].material; m.map = t; m.needsUpdate = true; });
}

ZHANG_POS.y = terrainHeight(ZHANG_POS.x, ZHANG_POS.z) + 2.6;
