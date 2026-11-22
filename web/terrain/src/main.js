import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { phases, units, sources, sourceById } from './battle.js';

const $ = id => document.getElementById(id);
const mobile = matchMedia('(max-width:700px)').matches;
const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches;
let scene, camera, renderer, controls, heights, metadata, terrain, skirts, raf;
let viewTime = 0, selectedPhase = -1, playing = false, flying = false, overhead = false, terrainOnly = false;
let exaggeration = 3.6, previousFrame = 0, lastRender = 0, flightTime = 0, lastCameraSave;
let cameraTween = null, ready = false, suspended = false;
const labels = [], movingUnits = [], routes = [];
const disposable = [];
const clock = new THREE.Clock();
const widthKm = (118.30-118.07)*111.32*Math.cos(35.605*Math.PI/180);
const depthKm = (35.72-35.49)*111.32;
const tempVector = new THREE.Vector3();
const origin = {lon:118.185,lat:35.605};
const sourceDialog = $('sources-dialog');
const leaderSvg=document.createElementNS('http://www.w3.org/2000/svg','svg');
leaderSvg.setAttribute('aria-hidden','true');
leaderSvg.style.cssText='position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none';
$('labels').prepend(leaderSvg);

$('phase-buttons').innerHTML = phases.map((p,i)=>`<button data-phase="${i}" aria-label="${p.time} ${p.title}"><i></i><b>${p.date}</b><span>${p.title}</span></button>`).join('');
$('phase-buttons').addEventListener('click', e=>{
  const button=e.target.closest('[data-phase]');
  if(button){setPlaying(false);setTime(Number(button.dataset.phase));}
});
$('scrub').addEventListener('input',e=>{setPlaying(false);setTime(Number(e.target.value));});
$('play').addEventListener('click',()=>{if(viewTime>=4)setTime(0);setPlaying(!playing);});
$('sources-close').addEventListener('click',()=>sourceDialog.close());
$('phase-source').addEventListener('click',()=>openSources(phases[selectedPhase].sourceIds[0]));
$('unit-close').addEventListener('click',()=>{$('unit-card').hidden=true;});
sourceDialog.addEventListener('click',e=>{if(e.target===sourceDialog){const r=sourceDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)sourceDialog.close();}});
$('retry').addEventListener('click',()=>location.reload());
$('back').addEventListener('click',e=>{
  if(window.parent!==window){e.preventDefault();window.parent.postMessage({type:'guide:terrain-close'},location.origin);}
});
$('reset').addEventListener('click',()=>{if(!ready)return;stopFlight();overhead=false;$('view').setAttribute('aria-pressed','false');tweenCamera(defaultCamera());controls.target.set(0,.5,0);});
$('fly').addEventListener('click',()=>{
  if(!ready)return;
  if(flying){stopFlight();return;}
  flying=true;flightTime=0;overhead=false;cameraTween=null;
  lastCameraSave=camera.position.clone();
  $('fly').setAttribute('aria-pressed','true');$('fly').setAttribute('aria-label','停止电影运镜');
  $('hint').style.opacity='0';
});
$('view').addEventListener('click',()=>{if(!ready)return;stopFlight();overhead=!overhead;$('view').setAttribute('aria-pressed',String(overhead));tweenCamera(overhead ? new THREE.Vector3(0,mobile?78:39,.05) : defaultCamera());});
$('layers').addEventListener('click',()=>{terrainOnly=!terrainOnly;$('layers').setAttribute('aria-pressed',String(terrainOnly));$('layers').setAttribute('aria-label',terrainOnly?'显示战役图层':'切换纯地形模式');updateVisibility();});
$('exaggeration').addEventListener('change',e=>{exaggeration=Number(e.target.value);if(ready){rebuildSurface();updateUnits();}});
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape'||sourceDialog.open)return;
  const hadUnitCard=!$('unit-card').hidden;
  stopFlight();$('unit-card').hidden=true;
  // Keyboard events inside an iframe do not reach the shell's native dialog.
  // An inner source dialog or unit card consumes Escape before the wrapper.
  if(window.parent!==window&&!hadUnitCard){e.preventDefault();window.parent.postMessage({type:'guide:terrain-close'},location.origin);}
});

function setPlaying(value){playing=value;$('play-icon').textContent=value?'Ⅱ':'▶';$('play-copy').textContent=value?'暂停推演':'播放推演';$('play').setAttribute('aria-label',value?'暂停战役推演':'播放战役推演');}
function stopFlight(){flying=false;$('fly').setAttribute('aria-pressed','false');$('fly').setAttribute('aria-label','开始电影运镜');$('hint').style.opacity='1';}
function setTime(value){
  viewTime=THREE.MathUtils.clamp(value,0,4);
  const i=Math.min(4,Math.floor(viewTime+0.00001));
  $('scrub').value=viewTime;
  $('timeline-progress').style.width=`${viewTime/4*100}%`;
  if(i!==selectedPhase){
    selectedPhase=i;const p=phases[i];
    $('phase-eyebrow').textContent=p.eyebrow;$('phase-title').textContent=p.title;
    $('phase-body').textContent=p.body;$('phase-focus').textContent=p.focus;
    document.querySelectorAll('[data-phase]').forEach((b,j)=>{if(j===i)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
  }
  if(ready)updateUnits();
}

function openSources(highlight){
  setPlaying(false);
  $('source-content').innerHTML=`<section class="disclosure-box" id="source-ai"><h3>史实、地形与视觉表达的边界</h3><p>高程来自真实数字高程模型，非手工捏造山体。当前是现代地表，不能据此判断1947年的植被、工事或通行条件。</p><p>部队编号、行动方向与阶段事件依据下列史料。箭线、部队图标、合围范围及动画中间帧均为教学示意，不是逐时复原，不表示精确阵位、行军路线、速度、兵力规模或战斗边界。</p><p>地形默认纵向增强3.6倍，可切换原比例。颜色为艺术化分层设色，不是卫星影像；地名为现代地理参考。外围阻援不在本核心区中逐一绘制。</p></section><section class="disclosure-box"><h3>AI 辅助制作声明</h3><p>本模块使用AI辅助编程、界面设计和史料摘要整理。高程来自公开DEM，未用AI生成地形；战史内容按所列公开来源整理，未将生成内容当作史料。无AI生成的历史照片、声音或人物影像。</p></section>${sources.map(s=>`<article class="source-item ${highlight===s.id?'highlight':''}" id="source-${s.id}"><small>${s.publisher}${s.date?' · '+s.date:''}</small><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title} ↗</a><p>${s.note}</p></article>`).join('')}<section class="source-item"><small>可复核的地形处理链</small><p class="metadata">${metadata?`裁切范围：${metadata.bounds.join(', ')}（西、南、东、北）。高程 ${metadata.min}–${metadata.max} m；${metadata.size}×${metadata.size} 点；WGS84 / EGM96。二进制资产：132,098 bytes。<br>SHA-256：${metadata.assetSha256}`:'地形尚未读取，可稍后重试。'}<br>获取日期：2026-11-21。采用双线性采样后取整，手机端简化网格。可通过仓库 tools/build_terrain.py 复现。</p></section>`;
  sourceDialog.showModal();
  if(highlight)requestAnimationFrame(()=>$(`source-${highlight==='ai'?'ai':highlight}`)?.scrollIntoView({block:'start',behavior:reduced?'instant':'smooth'}));
}

function heightAt(lon,lat){
  const [w,s,e,n]=metadata.bounds,N=metadata.size;
  const x=THREE.MathUtils.clamp((lon-w)/(e-w)*(N-1),0,N-1),y=THREE.MathUtils.clamp((n-lat)/(n-s)*(N-1),0,N-1);
  const ix=Math.min(N-2,Math.floor(x)),iy=Math.min(N-2,Math.floor(y)),dx=x-ix,dy=y-iy;
  return (heights[iy*N+ix]*(1-dx)+heights[iy*N+ix+1]*dx)*(1-dy)+(heights[(iy+1)*N+ix]*(1-dx)+heights[(iy+1)*N+ix+1]*dx)*dy;
}
function geo(lon,lat,lift=0){return new THREE.Vector3((lon-origin.lon)*111.32*Math.cos(origin.lat*Math.PI/180),heightAt(lon,lat)/1000*exaggeration+lift,(origin.lat-lat)*111.32);}
function defaultCamera(){return mobile?new THREE.Vector3(44,51,62):new THREE.Vector3(22,24,29);}
function tweenCamera(to){cameraTween={from:camera.position.clone(),to,start:clock.getElapsedTime(),duration:reduced?.01:1.8};}

function makeSurface(){
  const count=mobile?129:257,g=new THREE.PlaneGeometry(widthKm,depthKm,count-1,count-1);
  g.rotateX(-Math.PI/2);
  const a=g.attributes.position,colors=[],raw=[];
  const lo=new THREE.Color('#514734'),mid=new THREE.Color('#857458'),hi=new THREE.Color('#c2ae84');
  for(let i=0;i<a.count;i++){
    const x=i%count,y=Math.floor(i/count),h=heights[Math.round(y/(count-1)*256)*257+Math.round(x/(count-1)*256)];
    a.setY(i,h/1000*exaggeration);raw.push(h);
    const t=THREE.MathUtils.clamp((h-120)/440,0,1),c=t<.45?lo.clone().lerp(mid,t/.45):mid.clone().lerp(hi,(t-.45)/.55);
    colors.push(c.r,c.g,c.b);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  g.setAttribute('rawHeight',new THREE.Float32BufferAttribute(raw,1));g.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,metalness:.13});
  mat.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float rawHeight; varying float vHeight;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvHeight=rawHeight;');
    shader.fragmentShader='varying float vHeight;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float h=vHeight/25.0;
      float fw=max(fwidth(h),0.001);
      float line=1.0-smoothstep(0.0,fw*1.0,abs(fract(h+0.5)-0.5));
      float major=1.0-smoothstep(0.0,fw*0.65,abs(fract(h/4.0+0.5)-0.5));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.78,0.64,0.39),line*0.23+major*0.16);`);
  };
  const mesh=new THREE.Mesh(g,mat);mesh.receiveShadow=true;return mesh;
}

function makeSkirts(){
  const verts=[],N=metadata.size;
  const edge=[];
  for(let i=0;i<N;i++)edge.push([i,0]);
  for(let i=1;i<N;i++)edge.push([N-1,i]);
  for(let i=N-2;i>=0;i--)edge.push([i,N-1]);
  for(let i=N-2;i>=0;i--)edge.push([0,i]);
  const point=([x,y])=>new THREE.Vector3((x/256-.5)*widthKm,heights[y*N+x]/1000*exaggeration,(y/256-.5)*depthKm);
  for(let i=0;i<edge.length-1;i++){
    const a=point(edge[i]),b=point(edge[i+1]);
    verts.push(a.x,a.y,a.z,a.x,-.55,a.z,b.x,b.y,b.z,b.x,b.y,b.z,a.x,-.55,a.z,b.x,-.55,b.z);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));g.computeVertexNormals();
  const mat=new THREE.MeshStandardMaterial({color:'#3f3425',roughness:1,metalness:.25,side:THREE.DoubleSide});
  return new THREE.Mesh(g,mat);
}

function rebuildSurface(){
  for(const old of [terrain,skirts])if(old){scene.remove(old);old.geometry.dispose();old.material.dispose();}
  terrain=makeSurface();skirts=makeSkirts();scene.add(terrain,skirts);
  for(const label of labels)if(label.geo)label.position=geo(...label.geo,.2);
  rebuildRoutes();
}

function addLabel(text,position,classes='place',subtitle=''){
  const el=document.createElement('div');el.className='map-label '+classes;
  if(subtitle){const small=document.createElement('small');small.textContent=subtitle;el.append(small);}
  el.append(document.createTextNode(text));$('labels').append(el);
  const label={el,position};labels.push(label);return label;
}

function createUnit(unit){
  const group=new THREE.Group();const color=unit.side==='pla'?0xef9163:0x9bc8d8;
  const marker=new THREE.Mesh(new THREE.OctahedronGeometry(.15),new THREE.MeshBasicMaterial({color}));marker.position.y=.24;group.add(marker);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.28,.31,40),new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:true,opacity:.85}));ring.rotation.x=-Math.PI/2;group.add(ring);
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.65,5),new THREE.MeshBasicMaterial({color}));pole.position.y=.32;group.add(pole);
  scene.add(group);
  const el=document.createElement('button');el.type='button';el.className=`map-label unit-label ${unit.side==='kmt'?'kmt-label':''}`;el.textContent=mobile?unit.short:unit.name;el.setAttribute('aria-label',`${unit.name}：${unit.role}，查看行动依据`);$('labels').append(el);
  const label={el,position:new THREE.Vector3(),unit:true};labels.push(label);
  el.addEventListener('click',()=>{
    $('unit-card').hidden=false;$('unit-name').textContent=unit.name;$('unit-role').textContent=unit.role;$('unit-detail').textContent=unit.detail;
    $('unit-source').onclick=()=>openSources(unit.source);
  });
  movingUnits.push({unit,group,ring,marker,label,curve:null});
}

function rebuildRoutes(){
  routes.forEach(r=>{scene.remove(r.mesh,r.glow,r.arrow);r.mesh.geometry.dispose();r.mesh.material.dispose();r.glow.material.dispose();r.arrow.geometry.dispose();r.arrow.material.dispose();});routes.length=0;
  movingUnits.forEach(u=>{
    // Interpolation only conveys direction, not a verified path.
    const base=new THREE.CatmullRomCurve3(u.unit.anchors.map(p=>new THREE.Vector3(p[0],0,p[1])));
    const points=[];for(let i=0;i<=100;i++){const p=base.getPoint(i/100);points.push(geo(p.x,p.z,.14));}
    const curve=new THREE.CatmullRomCurve3(points);u.curve=curve;
    const color=u.unit.side==='pla'?0xf29a64:0x8fb6c4;
    const geometry=new THREE.TubeGeometry(curve,100,.025,5,false);
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.95,depthWrite:false}));
    const glow=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.13,depthWrite:false}));glow.scale.set(1,1,1);
    const arrow=new THREE.Mesh(new THREE.ConeGeometry(.17,.48,3),new THREE.MeshBasicMaterial({color}));
    scene.add(mesh,glow,arrow);routes.push({mesh,glow,arrow,curve,unit:u});
  });
}

function updateUnits(){
  const fraction=Math.min(.99,(viewTime+.8)/4.8);
  for(const u of movingUnits){
    const p=u.curve.getPointAt(fraction);u.group.position.copy(p);u.label.position.copy(p).add(new THREE.Vector3(0,.85,0));
    if(u.unit.side==='kmt')u.label.el.textContent=viewTime>=4?(mobile?'整74师 · 歼灭':'整74师 · 已歼灭'):(mobile?u.unit.short:u.unit.name);
  }
  for(const r of routes){
    const count=Math.max(1,Math.floor(fraction*100))*5*6;
    r.mesh.geometry.setDrawRange(0,count);
    r.arrow.position.copy(r.curve.getPointAt(fraction));
    const dir=r.curve.getTangentAt(fraction).normalize();r.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir);
  }
  updateVisibility();
}

function updateVisibility(){
  for(const u of movingUnits){u.group.visible=!terrainOnly;u.label.el.style.display=terrainOnly?'none':'';}
  for(const r of routes){r.mesh.visible=!terrainOnly;r.glow.visible=!terrainOnly;r.arrow.visible=!terrainOnly;}
  if(terrainOnly)$('unit-card').hidden=true;
}

function buildScene(){
  renderer=new THREE.WebGLRenderer({antialias:!mobile,alpha:true,powerPreference:mobile?'low-power':'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,mobile?1.5:1.75));
  renderer.setClearColor(0x120e0c,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.35;
  $('scene').append(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','三维地形视图；鼠标拖动旋转，滚轮缩放。也可用旁侧按钮复位和俯视。');
  scene=new THREE.Scene();scene.fog=new THREE.FogExp2(0x17130f,.012);
  camera=new THREE.PerspectiveCamera(43,1,.1,250);camera.position.copy(defaultCamera());
  controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.5,0);controls.enableDamping=true;controls.dampingFactor=.07;controls.enablePan=false;
  controls.minDistance=mobile?30:12;controls.maxDistance=mobile?100:65;controls.maxPolarAngle=Math.PI*.45;controls.minPolarAngle=.03;
  controls.addEventListener('start',()=>{stopFlight();cameraTween=null;});
  const ambient=new THREE.HemisphereLight(0xf6e5bd,0x2d2924,2.3);scene.add(ambient);
  const sun=new THREE.DirectionalLight(0xffe1aa,3.6);sun.position.set(-12,18,-15);scene.add(sun);
  const rim=new THREE.DirectionalLight(0x9d7660,1.5);rim.position.set(16,7,9);scene.add(rim);
  const grid=new THREE.GridHelper(90,45,0x7a6545,0x4a3b2b);grid.position.y=-.7;grid.material.transparent=true;grid.material.opacity=.21;scene.add(grid);
  const base=new THREE.Mesh(new THREE.BoxGeometry(widthKm+.1,.34,depthKm+.1),new THREE.MeshStandardMaterial({color:0x251d15,metalness:.5,roughness:.6}));base.position.y=-.6;scene.add(base);
  const edges=new THREE.LineSegments(new THREE.EdgesGeometry(base.geometry),new THREE.LineBasicMaterial({color:0x9b7a42,transparent:true,opacity:.6}));edges.position.copy(base.position);scene.add(edges);
  units.forEach(createUnit);rebuildSurface();
  const places=[['孟良崮',118.189,35.579,'place primary','战役核心区'],['垛庄',118.158,35.545,'place strategic','南侧要地'],['向坦埠',118.20,35.707,'place secondary','北向 · 地图外'],['鲁南方向',118.092,35.501,'place secondary','第6纵队来向']];
  places.forEach(([name,lon,lat,cls,subtitle])=>{const label=addLabel(name,geo(lon,lat,.2),cls,subtitle);label.geo=[lon,lat];});
  // The red wash is deliberately not a claimed battle boundary.
  const wash=new THREE.Mesh(new THREE.CircleGeometry(2.5,64),new THREE.MeshBasicMaterial({color:0xb65331,transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide}));
  wash.rotation.x=-Math.PI/2;wash.position.copy(geo(118.19,35.585,.12));scene.add(wash);
  disposable.push(wash);
  const particles=[];for(let i=0;i<(mobile?35:85);i++){const seed=Math.sin(i*127.1+311.7)*43758.5453;const f=seed-Math.floor(seed);particles.push((f-.5)*55,2+(Math.sin(i*93.1)*.5+.5)*12,(Math.sin(i*35.7))*25);}
  const pg=new THREE.BufferGeometry();pg.setAttribute('position',new THREE.Float32BufferAttribute(particles,3));
  const dust=new THREE.Points(pg,new THREE.PointsMaterial({color:0xd0a769,size:.035,transparent:true,opacity:.35,depthWrite:false}));scene.add(dust);
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();fail('三维绘图上下文已中断，请重新加载；下方史料与时间轴仍可阅读。');});
  const resize=new ResizeObserver(()=>{
    const w=$('scene').clientWidth,h=$('scene').clientHeight;renderer.setSize(w,h);camera.aspect=w/h;
    camera.setViewOffset(w,h,mobile?0:-w*.105,mobile?h*.13:-h*.015,w,h);camera.updateProjectionMatrix();
  });resize.observe($('scene'));
  document.addEventListener('visibilitychange',()=>{suspended=document.hidden;previousFrame=0;});
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===window.parent&&e.data?.type==='guide:terrain-pause'){suspended=true;setPlaying(false);stopFlight();}});
  ready=true;setTime(0);$('data-status').textContent='真实数字高程';$('quality-label').textContent=mobile?'轻量网格 · 32k 面':'精细网格 · 131k 面';
  $('loading').style.opacity='0';setTimeout(()=>$('loading').hidden=true,750);
  requestAnimationFrame(render);
}

function render(now){
  raf=requestAnimationFrame(render);
  const delta=previousFrame?Math.min((now-previousFrame)/1000,.06):0;previousFrame=now;
  if(suspended||document.hidden)return;
  if(playing){setTime(viewTime+delta*.10);if(viewTime>=4)setPlaying(false);}
  // Timeline narration remains functional when WebGL or elevation is unavailable.
  if(!ready)return;
  const elapsed=clock.getElapsedTime();
  if(flying){
    flightTime+=delta;const angle=.65+flightTime*.12;
    const radius=mobile?72:30;
    const desired=new THREE.Vector3(Math.sin(angle)*radius,mobile?49:15+Math.sin(flightTime*.13)*4,Math.cos(angle)*radius);
    camera.position.lerp(desired,reduced?.015:.035);controls.target.lerp(new THREE.Vector3(0,.7,-1),.02);
  }else if(cameraTween){
    const t=THREE.MathUtils.clamp((elapsed-cameraTween.start)/cameraTween.duration,0,1),ease=t*t*(3-2*t);
    camera.position.lerpVectors(cameraTween.from,cameraTween.to,ease);if(t===1)cameraTween=null;
  }
  controls.update();
  if(now-lastRender<(mobile?32:21))return;lastRender=now;
  for(const u of movingUnits){if(!reduced){u.marker.rotation.y=elapsed*.5;u.ring.material.opacity=.5+Math.sin(elapsed*2)*.25;}}
  layoutLabels();
  const angle=controls.getAzimuthalAngle();document.querySelector('.north svg').style.transform=`rotate(${-angle*180/Math.PI}deg)`;
  renderer.render(scene,camera);
}

function layoutLabels(){
  const w=$('scene').clientWidth,h=$('scene').clientHeight,placed=[];
  // Prioritize the battlefield name, then units. Screen-space leader lines keep
  // crowded end-phase markers readable without pretending they moved on the map.
  const sorted=[...labels].sort((a,b)=>{
    const rank=l=>l.el.classList.contains('primary')?0:l.unit?1:2;
    return rank(a)-rank(b);
  });
  const projected=sorted.map(l=>{
    tempVector.copy(l.position).project(camera);
    return {l,x:(tempVector.x*.5+.5)*w,y:(-tempVector.y*.5+.5)*h,z:tempVector.z,bw:l.el.offsetWidth,bh:l.el.offsetHeight};
  });
  for(const {l,x,y,z,bw,bh} of projected){
    if(!l.line){l.line=document.createElementNS(leaderSvg.namespaceURI,'line');l.line.setAttribute('stroke',l.unit?'#be956b':'#cbb278');l.line.setAttribute('stroke-opacity','.5');l.line.setAttribute('stroke-width','.6');leaderSvg.append(l.line);}
    const visible=z>=-1&&z<=1&&bw>0&&bh>0&&!(terrainOnly&&l.unit);
    l.el.style.visibility=visible?'visible':'hidden';l.line.style.display='none';
    if(!visible)continue;
    const left=mobile?10:315,right=w-(mobile?57:102),top=mobile?230:145,bottom=mobile?h-385:h-249;
    let best=null;
    for(const dy of [0,-28,28,-56,56,-84,84])for(const dx of [0,-45,45,-90,90,-135,135]){
      const cx=THREE.MathUtils.clamp(x+dx,left+bw/2,right-bw/2),cy=THREE.MathUtils.clamp(y+dy,top+bh,bottom);
      const box={left:cx-bw/2-5,right:cx+bw/2+5,top:cy-bh-4,bottom:cy+4};
      let score=(cx-x)**2+(cy-y)**2;
      for(const p of placed)score+=Math.max(0,Math.min(box.right,p.right)-Math.max(box.left,p.left))*Math.max(0,Math.min(box.bottom,p.bottom)-Math.max(box.top,p.top))*1000;
      if(!best||score<best.score)best={cx,cy,box,score};
    }
    placed.push(best.box);l.el.style.transform=`translate(${best.cx}px,${best.cy}px) translate(-50%,-100%)`;
    if(Math.hypot(best.cx-x,best.cy-y)>17){l.line.setAttribute('x1',x);l.line.setAttribute('y1',y);l.line.setAttribute('x2',best.cx);l.line.setAttribute('y2',best.cy-bh/2);l.line.style.display='';}
  }
}

function fail(reason){
  ready=false;setPlaying(false);stopFlight();if(raf)cancelAnimationFrame(raf);
  $('loading').hidden=true;$('fallback').hidden=false;$('fallback-reason').textContent=reason;
  $('data-status').textContent='史料阅读模式';$('quality-label').textContent='3D 暂不可用';
  $('labels').hidden=true;
  for(const id of ['fly','reset','view','layers','exaggeration'])$(id).disabled=true;
  previousFrame=0;
  raf=requestAnimationFrame(render);
}

async function init(){
 setTime(0);
 try{
  const results=await Promise.all([fetch('assets/elevation.json'),fetch('assets/elevation.i16')]);
  if(results.some(r=>!r.ok))throw Error('高程文件未能完整读取，请检查网络后重试。');
  metadata=await results[0].json();const binary=await results[1].arrayBuffer();
  if(binary.byteLength!==metadata.size*metadata.size*2)throw Error('高程文件长度不正确。');
  const dv=new DataView(binary);heights=new Int16Array(metadata.size*metadata.size);
  for(let i=0;i<heights.length;i++)heights[i]=dv.getInt16(i*2,true);
  buildScene();
 }catch(error){console.error('Terrain unavailable:',error);fail(error.message||'当前浏览器不支持三维绘图。');}
}
init();
