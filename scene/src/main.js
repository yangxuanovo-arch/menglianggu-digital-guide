import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import content from './content.json';
import cues from './cues.json';
import { buildWorld, STAIR_FOOT, ZHANG_POS, ZHANG_FACING } from './world.js';

const $ = (s) => document.querySelector(s);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const mobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;

const zhangCam = ZHANG_POS.clone().addScaledVector(ZHANG_FACING, 13).add(V(0, 2.5, 0));
const VIEWS = {
  intro: { from: V(0, STAIR_FOOT.y + 1.7, STAIR_FOOT.z + 6), pos: V(0, 2.2, 36), target: V(0, 15, 0), dur: 17, walk: true, drift: 'orbit', anchor: V(0, -7, 48) },
  bayonets: { pos: V(-17, 7, 24), target: V(0, 18, 0), dur: 3, drift: 'orbit', anchor: V(-3.9, 29, 2.4) },
  plaque: { pos: V(0, 13.5, 19), target: V(0, 13.8, 3.5), dur: 3, drift: 'sway', anchor: V(0, 13.9, 4.4) },
  battle: { pos: V(9, 3.4, -11), target: V(40, -6, -40), dur: 3.5, drift: 'pan', anchor: V(13, 2.6, -14.5) },
  zhang: { pos: zhangCam, target: ZHANG_POS.clone().add(V(0, 0.8, 0)), dur: 4, drift: 'sway', anchor: () => ZHANG_POS.clone().addScaledVector(ZHANG_FACING, 4.6).add(V(0, 3.4, 0)) },
  people: { pos: V(-9, 5.5, 17), target: V(-16, -24, 70), dur: 3.5, drift: 'pan', anchor: V(-14.5, 2.6, 12.5) },
  outro: { pos: V(0, 3.5, 30), target: V(0, 15, 0), dur: 3, drift: 'dolly', anchor: V(0, 3.2, 7.2) },
};
const stops = content.stops.map((s) => ({ ...s, view: VIEWS[s.id], cues: cues[s.id] }));
const totalSeconds = stops.reduce((a, s) => a + s.cues[s.cues.length - 1][1], 0);

let renderer, camera, controls, scene;
const tween = { active: false };
let manual = false, driftT = 0;
const state = { index: -1, auto: true, paused: false, muted: false, cc: true, started: false, usingAudio: true, clockStart: 0, clockOffset: 0, ended: false, timer: 0 };
const audio = new Audio();
audio.preload = 'auto';

function initGL() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
  } catch (e) {
    document.body.classList.add('nowebgl');
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.5 : 2));
  $('#stage').appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(mobile ? 62 : 55, 1, 0.5, 2600);
  camera.position.copy(VIEWS.intro.from);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(VIEWS.intro.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 4;
  controls.maxDistance = 160;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.enablePan = !mobile;
  controls.addEventListener('start', () => { manual = true; tween.active = false; });
  let loaded = 0;
  buildWorld(scene, mobile, Object.values(VIEWS).map((v) => (v.drift === 'pan' ? { pos: v.pos, target: v.target, radius: 16, cone: 1.3 } : { pos: v.pos, target: v.target, radius: 10, cone: 0.35, range: v.pos.distanceTo(v.target) + 3 })), () => { if (++loaded === 2) $('#start').classList.add('ready'); });
  setTimeout(() => $('#start').classList.add('ready'), 2500);
  resize();
  addEventListener('resize', resize);
  renderer.setAnimationLoop(frame);
  return true;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
function flyTo(view) {
  manual = false;
  driftT = 0;
  Object.assign(tween, {
    active: true, t0: performance.now(), dur: view.dur * 1000, walk: view.walk,
    fromPos: (view.from || camera.position).clone(), fromTarget: controls.target.clone(),
    toPos: portraitPos(view), toTarget: view.target.clone(), drift: view.drift,
  });
}

function portraitPos(view) {
  const p = view.pos.clone();
  if (camera.aspect < 0.8 && view.drift !== 'pan') p.sub(view.target).multiplyScalar(view.walk ? 1.25 : 1.6).add(view.target);
  return p;
}

const hotspotEls = [];
function buildHotspots() {
  const layer = $('#hotspots');
  stops.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'hotspot';
    b.innerHTML = `<span class="ring"></span><span class="num">${i + 1}</span><span class="lbl">${s.label}</span>`;
    b.setAttribute('aria-label', `热点 ${i + 1}：${s.label}`);
    b.addEventListener('click', () => { state.auto = true; goTo(i); });
    layer.appendChild(b);
    hotspotEls.push(b);
  });
}
const tmp = new THREE.Vector3();
function placeHotspots() {
  const w = innerWidth, h = innerHeight;
  stops.forEach((s, i) => {
    const a = s.view.anchor;
    tmp.copy(typeof a === 'function' ? a() : a).project(camera);
    const el = hotspotEls[i];
    const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
    el.style.display = visible ? '' : 'none';
    if (visible) el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
    el.classList.toggle('active', i === state.index);
  });
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (tween.active) {
    const t = Math.min(1, (now - tween.t0) / tween.dur), e = tween.walk ? t : ease(t);
    camera.position.lerpVectors(tween.fromPos, tween.toPos, tween.walk ? ease(t) * 0.25 + e * 0.75 : e);
    if (tween.walk) camera.position.y += Math.sin(t * 70) * 0.06 * (1 - t);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, ease(Math.min(1, t * 1.6)));
    if (t >= 1) tween.active = false;
  } else if (!manual && !state.paused && tween.drift) {
    driftT += dt;
    const k = 0.035 * dt;
    if (tween.drift === 'orbit') {
      tmp.copy(camera.position).sub(controls.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, k * 1.4);
      camera.position.copy(controls.target).add(tmp);
    } else if (tween.drift === 'pan') {
      tmp.copy(controls.target).sub(camera.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, k * 2.4);
      controls.target.copy(camera.position).add(tmp);
    } else if (tween.drift === 'sway') {
      tmp.copy(camera.position).sub(controls.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.sin(driftT * 0.35) * k * 0.9);
      camera.position.copy(controls.target).add(tmp);
    } else if (tween.drift === 'dolly' && camera.position.z < 50) {
      camera.position.z += dt * 0.7;
      camera.position.y += dt * 0.12;
    }
  }
  controls.update();
  renderer.render(scene, camera);
  placeHotspots();
  tick();
}

function stopTime() {
  if (state.usingAudio) return audio.currentTime || 0;
  return state.paused ? state.clockOffset : state.clockOffset + (performance.now() - state.clockStart) / 1000;
}
function useClock(offset = 0) {
  state.usingAudio = false;
  state.clockOffset = offset;
  state.clockStart = performance.now();
}

function tick() {
  if (state.index < 0) return;
  const s = stops[state.index], t = stopTime();
  const cue = s.cues.find((c) => t >= c[0] && t < c[1] + 0.25);
  const sub = $('#subtitle');
  const text = cue ? cue[2] : '';
  if (sub.dataset.text !== text) { sub.dataset.text = text; sub.textContent = text; }
  sub.classList.toggle('show', state.cc && !!text);
  const dur = s.cues[s.cues.length - 1][1];
  $('#bar').style.width = `${Math.min(100, ((state.index + Math.min(1, t / dur)) / stops.length) * 100)}%`;
  if (!state.usingAudio && !state.paused && t >= dur + 0.4) onStopEnd();
}

function onStopEnd() {
  if (state.ended) return;
  state.ended = true;
  if (state.index === stops.length - 1) {
    state.timer = setTimeout(() => $('#finish').classList.add('show'), 1500);
  } else if (state.auto) {
    state.timer = setTimeout(() => goTo(state.index + 1), 1600);
  }
}
audio.addEventListener('ended', () => { if (state.usingAudio) onStopEnd(); });
audio.addEventListener('error', () => { if (state.usingAudio && state.index >= 0) useClock(0); });

function goTo(i) {
  clearTimeout(state.timer);
  $('#finish').classList.remove('show');
  state.index = i;
  state.ended = false;
  state.paused = false;
  const s = stops[i];
  if (camera) flyTo(s.view);
  renderCard(s, i);
  state.usingAudio = true;
  audio.src = `audio/${s.id}.mp3`;
  audio.muted = state.muted;
  audio.currentTime = 0;
  const p = audio.play();
  if (p && p.catch) p.catch(() => { if (stops[state.index] === s) useClock(0); });
  if (stops[i + 1]) { const pre = new Audio(); pre.preload = 'auto'; pre.src = `audio/${stops[i + 1].id}.mp3`; }
  updateButtons();
}

function setPaused(p) {
  if (!state.usingAudio && p && !state.paused) state.clockOffset = stopTime();
  state.paused = p;
  if (state.usingAudio) { p ? audio.pause() : audio.play().catch(() => useClock(audio.currentTime)); }
  else if (!p) state.clockStart = performance.now();
  updateButtons();
}

function updateButtons() {
  $('#play').textContent = state.paused ? '▶ 继续' : '❚❚ 暂停';
  $('#mute').classList.toggle('off', state.muted);
  $('#mute').setAttribute('aria-label', state.muted ? '打开声音' : '静音');
  $('#cc').classList.toggle('off', !state.cc);
  $('#prev').disabled = state.index <= 0;
  $('#next').disabled = state.index >= stops.length - 1;
  document.querySelectorAll('#dots i').forEach((d, k) => d.classList.toggle('on', k <= state.index));
}

function srcLinks(ids) {
  return ids.map((id) => `<a href="${content.sources[id].url}" target="_blank" rel="noopener">[${id}] ${content.sources[id].title}</a>`).join('');
}
function renderCard(s, i) {
  const img = s.image && content.images[s.image];
  $('#card-num').textContent = `${i + 1}/${stops.length}`;
  $('#card-title').textContent = s.title;
  $('#card-body').innerHTML = `
    ${img ? `<figure><img src="${img.file}" alt="${img.caption}" loading="lazy" decoding="async"><figcaption>${img.caption} · 摄影：${img.author} · <a href="${img.page}" target="_blank" rel="noopener">${img.license}</a></figcaption></figure>` : ''}
    <ul>${s.facts.map((f) => `<li>${f}</li>`).join('')}</ul>
    <div class="cite">来源：${srcLinks(s.cite)}</div>`;
  $('#card').hidden = false;
}

function buildCredits() {
  const imgs = Object.values(content.images).map((m) => `<li>${m.caption}：${m.author}，<a href="${m.page}" target="_blank" rel="noopener">维基共享资源</a>，${m.license}。本页使用缩小版。</li>`).join('');
  $('#credits-body').innerHTML = `
    <h3>AI 使用声明</h3>
    <ul>
      <li>解说词：由 AI（Devin）依据下列史料来源整理撰写，经逐条对照来源核实。</li>
      <li>语音：AI 语音合成（Microsoft Edge 神经网络语音 zh-CN-YunyangNeural）。字幕与语音同步生成。</li>
      <li>三维场景：由 AI 辅助编写代码程序化生成的示意模型，依据下列实景照片概略复原，<b>不是测绘级模型</b>，尺寸、比例与方位均为示意。</li>
      <li><b>本页没有使用 AI 生成的图片。</b>所有照片均为实拍，碑名与石刻贴图裁切自下列实拍照片。</li>
    </ul>
    <h3>图片来源与许可</h3>
    <ul>${imgs}
      <li>碑名贴图裁切自 Sprt98 摄纪念碑照片；石刻贴图裁切自 Windmemories 摄“击毙张灵甫之地”照片；均按 CC BY-SA 4.0 共享。</li>
    </ul>
    <h3>史料来源</h3>
    <div class="cite">${srcLinks(Object.keys(content.sources))}</div>
    <h3>审慎说明</h3>
    <ul>
      <li>纪念碑高度、建成年份在公开资料中有出入，本页不标具体数字。</li>
      <li>伤亡数字为“毙伤俘”合计；烈士人数以 2019 年纪念馆资料为准。</li>
      <li>石刻相对纪念碑的方位依据 OpenStreetMap 坐标估算，未经实地测量。</li>
    </ul>
    <h3>开源软件</h3>
    <ul><li>three.js（MIT 许可）。页面无外部字体、无第三方 CDN，全部资源本地加载。</li></ul>`;
}

function start(auto) {
  state.started = true;
  state.auto = auto;
  $('#start').classList.add('hide');
  document.body.classList.add('touring');
  if (auto) goTo(0);
  else { state.index = -1; if (camera) flyTo({ ...VIEWS.intro, dur: 10 }); }
}

function bindUI() {
  const dots = $('#dots');
  stops.forEach(() => dots.appendChild(document.createElement('i')));
  $('#total').textContent = `约 ${Math.round(totalSeconds / 60 * 10) / 10} 分钟`;
  $('#go').addEventListener('click', () => start(true));
  $('#free').addEventListener('click', () => start(false));
  $('#prev').addEventListener('click', () => state.index > 0 && goTo(state.index - 1));
  $('#next').addEventListener('click', () => goTo(Math.min(stops.length - 1, state.index + 1)));
  $('#play').addEventListener('click', () => { if (state.index < 0) goTo(0); else setPaused(!state.paused); });
  $('#mute').addEventListener('click', () => { state.muted = !state.muted; audio.muted = state.muted; updateButtons(); });
  $('#cc').addEventListener('click', () => { state.cc = !state.cc; updateButtons(); });
  $('#card-toggle').addEventListener('click', () => $('#card').classList.toggle('open'));
  $('#info').addEventListener('click', () => $('#credits').classList.add('show'));
  $('#credits-close').addEventListener('click', () => $('#credits').classList.remove('show'));
  $('#credits').addEventListener('click', (e) => { if (e.target.id === 'credits') $('#credits').classList.remove('show'); });
  $('#replay').addEventListener('click', () => { state.auto = true; goTo(0); });
  $('#finish-credits').addEventListener('click', () => $('#credits').classList.add('show'));
  if (!mobile) $('#card').classList.add('open');
  if (new URLSearchParams(location.search).has('embed') && parent !== window) {
    $('#back').hidden = false;
    const closeEmbed = () => { audio.pause(); parent.postMessage({ type: 'guide:close-module', id: 'panorama' }, '*'); };
    $('#back').addEventListener('click', closeEmbed);
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#credits').classList.contains('show')) closeEmbed(); });
  }
  updateButtons();
}

buildHotspots();
buildCredits();
bindUI();
if (!initGL()) $('#start').classList.add('ready');
