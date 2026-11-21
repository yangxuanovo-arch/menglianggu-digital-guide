(function(){
'use strict';
var G=window.GUIDE, $=function(s){return document.querySelector(s)};
var LS_KEY='mlg_stamps_v1';
var stamps=loadStamps();
function loadStamps(){try{var value=JSON.parse(localStorage.getItem(LS_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch(e){return {}}}
function save(){try{localStorage.setItem(LS_KEY,JSON.stringify(stamps))}catch(e){}}
function toast(t){var d=document.createElement('div');d.className='toast';d.textContent=t;document.body.appendChild(d);setTimeout(function(){d.style.opacity=0},1800);setTimeout(function(){d.remove()},2300)}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}

/* ---------- WGS84 -> GCJ-02 (高德底图使用 GCJ-02 坐标) ---------- */
var PI=Math.PI,A=6378245.0,EE=0.00669342162296594323;
function tLat(x,y){var r=-100+2*x+3*y+0.2*y*y+0.1*x*y+0.2*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;r+=(20*Math.sin(y*PI)+40*Math.sin(y/3*PI))*2/3;r+=(160*Math.sin(y/12*PI)+320*Math.sin(y*PI/30))*2/3;return r}
function tLng(x,y){var r=300+x+2*y+0.1*x*x+0.1*x*y+0.1*Math.sqrt(Math.abs(x));r+=(20*Math.sin(6*x*PI)+20*Math.sin(2*x*PI))*2/3;r+=(20*Math.sin(x*PI)+40*Math.sin(x/3*PI))*2/3;r+=(150*Math.sin(x/12*PI)+300*Math.sin(x/30*PI))*2/3;return r}
function gcj(lat,lng){var dLat=tLat(lng-105,lat-35),dLng=tLng(lng-105,lat-35),rad=lat/180*PI,m=Math.sin(rad);m=1-EE*m*m;var s=Math.sqrt(m);dLat=(dLat*180)/((A*(1-EE))/(m*s)*PI);dLng=(dLng*180)/(A/s*Math.cos(rad)*PI);return[lat+dLat,lng+dLng]}
function P(o){return gcj(o.lat,o.lng)}

/* ---------- map ---------- */
var map=L.map('map',{zoomControl:true,attributionControl:true});
var vec=L.tileLayer('https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:18,attribution:'底图 © 高德地图'});
var sat=L.layerGroup([L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:18,attribution:'影像 © 高德地图'}),L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}',{subdomains:'1234',maxZoom:18})]);
vec.addTo(map);
var poiLayer=L.layerGroup().addTo(map),routeLayer=L.layerGroup(),ctxLayer=L.layerGroup();
L.control.layers({'标准地图':vec,'卫星影像':sat},{'推荐路线':routeLayer,'区位与交通':ctxLayer},{position:'topright'}).addTo(map);
L.control.scale({imperial:false}).addTo(map);
var markers={},markerOffsets={};
function icon(p){var cls='poi'+(stamps[p.id]?' done':'')+(current===p.id?' active':''),o=markerOffsets[p.id]||[0,0];return L.divIcon({className:'',html:'<div class="'+cls+'"><span>'+p.no+'</span></div>',iconSize:[34,34],iconAnchor:[17-o[0],34-o[1]]})}
var current=null;
G.points.forEach(function(p){
  var m=L.marker(P(p),{icon:icon(p),title:p.name}).addTo(poiLayer);
  m.bindTooltip(p.no+' '+p.name,{direction:'right',offset:[14,-18],className:'poi-label'});
  m.on('click',function(){openPoint(p.id)});markers[p.id]=m;
});
function refreshIcons(){G.points.forEach(function(p){markers[p.id].setIcon(icon(p))})}
function separateMarkers(){var used=[];G.points.forEach(function(p){var a=map.latLngToContainerPoint(P(p)),x=a.x,y=a.y,o=[0,0];for(var n=0;n<12;n++){o=[n?Math.ceil(n/2)*54*(n%2?1:-1):0,0];x=a.x+o[0];if(used.every(function(b){return Math.hypot(x-b[0],y-b[1])>=52}))break}markerOffsets[p.id]=o;used.push([x,y])});refreshIcons()}
map.on('zoomend moveend',separateMarkers);
var bounds=L.latLngBounds(G.points.map(P));
var mountainBounds=L.latLngBounds(G.points.filter(function(p){return p.id!=='hall'}).map(P));
function home(){map.fitBounds(mountainBounds,{padding:[60,60],maxZoom:16})}
home();
separateMarkers();
var hallControl=L.control({position:'bottomleft'});
hallControl.onAdd=function(){var b=L.DomUtil.create('button','btn-ghost');b.id='hallShortcut';b.type='button';b.textContent='1 山下纪念馆';b.title='前往山下纪念馆；相邻点标记为方便点击作轻微错位';L.DomEvent.disableClickPropagation(b);b.onclick=function(){openPoint('hall')};return b};hallControl.addTo(map);

/* route */
var R=G.route,rp=R.order.map(function(id){return P(byId(id))});
R.legs.forEach(function(l){var a=P(byId(l.from)),b=P(byId(l.to)),transport=l.time==='乘车/景区交通';L.polyline([a,b],{color:transport?'#586268':'#b71c1c',weight:transport?2:5,opacity:.85,dashArray:transport?'3 8':'10 8',className:transport?'transport-line':'walk-line'}).addTo(routeLayer);L.marker([(a[0]+b[0])/2,(a[1]+b[1])/2],{interactive:false,icon:L.divIcon({className:'',html:'<span class="leg-label'+(transport?' transport-label':'')+'">'+esc(l.time)+'</span>',iconSize:null})}).addTo(routeLayer)});
routeLayer.addTo(map);
function updateMapLabels(){map.getContainer().classList.toggle('detail-labels',map.getZoom()>=17)}
map.on('zoomend',updateMapLabels);updateMapLabels();
var overview=L.control({position:'topright'});
overview.onAdd=function(){var b=L.DomUtil.create('button','btn-ghost');b.type='button';b.textContent='全区概览';L.DomEvent.disableClickPropagation(b);b.onclick=function(){map.fitBounds(bounds,{padding:[50,50]})};return b};overview.addTo(map);
/* context */
var site=P(G.site);
(G.context||[]).forEach(function(c){var ll=P(c);L.marker(ll,{icon:L.divIcon({className:'',html:'<span class="city">'+esc(c.name)+'</span>',iconSize:null})}).addTo(ctxLayer).bindPopup('<b>'+esc(c.name)+'</b><br>'+esc(c.desc));L.polyline([site,ll],{color:'#37474f',weight:2,dashArray:'4 6'}).addTo(ctxLayer)});
L.circleMarker(site,{radius:9,color:'#fff',weight:3,fillColor:'#b71c1c',fillOpacity:1}).addTo(ctxLayer).bindPopup('<b>'+esc(G.site.name)+'</b><br>'+esc(G.site.address));
function byId(id){for(var i=0;i<G.points.length;i++)if(G.points[i].id===id)return G.points[i]}
function showContext(){closeAll();ctxLayer.addTo(map);var b=L.latLngBounds([site].concat((G.context||[]).map(P)));map.fitBounds(b,{padding:[40,40]});openPanel('区位与交通',contextHtml())}
function contextHtml(){var h='<p><b>'+esc(G.site.name)+'</b><br>'+esc(G.site.address)+'</p><p>'+esc(G.site.location)+'</p>';(G.context||[]).forEach(function(c){h+='<div class="leg"><div class="no">●</div><div><b>'+esc(c.name)+'</b><br><small>'+esc(c.desc)+'</small></div></div>'});h+=srcHtml(G.site.sources);h+='<p><button class="btn-ghost" id="ctxBack">返回景区导览</button></p>';return h}

/* ---------- audio + digital human ---------- */
var audio=new Audio(),actx,analyser,srcNode,buf,cues=[],raf,onEnd=null,playingId=null,subtitleRequest=null,speechVersion=0;
audio.preload='auto';
var mouth=$('#mouth'),lip=$('#lip'),bubble=$('#bubble'),guide=$('#guide');
function ensureCtx(){if(actx)return;try{actx=new (window.AudioContext||window.webkitAudioContext)();analyser=actx.createAnalyser();analyser.fftSize=512;srcNode=actx.createMediaElementSource(audio);srcNode.connect(analyser);analyser.connect(actx.destination);buf=new Uint8Array(analyser.fftSize)}catch(e){analyser=null}}
function parseSrt(t){var out=[];t.replace(/\r/g,'').split(/\n\n+/).forEach(function(b){var m=b.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\n([\s\S]*)/);if(m){var s=+m[1]*3600+ +m[2]*60+ +m[3]+ +m[4]/1000,e=+m[5]*3600+ +m[6]*60+ +m[7]+ +m[8]/1000;out.push({s:s,e:e,t:m[9].trim()})}});return out}
var level=0;
function loop(){
  var v=0;
  if(analyser&&!audio.paused){analyser.getByteTimeDomainData(buf);var sum=0;for(var i=0;i<buf.length;i++){var x=(buf[i]-128)/128;sum+=x*x}v=Math.min(1,Math.sqrt(sum/buf.length)*5)}
  else if(!audio.paused){v=0.35+0.35*Math.sin(Date.now()/70)}
  level=level*0.5+v*0.5;
  mouth.setAttribute('ry',(1.5+level*9).toFixed(2));mouth.setAttribute('rx',(9-level*2).toFixed(2));lip.style.opacity=level>0.12?0:1;
  var t=audio.currentTime,c='';for(var j=0;j<cues.length;j++){if(t>=cues[j].s&&t<=cues[j].e+0.3){c=cues[j].t;break}}
  if(c&&bubble.textContent!==c)bubble.textContent=c;
  raf=requestAnimationFrame(loop);
}
function speak(id,fallbackText,cb){
  ensureCtx();if(actx&&actx.state==='suspended')actx.resume();
  stopSpeak(true);playingId=id;onEnd=cb||null;guide.classList.remove('hidden');bubble.textContent=fallbackText?fallbackText.slice(0,40)+'…':'';$('#gPause').textContent='暂停';
  var version=speechVersion;subtitleRequest=window.AbortController?new AbortController():null;
  fetch('audio/'+id+'.srt',subtitleRequest?{signal:subtitleRequest.signal}:{}).then(function(r){return r.ok?r.text():''}).then(function(t){if(playingId===id&&speechVersion===version)cues=parseSrt(t)}).catch(function(){});
  audio.src='audio/'+id+'.mp3';audio.currentTime=0;
  var pr=audio.play();if(pr&&pr.catch)pr.catch(function(){toast('请点击页面后重试播放')});
  cancelAnimationFrame(raf);loop();
}
function stopSpeak(keep){audio.pause();onEnd=null;playingId=null;cues=[];bubble.textContent='';speechVersion++;if(subtitleRequest){subtitleRequest.abort();subtitleRequest=null}if(!keep){guide.classList.add('hidden');cancelAnimationFrame(raf)}}
audio.addEventListener('ended',function(){var f=onEnd;onEnd=null;var id=playingId;playingId=null;mouth.setAttribute('ry',1.5);lip.style.opacity=1;if(f)f(id);var status=$('#panelAudioStatus');if(status)status.textContent='讲解已完成，印章已保存'});
$('#gPause').onclick=function(){if(audio.paused){audio.play();this.textContent='暂停'}else{audio.pause();this.textContent='继续'}};
$('#gStop').onclick=function(){stopTour();stopSpeak(false)};
var minimise=document.createElement('button');minimise.id='gMin';minimise.type='button';minimise.textContent='收起';minimise.onclick=function(){var small=guide.classList.toggle('minimized');minimise.textContent=small?'展开':'收起';minimise.setAttribute('aria-expanded',String(!small))};$('.guide-ctrl').appendChild(minimise);

/* ---------- point sheet ---------- */
function srcHtml(s){if(!s||!s.length)return'';return'<div class="src">资料来源：'+s.map(function(x,i){return'['+(i+1)+'] <a href="'+esc(x.u)+'" target="_blank" rel="noopener">'+esc(x.t)+'</a>'}).join('；')+'</div>'}
function openPoint(id,opts){
  if(!opts||!opts.autoplay)stopTour();
  stopSpeak(false);setTab('map');
  var p=byId(id);current=id;refreshIcons();closePanel();
  map.flyTo(P(p),Math.max(map.getZoom(),16),{duration:.8});
  var h='<h2>'+p.no+'. '+esc(p.name)+'</h2><div class="meta">'+esc(p.type||'')+'</div>';
  h+='<div class="cover'+(p.img?' has-photo':'')+'">'+(p.img?'<img src="'+esc(p.img)+'" alt="'+esc(p.imgAlt||p.name)+'" onerror="this.parentNode.classList.remove(\'has-photo\');this.remove()">':'')+'<span style="position:relative">'+esc(p.tagline||G.site.name)+'</span></div>';
  if(p.imageCredit){var credit=p.imageCredit;h+='<div class="src photo-credit">图：'+esc(credit.author)+' / <a href="'+esc(credit.licenseUrl)+'" target="_blank" rel="noopener">'+esc(credit.license)+'</a> / 来源 <a href="'+esc(credit.source)+'" target="_blank" rel="noopener">Wikimedia Commons</a>（缩放压缩，封面裁切）</div>'}
  h+='<div class="actions"><button class="btn-primary" id="btnListen">▶ 听讲解（听完集章）</button><button class="btn-ghost" id="btnStamp">'+(stamps[id]?'✔ 已打卡':'现场定位打卡')+'</button></div>';
  if(!stamps[id])h+='<p><button class="btn-ghost" id="btnRemote">非现场打卡（听完本点讲解）</button></p>';
  p.text.split(/\n+/).forEach(function(t){h+='<p class="text">'+esc(t)+'</p>'});
  if(p.facts&&p.facts.length)h+='<div class="facts">'+p.facts.map(esc).join('<br>')+'</div>';
  h+=srcHtml(p.sources);
  var nx=nextOf(id);if(nx)h+='<p><button class="btn-ghost" id="btnNext">下一站：'+esc(nx.name)+' →</button></p>';
  $('#sheetBody').innerHTML=h;$('#sheet').classList.remove('hidden');$('#sheet').scrollTop=0;guide.classList.add('with-sheet');
  $('#btnListen').onclick=function(){speak(id,p.text,function(){stamp(id,true);if(touring)tourTimer=setTimeout(tourNext,1200)})};
  $('#btnStamp').onclick=function(){if(stamps[id])return;tryGeo(id)};
  var remote=$('#btnRemote');if(remote)remote.onclick=function(){if(stamps[id]){toast('本点已完成打卡');return}if(playingId===id){toast('听完本点讲解将自动获得印章');return}$('#btnListen').click()};
  if(nx)$('#btnNext').onclick=function(){openPoint(nx.id)};
  if(opts&&opts.autoplay)$('#btnListen').click();
}
function nextOf(id){var i=R.order.indexOf(id);return i>=0&&i<R.order.length-1?byId(R.order[i+1]):null}
function tryGeo(id){
  var p=byId(id);
  if(!navigator.geolocation){toast('请先收听完讲解再打卡');return}
  toast('正在定位…');
  navigator.geolocation.getCurrentPosition(function(pos){var d=dist(pos.coords.latitude,pos.coords.longitude,p.lat,p.lng);if(d<300){stamp(id)}else toast('距该点位约'+(d>1000?(d/1000).toFixed(1)+'公里':Math.round(d)+'米')+'，可收听讲解完成线上打卡')},function(){toast('收听完讲解即可完成线上打卡')},{timeout:6000});
}
function dist(a,b,c,d){var r=6371000,x=(c-a)*PI/180,y=(d-b)*PI/180,s=Math.sin(x/2)*Math.sin(x/2)+Math.cos(a*PI/180)*Math.cos(c*PI/180)*Math.sin(y/2)*Math.sin(y/2);return 2*r*Math.asin(Math.sqrt(s))}
function stamp(id,quiet){if(stamps[id])return;stamps[id]=Date.now();save();refreshIcons();var b=$('#btnStamp');if(b&&current===id)b.textContent='✔ 已打卡';toast('获得印章：'+byId(id).name);if(allStamped()&&!stamps.__all){stamps.__all=1;save();setTimeout(function(){toast('全部点位已打卡！去“研学打卡”领取证书')},2000)}}
function allStamped(){return G.points.every(function(p){return stamps[p.id]})}
function closeSheet(){stopTour();$('#sheet').classList.add('hidden');guide.classList.remove('with-sheet');current=null;refreshIcons()}
$('#sheetClose').onclick=function(){closeSheet();setTab('map')};

/* ---------- panels ---------- */
function openPanel(t,h){stopTour();guide.classList.add('hidden');if(playingId&&!audio.paused)h='<p id="panelAudioStatus">AI合成语音 · 正在讲解：'+esc(byId(playingId)?byId(playingId).name:G.site.name)+' <button class="btn-ghost" id="panelAudioStop">停止讲解</button></p>'+h;$('#panelTitle').textContent=t;$('#panelBody').innerHTML=h;$('#panel').classList.remove('hidden');$('#panel').scrollTop=0;var b=$('#ctxBack');if(b)b.onclick=function(){closePanel();setTab('map')};var stop=$('#panelAudioStop');if(stop)stop.onclick=function(){stopSpeak(false);$('#panelAudioStatus').textContent='讲解已停止；听完本点讲解可集章'}}
function closePanel(){$('#panel').classList.add('hidden');if(playingId)guide.classList.remove('hidden');if(map.hasLayer(ctxLayer)){map.removeLayer(ctxLayer);home()}}
$('#panelClose').onclick=function(){closePanel();setTab('map')};
function closeAll(){closeSheet();closePanel()}
function setTab(t){document.querySelectorAll('#tabbar button').forEach(function(b){b.classList.toggle('active',b.dataset.tab===t)})}
document.querySelectorAll('#tabbar button').forEach(function(b){b.onclick=function(){var t=b.dataset.tab;setTab(t);closeSheet();
  if(t==='map'){closePanel();home()}else if(t==='route')routePanel();else if(t==='stamps')stampPanel();else if(t==='quiz')quizPanel();else aboutPanel()}});

function routePanel(){
  routeLayer.addTo(map);home();
  var h='<p>'+esc(R.intro)+'</p><p><b>全程约 '+esc(R.total)+'</b></p><p>灰色细点线：乘车／景区交通<br>红色虚线：山上步行游线</p>';
  R.order.forEach(function(id,i){var p=byId(id),l=R.legs[i-1];if(l)h+='<div class="leg"><div class="no" style="background:#fff;color:#b71c1c;border:1px dashed #b71c1c">↓</div><div><small>'+(l.time==='乘车/景区交通'?'山下至山上：乘车／景区交通，请以现场安排为准':'步行约 '+esc(l.dist)+' · '+esc(l.time))+'</small></div></div>';h+='<div class="leg"><div class="no">'+p.no+'</div><div><b><a href="#" data-id="'+id+'">'+esc(p.name)+'</a></b><br><small>'+esc(p.tagline||'')+'</small></div></div>'});
  h+='<p style="font-size:12px;color:#7a6a5f">距离与用时为估算，请以景区现场指示为准。</p><button class="btn-primary" id="btnTour" style="width:100%">▶ 跟随数字人小崮全程导览</button>';
  openPanel('推荐游览路线',h);
  document.querySelectorAll('#panelBody a[data-id]').forEach(function(a){a.onclick=function(e){e.preventDefault();openPoint(a.dataset.id)}});
  $('#btnTour').onclick=startTour;
}
var touring=false,tourIdx=0,tourTimer=null;
function stopTour(){var active=touring;touring=false;clearTimeout(tourTimer);tourTimer=null;if(active)stopSpeak(false)}
function startTour(){closeAll();touring=true;tourIdx=0;speak('intro',G.narration.intro,function(){if(touring)tourNext()});map.flyToBounds(bounds,{padding:[50,50]})}
function tourNext(){if(!touring)return;if(tourIdx>=R.order.length){touring=false;closeSheet();home();speak('outro',G.narration.outro,function(){stopSpeak(false);stampPanel();setTab('stamps')});return}openPoint(R.order[tourIdx++],{autoplay:true})}

function stampPanel(){
  var n=G.points.filter(function(p){return stamps[p.id]}).length,tot=G.points.length;
  var h='<p>非现场可进入点位，选择“非现场打卡”，听完本点讲解即可获得印章；现场也可在300米内定位打卡。集齐全部印章并通过知识问答，可生成“红色研学证书”。</p>';
  h+='<div class="progress"><div style="width:'+(100*n/tot)+'%"></div></div><p style="text-align:center">已集 '+n+' / '+tot+' 枚'+(stamps.__quiz?' · 知识问答已通过':'')+'</p><div class="stamps">';
  G.points.forEach(function(p){h+='<div class="stamp'+(stamps[p.id]?' on':'')+'" data-id="'+p.id+'"><b>★</b>'+esc(p.short||p.name)+'</div>'});
  h+='<div class="stamp'+(stamps.__quiz?' on':'')+'" data-q="1"><b>✎</b>知识问答</div></div>';
  if(n===tot&&stamps.__quiz){h+='<h3>领取红色研学证书</h3><input class="name" id="certName" placeholder="请输入你的姓名" maxlength="12"><button class="btn-primary" id="btnCert">生成证书</button><div id="certBox"></div>'}
  else h+='<p style="color:#7a6a5f;font-size:13px">还差：'+G.points.filter(function(p){return!stamps[p.id]}).map(function(p){return p.short||p.name}).concat(stamps.__quiz?[]:['知识问答']).join('、')+'</p>';
  h+='<p><button class="btn-ghost" id="btnReset" style="font-size:12px;padding:4px 10px">重置打卡记录</button></p>';
  openPanel('研学打卡 · 集章',h);
  document.querySelectorAll('.stamp[data-id]').forEach(function(s){s.onclick=function(){openPoint(s.dataset.id)}});
  var q=document.querySelector('.stamp[data-q]');q.onclick=function(){setTab('quiz');quizPanel()};
  $('#btnReset').onclick=function(){if(confirm('确定清空打卡记录？')){stamps={};save();refreshIcons();stampPanel()}};
  var bc=$('#btnCert');if(bc)bc.onclick=function(){var name=$('#certName').value.trim();if(!name){toast('请先填写姓名');$('#certName').focus();return}drawCert(name)};
}
async function drawCert(name){
  try{await document.fonts.load('30px GuideCJK')}catch(e){}
  var c=document.createElement('canvas');c.width=1000;c.height=700;c.className='cert';var x=c.getContext('2d');
  x.fillStyle='#fbf7ef';x.fillRect(0,0,1000,700);x.strokeStyle='#b71c1c';x.lineWidth=14;x.strokeRect(24,24,952,652);x.lineWidth=2;x.strokeStyle='#e6b450';x.strokeRect(44,44,912,612);
  x.fillStyle='#b71c1c';x.textAlign='center';x.font='bold 56px GuideCJK,sans-serif';x.fillText('红色研学证书',500,150);
  x.fillStyle='#2a1f1a';x.font='30px GuideCJK,sans-serif';x.fillText(name+' 同学：',500,240);
  x.font='26px GuideCJK,sans-serif';['你已通过“崮上丰碑”数字导览，','完成孟良崮战役纪念地全部 '+G.points.length+' 个点位的研学打卡','并通过红色知识问答。','传承红色基因，赓续沂蒙精神！'].forEach(function(t,i){x.fillText(t,500,310+i*48)});
  x.font='22px GuideCJK,sans-serif';x.fillText(new Date().toLocaleDateString('zh-CN'),760,600);x.fillText('崮上丰碑 · 数字导览',760,565);
  x.save();x.translate(250,560);x.rotate(-.15);x.strokeStyle='#d32f2f';x.lineWidth=5;x.beginPath();x.arc(0,0,70,0,2*PI);x.stroke();x.fillStyle='#d32f2f';x.font='bold 22px GuideCJK,sans-serif';x.fillText('孟良崮',0,-12);x.fillText('研学打卡',0,20);x.font='30px GuideCJK,sans-serif';x.fillText('★',0,52);x.restore();
  var box=$('#certBox');box.innerHTML='';box.appendChild(c);var a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='红色研学证书.png';a.textContent='保存证书图片';a.className='btn-ghost';a.style.display='inline-block';a.style.marginTop='8px';box.appendChild(a);
}

function quizPanel(){
  var qs=G.quiz.slice().sort(function(){return Math.random()-.5}).slice(0,Math.min(5,G.quiz.length)),ans=0,right=0;
  var h='<p>随机抽取 '+qs.length+' 题，答对 '+Math.ceil(qs.length*0.6)+' 题及以上即获得“知识问答”印章。</p>';
  qs.forEach(function(q,i){h+='<div class="q" data-i="'+i+'"><b>'+(i+1)+'. '+esc(q.q)+'</b>'+q.opts.map(function(o,j){return'<button class="opt" data-j="'+j+'">'+'ABCD'[j]+'. '+esc(o)+'</button>'}).join('')+'<div class="exp hidden"></div></div>'});
  h+='<div id="quizRes"></div>';
  openPanel('红色知识问答',h);
  document.querySelectorAll('.q').forEach(function(d){var q=qs[+d.dataset.i],done=false;d.querySelectorAll('.opt').forEach(function(b){b.onclick=function(){if(done)return;done=true;ans++;var j=+b.dataset.j;if(j===q.a){b.classList.add('right');right++}else{b.classList.add('wrong');d.querySelectorAll('.opt')[q.a].classList.add('right')}var e=d.querySelector('.exp');e.textContent='解析：'+q.exp;e.classList.remove('hidden');
    if(ans===qs.length){var pass=right>=Math.ceil(qs.length*0.6);if(pass&&!stamps.__quiz){stamps.__quiz=Date.now();save()}$('#quizRes').innerHTML='<div class="facts">得分 '+right+' / '+qs.length+'。'+(pass?'恭喜通过，获得“知识问答”印章！':'再接再厉，可以再试一次。')+'</div><p><button class="btn-primary" id="qAgain">再来一组</button> <button class="btn-ghost" id="qStamp">查看集章</button></p>';$('#qAgain').onclick=quizPanel;$('#qStamp').onclick=function(){setTab('stamps');stampPanel()};$('#quizRes').scrollIntoView({behavior:'smooth'})}}})});
}
function aboutPanel(){
  var S=G.site,h='<h3 style="color:#b71c1c;margin-top:0">'+esc(S.name)+'</h3><p>'+esc(S.intro)+'</p>';
  if(S.facts)h+='<div class="facts">'+S.facts.map(esc).join('<br>')+'</div>';
  h+='<p><button class="btn-ghost" id="aCtx">查看区位与交通</button></p>';
  h+='<h3>战役概况</h3>'+G.battle.map(function(t){return'<p class="text" style="text-indent:2em">'+esc(t)+'</p>'}).join('')+srcHtml(G.battleSources);
  h+='<h3>关于本作品</h3><p>'+esc(G.about.work)+'</p>';
  if(G.about.team&&!/[【】]/.test(G.about.team))h+='<p style="font-size:13px">'+esc(G.about.team)+'</p>';
  h+='<h3>素材与 AI 使用声明</h3><p style="font-size:13px">'+esc(G.about.ai)+'</p>';
  var photos=G.points.filter(function(p){return p.imageCredit});if(photos.length){h+='<h3>实景图片署名</h3>';photos.forEach(function(p){var c=p.imageCredit;h+='<p class="src">'+esc(p.name)+'：'+esc(c.author)+' / <a href="'+esc(c.licenseUrl)+'" target="_blank" rel="noopener">'+esc(c.license)+'</a> / <a href="'+esc(c.source)+'" target="_blank" rel="noopener">Wikimedia Commons</a>。'+esc(c.changes)+'</p>'})}
  openPanel('关于',h);$('#aCtx').onclick=showContext;
}
$('#btnLocate').onclick=showContext;
$('#btnHelp').onclick=function(){$('#intro').classList.remove('hidden')};
$('#introSub').textContent=G.site.name+' · '+G.site.addressShort;
$('#introStart').onclick=function(){$('#intro').classList.add('hidden');ensureCtx();toast('点击地图上的红色点位开始')};
$('#introTour').onclick=function(){$('#intro').classList.add('hidden');startTour()};
window.__guide={openPoint:openPoint,startTour:startTour,showContext:showContext,stampPanel:stampPanel,quizPanel:quizPanel,routePanel:routePanel};
})();
