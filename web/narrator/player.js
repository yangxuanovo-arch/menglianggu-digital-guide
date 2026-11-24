(function(){
  'use strict';
  var G=window.GUIDE,$=function(s){return document.getElementById(s)},video=$('video'),sound=new Audio(),media=video;
  function back(e){if(parent===window)return;if(e)e.preventDefault();active=false;clear(video);clear(sound);parent.postMessage({type:'guide:narrator-close'},location.origin)}
  $('back').addEventListener('click',back);
  addEventListener('keydown',function(e){
    if(e.key==='Escape'){if(parent!==window)back(e);else location.assign('../')}
    if(e.key==='Tab'&&parent!==window){var list=Array.prototype.filter.call(document.querySelectorAll('a[href],button,select,summary,[tabindex]'),function(el){return el.tabIndex>=0&&!el.disabled&&el.getClientRects().length}),i=list.indexOf(document.activeElement);if(e.shiftKey&&i<=0){e.preventDefault();list[list.length-1].focus()}else if(!e.shiftKey&&(i===list.length-1||i<0)){e.preventDefault();list[0].focus()}}
  });
  if(!G||!G.narration||!G.route||!Array.isArray(G.points)||!Array.isArray(G.route.order)){$('status').textContent='讲解资料暂不可用，请返回导览重试';['play','stop','prev','next','clip'].forEach(function(id){$(id).disabled=true});return}
  var clips=[{id:'intro',name:'开场 · 走进孟良崮',text:G.narration.intro}].concat(G.route.order.map(function(id){return G.points.filter(function(p){return p.id===id})[0]})).concat([{id:'outro',name:'结语 · 铭记历史',text:G.narration.outro}]);
  var version=0,request=null,cues=[],active=false,wantPlay=false,completed=false,index=0,raf=0;
  sound.preload='none';video.muted=false;sound.muted=false;
  clips.forEach(function(c){var option=document.createElement('option');option.value=c.id;option.textContent=c.name;$('clip').appendChild(option)});
  function clear(m){m.pause();m.removeAttribute('src');m.load()}
  function parse(text){var result=[];text.replace(/\r/g,'').split(/\n\n+/).forEach(function(b){var m=b.match(/(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)\n([\s\S]*)/);if(m)result.push({s:+m[1]*3600+ +m[2]*60+ +m[3]+ +m[4]/1000,e:+m[5]*3600+ +m[6]*60+ +m[7]+ +m[8]/1000,t:m[9].trim()})});return result}
  function tick(){cancelAnimationFrame(raf);if(!active)return;var t=media.currentTime,c='';cues.forEach(function(q){if(t>=q.s&&t<=q.e+.3)c=q.t});if(c&&$('subtitle').textContent!==c)$('subtitle').textContent=c;if(!media.paused&&!document.hidden)raf=requestAnimationFrame(tick)}
  function choose(id){
    version++;active=false;wantPlay=false;completed=false;cancelAnimationFrame(raf);clear(video);clear(sound);media=video;
    if(request)request.abort();request=window.AbortController?new AbortController():null;
    index=clips.map(function(c){return c.id}).indexOf(id);if(index<0)index=0;
    var c=clips[index],v=version;$('clip').value=c.id;video.poster='../video/narrator/'+c.id+'.jpg';
    $('transcript').textContent=c.text;$('subtitle').textContent='';$('status').textContent='点击“开始讲解”播放视频与声音';$('play').textContent='开始讲解';cues=[];
    $('prev').disabled=index===0;$('next').disabled=index===clips.length-1;
    function missing(){if(version===v)$('status').textContent='字幕暂不可用，可展开讲解全文'}
    fetch('../audio/'+c.id+'.srt',request?{signal:request.signal}:{}).then(function(r){return r.ok?r.text():''}).then(function(t){if(version!==v)return;cues=parse(t);if(!cues.length)missing()}).catch(function(e){if(e.name!=='AbortError')missing()});
  }
  function fallback(){
    if(media!==video||!active)return;
    var position=video.currentTime||0,v=version;media=sound;clear(video);sound.src='../audio/'+clips[index].id+'.mp3';
    sound.onloadedmetadata=function(){if(version===v&&media===sound&&position>0)sound.currentTime=Math.min(position,sound.duration||position)};
    $('status').textContent='视频暂不可用，已切换静态肖像与语音讲解';if(wantPlay)play();
  }
  function play(){
    var m=media,v=version;wantPlay=true;m.muted=false;
    function failed(e){if(v!==version||m!==media||!active||e.name==='AbortError')return;if(m===video&&e.name==='NotSupportedError'){fallback();return}wantPlay=false;$('play').textContent='重试';$('status').textContent=m===sound&&(m.error||e.name==='NotSupportedError')?'语音暂不可用，可展开讲解全文':'播放受限或网络异常，请点击重试'}
    try{var p=m.play();if(p&&p.catch)p.catch(failed)}catch(e){failed(e)}
  }
  $('play').onclick=function(){
    if(!active){if(completed)choose(clips[index].id);active=true;video.src='../video/narrator/'+clips[index].id+'.mp4';media=video;play()}
    else if(media.paused||!wantPlay){if(media.error)media.load();play()}
    else{wantPlay=false;media.pause()}
  };
  $('stop').onclick=function(){choose(clips[index].id)};
  $('clip').onchange=function(){choose(this.value)};
  $('prev').onclick=function(){if(index>0){choose(clips[index-1].id);$('play').click()}};
  $('next').onclick=function(){if(index<clips.length-1){choose(clips[index+1].id);$('play').click()}};
  function saveStandaloneStamp(id){
    if(!G.points.some(function(p){return p.id===id}))return;
    var stamps={};
    try{var value=JSON.parse(localStorage.getItem('mlg_stamps_v1')||'{}');if(value&&typeof value==='object'&&!Array.isArray(value))stamps=value}catch(e){}
    if(stamps[id])return;stamps[id]=Date.now();
    try{localStorage.setItem('mlg_stamps_v1',JSON.stringify(stamps))}catch(e){$('status').textContent='本段讲解已完成；浏览器无法保存进度，当前页面仍可继续使用'}
  }
  [video,sound].forEach(function(m){
    m.addEventListener('playing',function(){if(m!==media||!active)return;wantPlay=true;$('play').textContent='暂停';$('status').textContent=m===video?'AI合成语音 · 正在播放':'静态肖像 · AI语音正在播放';tick()});
    m.addEventListener('pause',function(){if(m!==media||!active)return;cancelAnimationFrame(raf);$('play').textContent='继续';$('status').textContent='讲解已暂停'});
    m.addEventListener('waiting',function(){if(m===media&&active)$('status').textContent='讲解正在缓冲，请稍候'});
    m.addEventListener('error',function(){if(m!==media||!active||!m.error)return;if(m===video){fallback();return}wantPlay=false;$('play').textContent='重试';$('status').textContent='语音暂不可用，可展开讲解全文'});
    m.addEventListener('ended',function(){if(m!==media||!active||!m.ended)return;active=false;wantPlay=false;completed=true;cancelAnimationFrame(raf);$('play').textContent='重新讲解';$('status').textContent='本段讲解已完成';if(parent!==window)parent.postMessage({type:'guide:narrator-complete',id:clips[index].id},location.origin);else saveStandaloneStamp(clips[index].id)});
  });
  document.addEventListener('visibilitychange',function(){cancelAnimationFrame(raf);if(!document.hidden)tick()});
  choose(new URLSearchParams(location.search).get('clip')||'intro');
})();
