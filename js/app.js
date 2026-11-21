(function(){
'use strict';
var G=window.GUIDE, $=function(s){return document.querySelector(s)};
var LS_KEY='mlg_stamps_v1';
var storageUnavailable=false;
var stamps=loadStamps();
function loadStamps(){try{var value=JSON.parse(localStorage.getItem(LS_KEY)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch(e){storageUnavailable=true;return {}}}
function save(){try{localStorage.setItem(LS_KEY,JSON.stringify(stamps))}catch(e){toast('浏览器无法保存进度，当前页面仍可继续使用')}}
function toast(t){$('#announcer').textContent=t;var d=document.createElement('div');d.className='toast';d.textContent=t;d.setAttribute('aria-hidden','true');document.body.appendChild(d);setTimeout(function(){d.style.opacity=0},1800);setTimeout(function(){d.remove()},2300)}
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
function refreshIcons(){G.points.forEach(function(p){markers[p.id].setIcon(icon(p));var el=markers[p.id].getElement();if(!el)return;el.setAttribute('aria-label',p.no+' '+p.name+(stamps[p.id]?'，已集章':''));el.onkeydown=function(e){if(e.key===' '){e.preventDefault();openPoint(p.id)}}})}
function layoutMarkerAnchors(anchors,size,obstacles){
  var used=[],steps=[];
  for(var dx=-7;dx<=7;dx++)for(var dy=-7;dy<=7;dy++)steps.push([dx*46,dy*46]);
  steps.sort(function(a,b){return a[0]*a[0]+a[1]*a[1]*1.15-b[0]*b[0]-b[1]*b[1]*1.15});
  return anchors.map(function(a){
    // A pin extends above its geographic tip: include partially visible pins,
    // but do not pull fully offscreen points into a panned view.
    if(a.x< -22||a.x>size.x+22||a.y< -4||a.y>size.y+38)return[0,0];
    var chosen=[Math.max(22,Math.min(size.x-22,a.x)),Math.max(42,Math.min(size.y-10,a.y))];
    for(var i=0;i<steps.length;i++){
      var x=Math.max(22,Math.min(size.x-22,a.x+steps[i][0])),y=Math.max(42,Math.min(size.y-10,a.y+steps[i][1]));
      if(used.some(function(b){return Math.hypot(x-b[0],y-b[1])<44}))continue;
      if(obstacles.some(function(b){return x+20>b.left&&x-20<b.right&&y+4>b.top&&y-38<b.bottom}))continue;
      chosen=[x,y];break;
    }
    used.push(chosen);return[chosen[0]-a.x,chosen[1]-a.y];
  });
}
function separateMarkers(){
  var rect=map.getContainer().getBoundingClientRect(),controls=Array.from(map.getContainer().querySelectorAll('.leaflet-control')),caption=document.querySelector('.map-frame>span');
  if(caption)controls.push(caption);
  var obstacles=controls.map(function(el){var b=el.getBoundingClientRect();return{left:b.left-rect.left-3,right:b.right-rect.left+3,top:b.top-rect.top-3,bottom:b.bottom-rect.top+3,width:b.width,height:b.height}}).filter(function(b){return b.width&&b.height});
  var offsets=layoutMarkerAnchors(G.points.map(function(p){return map.latLngToContainerPoint(P(p))}),map.getSize(),obstacles);
  G.points.forEach(function(p,i){markerOffsets[p.id]=offsets[i]});refreshIcons();
}
map.on('zoomend moveend resize',separateMarkers);
var bounds=L.latLngBounds(G.points.map(P));
var mountainBounds=L.latLngBounds(G.points.filter(function(p){return p.id!=='hall'}).map(P));
function mapPadding(){var size=map.getSize();return[Math.min(50,size.x*.12),Math.min(50,size.y*.18)]}
function home(){map.fitBounds(mountainBounds,{padding:mapPadding(),maxZoom:16})}
home();
separateMarkers();
var hallControl=L.control({position:'bottomleft'});
hallControl.onAdd=function(){var b=L.DomUtil.create('button','btn-ghost');b.id='hallShortcut';b.type='button';b.textContent='1 山下纪念馆';b.title='前往山下纪念馆；相邻点标记为方便点击作轻微错位';L.DomEvent.disableClickPropagation(b);b.onclick=function(){openPoint('hall')};return b};hallControl.addTo(map);

/* route */
var R=G.route,rp=R.order.map(function(id){return P(byId(id))});
R.legs.forEach(function(l){var a=P(byId(l.from)),b=P(byId(l.to)),transport=l.time==='乘车/景区交通';L.polyline([a,b],{color:transport?'#586268':'#b71c1c',weight:transport?2:5,opacity:.85,dashArray:transport?'3 8':'10 8',className:transport?'transport-line':'walk-line'}).addTo(routeLayer);L.marker([(a[0]+b[0])/2,(a[1]+b[1])/2],{interactive:false,keyboard:false,icon:L.divIcon({className:'',html:'<span class="leg-label'+(transport?' transport-label':'')+'">'+esc(l.time)+'</span>',iconSize:null})}).addTo(routeLayer)});
routeLayer.addTo(map);
function updateMapLabels(){map.getContainer().classList.toggle('detail-labels',map.getZoom()>=17)}
map.on('zoomend',updateMapLabels);updateMapLabels();
var overview=L.control({position:'topright'});
overview.onAdd=function(){var b=L.DomUtil.create('button','btn-ghost');b.type='button';b.textContent='全区概览';L.DomEvent.disableClickPropagation(b);b.onclick=function(){map.fitBounds(bounds,{padding:mapPadding()})};return b};overview.addTo(map);
/* context */
var site=P(G.site);
(G.context||[]).forEach(function(c){var ll=P(c);L.marker(ll,{icon:L.divIcon({className:'',html:'<span class="city">'+esc(c.name)+'</span>',iconSize:null})}).addTo(ctxLayer).bindPopup('<b>'+esc(c.name)+'</b><br>'+esc(c.desc));L.polyline([site,ll],{color:'#37474f',weight:2,dashArray:'4 6'}).addTo(ctxLayer)});
L.circleMarker(site,{radius:9,color:'#fff',weight:3,fillColor:'#b71c1c',fillOpacity:1}).addTo(ctxLayer).bindPopup('<b>'+esc(G.site.name)+'</b><br>'+esc(G.site.address));
function byId(id){for(var i=0;i<G.points.length;i++)if(G.points[i].id===id)return G.points[i]}
function showContext(){closeAll();ctxLayer.addTo(map);var b=L.latLngBounds([site].concat((G.context||[]).map(P)));map.fitBounds(b,{padding:[40,40]});openPanel('区位与交通',contextHtml())}
function contextHtml(){var h='<p><b>'+esc(G.site.name)+'</b><br>'+esc(G.site.address)+'</p><p>'+esc(G.site.location)+'</p>';(G.context||[]).forEach(function(c){h+='<div class="leg"><div class="no">●</div><div><b>'+esc(c.name)+'</b><br><small>'+esc(c.desc)+'</small></div></div>'});h+=srcHtml(G.site.sources);h+='<p><button class="btn-ghost" id="ctxBack">返回景区导览</button></p>';return h}

/* ---------- audio + digital human ---------- */
var video=$('#avatar'),fallbackAudio=new Audio(),audio=video,cues=[],raf,onEnd=null,playingId=null,lastSpeech=null,subtitleRequest=null,speechVersion=0,wantPlay=false;
fallbackAudio.preload='none';
var bubble=$('#bubble'),guide=$('#guide');
function parseSrt(t){var out=[];t.replace(/\r/g,'').split(/\n\n+/).forEach(function(b){var m=b.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\n([\s\S]*)/);if(m){var s=+m[1]*3600+ +m[2]*60+ +m[3]+ +m[4]/1000,e=+m[5]*3600+ +m[6]*60+ +m[7]+ +m[8]/1000;out.push({s:s,e:e,t:m[9].trim()})}});return out}
function loop(){
  var t=audio.currentTime,c='';for(var j=0;j<cues.length;j++){if(t>=cues[j].s&&t<=cues[j].e+0.3){c=cues[j].t;break}}
  if(c&&bubble.textContent!==c)bubble.textContent=c;
  if(!audio.paused&&!document.hidden)raf=requestAnimationFrame(loop);
}
function speak(id,fallbackText,cb){
  lastSpeech={id:id,text:fallbackText};
  stopSpeak(true);playingId=id;onEnd=cb||null;guide.classList.remove('hidden');map.invalidateSize({pan:false});bubble.textContent=fallbackText?fallbackText.slice(0,40)+'…':'';$('#gPause').textContent='暂停';
  var version=speechVersion;subtitleRequest=window.AbortController?new AbortController():null;
  function missingCaptions(){if(playingId===id&&speechVersion===version)toast('字幕暂不可用，可阅读点位正文或关于页讲解全文')}
  fetch('audio/'+id+'.srt',subtitleRequest?{signal:subtitleRequest.signal}:{}).then(function(r){return r.ok?r.text():''}).then(function(t){if(playingId===id&&speechVersion===version){cues=parseSrt(t);if(!cues.length)missingCaptions()}}).catch(missingCaptions);
  audio=video;video.src='video/narrator/'+id+'.mp4';video.hidden=false;
  playAudio();
  cancelAnimationFrame(raf);loop();
}
function clearMedia(media){media.pause();media.removeAttribute('src');media.load()}
function showStill(){video.hidden=true;guide.classList.remove('video-playing')}
function stopSpeak(keep){onEnd=null;playingId=null;wantPlay=false;cues=[];bubble.textContent='';speechVersion++;cancelAnimationFrame(raf);clearMedia(video);clearMedia(fallbackAudio);showStill();if(subtitleRequest){subtitleRequest.abort();subtitleRequest=null}if(!keep){guide.classList.add('hidden');map.invalidateSize({pan:false})}}
function useAudioFallback(){
  if(audio!==video||!playingId)return;
  var position=video.currentTime||0,version=speechVersion;
  audio=fallbackAudio;clearMedia(video);showStill();
  fallbackAudio.src='audio/'+playingId+'.mp3';
  fallbackAudio.onloadedmetadata=function(){if(speechVersion===version&&audio===fallbackAudio&&position>0)fallbackAudio.currentTime=Math.min(position,fallbackAudio.duration||position)};
  $('#announcer').textContent='数字人视频暂不可用，已切换语音讲解';
  if(wantPlay)playAudio();
}
function playAudio(){
  var media=audio,version=speechVersion;wantPlay=true;
  function failed(e){if(version!==speechVersion||media!==audio||!playingId||e.name==='AbortError')return;if(media===video&&e.name==='NotSupportedError'){useAudioFallback();return}wantPlay=false;toast('播放受限或网络异常，请点击重试');$('#gPause').textContent='重试'}
  try{var result=media.play();if(result&&result.catch)result.catch(failed)}catch(e){failed(e)}
}
[video,fallbackAudio].forEach(function(media){
  media.addEventListener('playing',function(){if(media!==audio||!playingId)return;cancelAnimationFrame(raf);wantPlay=true;guide.classList.toggle('video-playing',media===video);$('#gPause').textContent='暂停';if($('#announcer').textContent==='讲解正在缓冲，请稍候')$('#announcer').textContent='讲解正在播放';loop()});
  media.addEventListener('pause',function(){if(media===audio)cancelAnimationFrame(raf)});
  media.addEventListener('waiting',function(){if(media!==audio||!playingId)return;cancelAnimationFrame(raf);$('#announcer').textContent='讲解正在缓冲，请稍候'});
  media.addEventListener('error',function(){if(media!==audio||!playingId||!media.error)return;if(media===video){useAudioFallback();return}cancelAnimationFrame(raf);wantPlay=false;$('#gPause').textContent='重试';toast('音频暂不可用，可点击重试或阅读点位全文')});
  media.addEventListener('ended',function(){if(media!==audio||!playingId||!media.ended)return;var f=onEnd,id=playingId;onEnd=null;playingId=null;wantPlay=false;cancelAnimationFrame(raf);showStill();$('#gPause').textContent='重新讲解';clearMedia(video);clearMedia(fallbackAudio);if(byId(id))stamp(id,true);if(f)f(id);var status=$('#panelAudioStatus');if(status)status.textContent='讲解已完成，印章已保存'});
});
document.addEventListener('visibilitychange',function(){cancelAnimationFrame(raf);if(!document.hidden&&!audio.paused)loop()});
$('#gPause').onclick=function(){if(!playingId){speak(lastSpeech?lastSpeech.id:'intro',lastSpeech?lastSpeech.text:G.narration.intro);return}if(!wantPlay){if(audio.error)audio.load();playAudio();this.textContent='暂停'}else{wantPlay=false;audio.pause();this.textContent='继续'}};
$('#gStop').onclick=function(){stopTour();stopSpeak(false)};
var minimise=document.createElement('button');minimise.id='gMin';minimise.type='button';minimise.textContent='收起';minimise.onclick=function(){var small=guide.classList.toggle('minimized');map.invalidateSize({pan:false});minimise.textContent=small?'展开':'收起';minimise.setAttribute('aria-expanded',String(!small))};$('.guide-ctrl').appendChild(minimise);
window.addEventListener('guide:shell-ready',function(){window.GuideShell.registerModule('narrator',function(){closeAll();setTab('map');guide.classList.remove('hidden','minimized');minimise.textContent='收起';minimise.setAttribute('aria-expanded','true');if(!playingId){bubble.textContent=lastSpeech?lastSpeech.text:'我是AI数字人讲解员小崮。点击“开始讲解”，聆听孟良崮的红色记忆。';$('#gPause').textContent=lastSpeech?'重新讲解':'开始讲解'}map.invalidateSize({pan:false});requestAnimationFrame(function(){$('#gPause').focus()})})});

/* ---------- point sheet ---------- */
function srcHtml(s){if(!s||!s.length)return'';return'<div class="src">资料来源：'+s.map(function(x,i){return'['+(i+1)+'] <a href="'+esc(x.u)+'" target="_blank" rel="noopener">'+esc(x.t)+'</a>'}).join('；')+'</div>'}
function openPoint(id,opts){
  if(!opts||!opts.autoplay)stopTour();
  stopSpeak(false);setTab('map');
  var p=byId(id);current=id;refreshIcons();closePanel();
  map.flyTo(P(p),Math.max(map.getZoom(),16),{duration:.8});
  var h='<h2 id="pointTitle">'+p.no+'. '+esc(p.name)+'</h2><div class="meta">'+esc(p.type||'')+'</div>';
  h+='<div class="cover'+(p.img?' has-photo':'')+'">'+(p.img?'<img src="'+esc(p.img)+'" alt="'+esc(p.imgAlt||p.name)+'" onerror="this.parentNode.classList.remove(\'has-photo\');this.remove()">':'')+'<span style="position:relative">'+esc(p.tagline||G.site.name)+'</span></div>';
  if(p.imageCredit){var credit=p.imageCredit;h+='<div class="src photo-credit">图：'+esc(credit.author)+' / <a href="'+esc(credit.licenseUrl)+'" target="_blank" rel="noopener">'+esc(credit.license)+'</a> / 来源 <a href="'+esc(credit.source)+'" target="_blank" rel="noopener">Wikimedia Commons</a>（缩放压缩，封面裁切）</div>'}
  h+='<div class="actions"><button class="btn-primary" id="btnListen">▶ 听讲解（听完集章）</button><button class="btn-ghost" id="btnStamp">'+(stamps[id]?'✔ 已打卡':'现场定位打卡')+'</button></div>';
  if(!stamps[id])h+='<p><button class="btn-ghost" id="btnRemote">非现场打卡（听完本点讲解）</button></p>';
  p.text.split(/\n+/).forEach(function(t){h+='<p class="text">'+esc(t)+'</p>'});
  if(p.facts&&p.facts.length)h+='<div class="facts">'+p.facts.map(esc).join('<br>')+'</div>';
  h+=srcHtml(p.sources);
  var nx=nextOf(id);if(nx)h+='<p><button class="btn-ghost" id="btnNext">下一站：'+esc(nx.name)+' →</button></p>';
  $('#sheetBody').innerHTML=h;$('#sheet').classList.remove('hidden');$('#sheet').scrollTop=0;guide.classList.add('with-sheet');
  $('#btnListen').onclick=function(){speak(id,p.text,function(){if(touring)tourTimer=setTimeout(tourNext,1200)})};
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
function openPanel(t,h){stopTour();guide.classList.add('hidden');map.invalidateSize({pan:false});if(playingId&&!audio.paused)h='<p id="panelAudioStatus">AI合成语音 · 正在讲解：'+esc(byId(playingId)?byId(playingId).name:G.site.name)+' <button class="btn-ghost" id="panelAudioStop">停止讲解</button></p>'+h;$('#panelTitle').textContent=t;$('#panelBody').innerHTML=h;$('#panel').classList.remove('hidden');$('#panel').scrollTop=0;var b=$('#ctxBack');if(b)b.onclick=function(){closePanel();setTab('map')};var stop=$('#panelAudioStop');if(stop)stop.onclick=function(){stopSpeak(false);$('#panelAudioStatus').textContent='讲解已停止；听完本点讲解可集章'}}
function closePanel(){$('#panel').classList.add('hidden');if(playingId)guide.classList.remove('hidden');map.invalidateSize({pan:false});if(map.hasLayer(ctxLayer)){map.removeLayer(ctxLayer);home()}}
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
function startTour(){closeAll();touring=true;tourIdx=0;speak('intro',G.narration.intro,function(){if(touring)tourNext()});map.flyToBounds(bounds,{padding:mapPadding()})}
function tourNext(){if(!touring)return;if(tourIdx>=R.order.length){touring=false;closeSheet();home();speak('outro',G.narration.outro,function(){stopSpeak(false);stampPanel();setTab('stamps')});return}openPoint(R.order[tourIdx++],{autoplay:true})}

function stampPanel(){
  var n=G.points.filter(function(p){return stamps[p.id]}).length,tot=G.points.length;
  var h='<p>非现场可进入点位，选择“非现场打卡”，听完本点讲解即可获得印章；现场也可在300米内定位打卡。集齐全部印章并通过知识问答，可生成“红色研学证书”。</p>';
  h+='<div class="progress"><div style="width:'+(100*n/tot)+'%"></div></div><p style="text-align:center">已集 '+n+' / '+tot+' 枚'+(stamps.__quiz?' · 知识问答已通过':'')+'</p><div class="stamps">';
  G.points.forEach(function(p){h+='<button type="button" class="stamp'+(stamps[p.id]?' on':'')+'" aria-label="'+esc(p.name)+(stamps[p.id]?'，已集章':'，未集章')+'" data-id="'+p.id+'"><b aria-hidden="true">★</b>'+esc(p.short||p.name)+'</button>'});
  h+='<button type="button" class="stamp'+(stamps.__quiz?' on':'')+'" data-q="1" aria-label="知识问答'+(stamps.__quiz?'，已通过':'，未通过')+'"><b aria-hidden="true">✎</b>知识问答</button></div>';
  if(n===tot&&stamps.__quiz){h+='<h3>领取红色研学证书</h3><label for="certName">证书姓名（最多12字）</label><input class="name" id="certName" autocomplete="name" placeholder="请输入你的姓名" maxlength="12"><button class="btn-primary" id="btnCert">生成证书</button><div id="certBox" aria-live="polite"></div>'}
  else h+='<p style="color:#7a6a5f;font-size:13px">还差：'+G.points.filter(function(p){return!stamps[p.id]}).map(function(p){return p.short||p.name}).concat(stamps.__quiz?[]:['知识问答']).join('、')+'</p>';
  h+='<p><button class="btn-ghost" id="btnReset" style="font-size:12px;padding:4px 10px">重置打卡记录</button></p>';
  openPanel('研学打卡 · 集章',h);
  document.querySelectorAll('.stamp[data-id]').forEach(function(s){s.onclick=function(){openPoint(s.dataset.id)}});
  var q=document.querySelector('.stamp[data-q]');q.onclick=function(){setTab('quiz');quizPanel()};
  $('#btnReset').onclick=function(){if(confirm('确定清空打卡记录？')){stamps={};quizState=null;try{localStorage.removeItem('mlg_quiz_session_v1')}catch(e){}save();refreshIcons();stampPanel()}};
  var bc=$('#btnCert');if(bc)bc.onclick=function(){var name=$('#certName').value.trim();if(!name){toast('请先填写姓名');$('#certName').focus();return}drawCert(name)};
}
async function drawCert(name){
  try{if(window.FontFace&&document.fonts){if(!window.certificateFont){window.certificateFont=new FontFace('GuideCJK','url(vendor/fonts/certificate.woff2)');document.fonts.add(window.certificateFont)}await window.certificateFont.load();await document.fonts.load('30px GuideCJK')}}catch(e){}
  var c=document.createElement('canvas');c.width=1000;c.height=700;c.className='cert';var x=c.getContext('2d');
  x.fillStyle='#fbf7ef';x.fillRect(0,0,1000,700);x.strokeStyle='#b71c1c';x.lineWidth=14;x.strokeRect(24,24,952,652);x.lineWidth=2;x.strokeStyle='#e6b450';x.strokeRect(44,44,912,612);
  x.fillStyle='#b71c1c';x.textAlign='center';x.font='bold 56px GuideCJK,sans-serif';x.fillText('红色研学证书',500,150);
  x.fillStyle='#2a1f1a';x.font='30px GuideCJK,sans-serif';x.fillText(name+' 同学：',500,240);
  x.font='26px GuideCJK,sans-serif';['你已通过“崮上丰碑”数字导览，','完成孟良崮战役纪念地全部 '+G.points.length+' 个点位的研学打卡','并通过红色知识问答。','传承红色基因，赓续沂蒙精神！'].forEach(function(t,i){x.fillText(t,500,310+i*48)});
  x.font='22px GuideCJK,sans-serif';x.fillText(new Date().toLocaleDateString('zh-CN'),760,600);x.fillText('崮上丰碑 · 数字导览',760,565);
  x.save();x.translate(250,560);x.rotate(-.15);x.strokeStyle='#d32f2f';x.lineWidth=5;x.beginPath();x.arc(0,0,70,0,2*PI);x.stroke();x.fillStyle='#d32f2f';x.font='bold 22px GuideCJK,sans-serif';x.fillText('孟良崮',0,-12);x.fillText('研学打卡',0,20);x.font='30px GuideCJK,sans-serif';x.fillText('★',0,52);x.restore();
  var box=$('#certBox');box.innerHTML='';var summary=document.createElement('p');summary.textContent=name+'同学已完成全部'+G.points.length+'点研学打卡并通过知识问答。此证书为学习体验凭证，非官方认证。';box.appendChild(summary);c.setAttribute('role','img');c.setAttribute('aria-label',summary.textContent);box.appendChild(c);var a=document.createElement('a');a.href=c.toDataURL('image/png');a.download='红色研学证书.png';a.textContent='保存证书图片';a.className='btn-ghost';a.style.display='inline-block';a.style.marginTop='8px';box.appendChild(a);
}

var quizState=null;
function saveQuiz(){try{localStorage.setItem('mlg_quiz_session_v1',JSON.stringify(quizState))}catch(e){}}
function newQuiz(){quizState=null;try{localStorage.removeItem('mlg_quiz_session_v1')}catch(e){}quizPanel()}
function quizPanel(){
  if(!quizState){try{var saved=JSON.parse(localStorage.getItem('mlg_quiz_session_v1')||'null');if(saved&&Array.isArray(saved.ids)&&saved.ids.length===Math.min(5,G.quiz.length)&&Array.isArray(saved.answers)&&saved.answers.length===saved.ids.length&&saved.ids.every(function(id,i){return Number.isInteger(id)&&id>=0&&id<G.quiz.length&&saved.ids.indexOf(id)===i})&&saved.answers.every(function(a){return Number.isInteger(a)&&a>=-1&&a<4}))quizState=saved}catch(e){}}
  if(!quizState){quizState={ids:G.quiz.map(function(q,i){return i}).sort(function(){return Math.random()-.5}).slice(0,Math.min(5,G.quiz.length)),answers:[]};quizState.answers=quizState.ids.map(function(){return -1});saveQuiz()}
  var qs=quizState.ids.map(function(id){return G.quiz[id]}),ans=0,right=0;
  var h='<p>随机抽取 '+qs.length+' 题，答对 '+Math.ceil(qs.length*0.6)+' 题及以上即获得“知识问答”印章。</p>';
  qs.forEach(function(q,i){h+='<div class="q" data-i="'+i+'"><b>'+(i+1)+'. '+esc(q.q)+'</b>'+q.opts.map(function(o,j){return'<button class="opt" data-j="'+j+'">'+'ABCD'[j]+'. '+esc(o)+'</button>'}).join('')+'<div class="exp hidden" aria-live="polite"></div></div>'});
  h+='<div id="quizRes" role="status"></div>';
  openPanel('红色知识问答',h);
  document.querySelectorAll('.q').forEach(function(d){var q=qs[+d.dataset.i],done=false;d.querySelectorAll('.opt').forEach(function(b){b.onclick=function(){if(done)return;done=true;ans++;var j=+b.dataset.j;quizState.answers[+d.dataset.i]=j;saveQuiz();if(j===q.a){b.classList.add('right');right++}else{b.classList.add('wrong');d.querySelectorAll('.opt')[q.a].classList.add('right')}var e=d.querySelector('.exp');e.textContent=(j===q.a?'回答正确。':'回答错误，正确答案是'+q.opts[q.a]+'。')+'解析：'+q.exp;e.classList.remove('hidden');
    if(ans===qs.length){var pass=right>=Math.ceil(qs.length*0.6);if(pass&&!stamps.__quiz){stamps.__quiz=Date.now();save()}$('#quizRes').innerHTML='<div class="facts">得分 '+right+' / '+qs.length+'。'+(pass?'恭喜通过，获得“知识问答”印章！':'再接再厉，可以再试一次。')+'</div><p><button class="btn-primary" id="qAgain">再来一组</button> <button class="btn-ghost" id="qStamp">查看集章</button></p>';$('#qAgain').onclick=newQuiz;$('#qStamp').onclick=function(){setTab('stamps');stampPanel()};$('#quizRes').scrollIntoView({behavior:'smooth'})}}})});
  document.querySelectorAll('.q').forEach(function(d){var answer=quizState.answers[+d.dataset.i];if(answer>=0)d.querySelectorAll('.opt')[answer].click()});
}
function aboutPanel(){
  var S=G.site,h='<h3 style="color:#b71c1c;margin-top:0">'+esc(S.name)+'</h3><p>'+esc(S.intro)+'</p>';
  if(S.facts)h+='<div class="facts">'+S.facts.map(esc).join('<br>')+'</div>';
  h+='<p><button class="btn-ghost" id="aCtx">查看区位与交通</button></p>';
  h+='<h3>战役概况</h3>'+G.battle.map(function(t){return'<p class="text" style="text-indent:2em">'+esc(t)+'</p>'}).join('')+srcHtml(G.battleSources);
  h+='<h3>关于本作品</h3><p>'+esc(G.about.work)+'</p><details><summary>开场与结束讲解全文</summary><p>'+esc(G.narration.intro)+'</p><p>'+esc(G.narration.outro)+'</p></details>';
  if(G.about.team&&!/[【】]/.test(G.about.team))h+='<p style="font-size:13px">'+esc(G.about.team)+'</p>';
  h+='<h3>素材与 AI 使用声明</h3><p style="font-size:13px">'+esc(G.about.ai)+'</p>';
  var photos=G.points.filter(function(p){return p.imageCredit});if(photos.length){h+='<h3>实景图片署名</h3>';photos.forEach(function(p){var c=p.imageCredit;h+='<p class="src">'+esc(p.name)+'：'+esc(c.author)+' / <a href="'+esc(c.licenseUrl)+'" target="_blank" rel="noopener">'+esc(c.license)+'</a> / <a href="'+esc(c.source)+'" target="_blank" rel="noopener">Wikimedia Commons</a>。'+esc(c.changes)+'</p>'})}
  openPanel('关于',h);$('#aCtx').onclick=showContext;
}
$('#btnLocate').onclick=showContext;
$('#btnHelp').onclick=function(){$('#intro').classList.remove('hidden')};
$('#introSub').textContent=G.site.name+' · '+G.site.addressShort;
$('#introStart').onclick=function(){$('#intro').classList.add('hidden');toast('点击地图上的红色点位开始')};
$('#introTour').onclick=function(){$('#intro').classList.add('hidden');startTour()};
window.__guide={openPoint:openPoint,startTour:startTour,showContext:showContext,stampPanel:stampPanel,quizPanel:quizPanel,routePanel:routePanel};
var announcer=document.createElement('div');announcer.id='announcer';announcer.className='sr-only';announcer.setAttribute('role','status');announcer.setAttribute('aria-live','polite');document.body.appendChild(announcer);
var dialogs=[$('#intro'),$('#sheet'),$('#panel')],activeDialog=null,returnFocus=null,disabledFocus=[];
dialogs.forEach(function(d,i){d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-labelledby',['introTitle','pointTitle','panelTitle'][i]);d.tabIndex=-1});
function focusable(root){return Array.prototype.filter.call(root.querySelectorAll('button,a[href],area[href],input,select,textarea,summary,audio[controls],video[controls],iframe,object,embed,[contenteditable],[tabindex]'),function(e){return (e.tabIndex>=0||(e.isContentEditable&&!e.hasAttribute('tabindex')))&&!e.disabled&&!e.matches(':disabled')&&e.getClientRects().length})}
function syncDialog(){
  var next=dialogs.filter(function(d){return !d.classList.contains('hidden')})[0]||null;
  if(next===activeDialog)return;
  disabledFocus.forEach(function(item){if(item[1]===null)item[0].removeAttribute('tabindex');else item[0].setAttribute('tabindex',item[1])});disabledFocus=[];
  Array.prototype.forEach.call(document.body.children,function(e){if(e.getAttribute('data-modal-hidden')==='1'){e.removeAttribute('aria-hidden');e.removeAttribute('data-modal-hidden')}});
  if(next){
    if(!activeDialog)returnFocus=document.activeElement;activeDialog=next;(focusable(next)[0]||next).focus();
    Array.prototype.forEach.call(document.body.children,function(e){if(e!==next&&e.id!=='announcer'&&e.id!=='guide'&&e.tagName!=='SCRIPT'&&!e.classList.contains('toast')){e.setAttribute('aria-hidden','true');e.setAttribute('data-modal-hidden','1');focusable(e).forEach(function(f){disabledFocus.push([f,f.getAttribute('tabindex')]);f.tabIndex=-1})}});
  }else{
    activeDialog=null;if(returnFocus&&returnFocus!==document.body&&returnFocus.getClientRects().length&&document.documentElement.contains(returnFocus))returnFocus.focus();else $('#hallShortcut').focus();returnFocus=null;
  }
}
var dialogObserver=new MutationObserver(syncDialog);dialogs.forEach(function(d){dialogObserver.observe(d,{attributes:true,attributeFilter:['class']})});
document.addEventListener('keydown',function(e){if(!activeDialog)return;if(e.key==='Escape'){e.preventDefault();if(activeDialog.id==='intro')$('#introStart').click();else if(activeDialog.id==='sheet')$('#sheetClose').click();else $('#panelClose').click();return}if(e.key==='Tab'){var list=focusable(activeDialog);if(activeDialog.id==='sheet'&&!guide.classList.contains('hidden'))list=list.concat(focusable(guide));var index=list.indexOf(document.activeElement);if(!list.length){e.preventDefault();activeDialog.focus()}else if(e.shiftKey&&index<=0){e.preventDefault();list[list.length-1].focus()}else if(!e.shiftKey&&(index===list.length-1||index<0)){e.preventDefault();list[0].focus()}}});
document.addEventListener('focusin',function(e){if(activeDialog&&!activeDialog.contains(e.target)&&!(activeDialog.id==='sheet'&&guide.contains(e.target)))(focusable(activeDialog)[0]||activeDialog).focus()});
syncDialog();
var network=document.createElement('button');network.id='networkStatus';network.className='network-status';network.onclick=routePanel;document.body.appendChild(network);
function networkState(){network.hidden=navigator.onLine;network.textContent='离线：点此查看点位与文字导览（地图需联网）';announcer.textContent=navigator.onLine?'网络已连接':'当前离线，可使用已缓存图文和讲解'}
window.addEventListener('online',networkState);window.addEventListener('offline',networkState);networkState();
if(storageUnavailable)toast('浏览器存储不可用或进度损坏，当前页面仍可继续使用');
if('serviceWorker' in navigator)window.addEventListener('load',function(){navigator.serviceWorker.register('sw.js',{scope:'./',updateViaCache:'none'}).then(function(reg){return navigator.serviceWorker.ready}).then(function(){announcer.textContent='离线导览已就绪，图文与讲解已缓存'}).catch(function(){announcer.textContent='离线缓存暂不可用，请保持联网使用'})});
})();
