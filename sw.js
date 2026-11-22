const CACHE='menglianggu-guide-17d75f748ff8f0fc';
const ASSETS=["audio/bridge.mp3", "audio/bridge.srt", "audio/bullet-rock.mp3", "audio/bullet-rock.srt", "audio/field-command.mp3", "audio/field-command.srt", "audio/hall.mp3", "audio/hall.srt", "audio/intro.mp3", "audio/intro.srt", "audio/monument.mp3", "audio/monument.srt", "audio/outro.mp3", "audio/outro.srt", "audio/shell-rock.mp3", "audio/shell-rock.srt", "audio/trench.mp3", "audio/trench.srt", "audio/zhang-site.mp3", "audio/zhang-site.srt", "content/data.js", "content/module-credits.js", "css/atlas.css", "css/epic.css", "css/integration.css", "css/monument.svg", "css/mountains.svg", "css/style.css", "img/bridge.jpg", "img/bullet-rock.jpg", "img/field-command.jpg", "img/hall.jpg", "img/monument.jpg", "img/shell-rock.jpg", "img/trench.jpg", "img/zhang-site.jpg", "index.html", "js/app.js", "js/shell.js", "narrator/adapter.js", "narrator/index.html", "narrator/player.css", "narrator/player.js", "scene/app.js", "scene/audio/battle.mp3", "scene/audio/bayonets.mp3", "scene/audio/intro.mp3", "scene/audio/outro.mp3", "scene/audio/people.mp3", "scene/audio/plaque.mp3", "scene/audio/zhang.mp3", "scene/img/memorial-hall-2024.jpg", "scene/img/monument-2014.jpg", "scene/img/monument-2024.jpg", "scene/img/pines.webp", "scene/img/sky.jpg", "scene/img/tex-ground-n.jpg", "scene/img/tex-ground.jpg", "scene/img/tex-hedge.jpg", "scene/img/tex-monument-n.jpg", "scene/img/tex-monument.jpg", "scene/img/tex-paving-n.jpg", "scene/img/tex-paving.jpg", "scene/img/tex-plaque.jpg", "scene/img/tex-rock-n.jpg", "scene/img/tex-rock.jpg", "scene/img/tex-zhang-inscription.jpg", "scene/img/undergrowth.webp", "scene/img/zhang-site-2014.jpg", "scene/index.html", "scene/panorama-module.js", "scene/style.css", "terrain/adapter.js", "terrain/assets/elevation.i16", "terrain/assets/elevation.json", "terrain/index.html", "terrain/terrain.css", "terrain/terrain.js", "terrain/terrain.js.LEGAL.txt", "vendor/fonts/LICENSE", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/layers.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-shadow.png", "vendor/leaflet/leaflet.css", "vendor/leaflet/leaflet.js", "video/narrator/bridge.jpg", "video/narrator/bridge.mp4", "video/narrator/bullet-rock.jpg", "video/narrator/bullet-rock.mp4", "video/narrator/field-command.jpg", "video/narrator/field-command.mp4", "video/narrator/hall.jpg", "video/narrator/hall.mp4", "video/narrator/idle.jpg", "video/narrator/intro.jpg", "video/narrator/intro.mp4", "video/narrator/monument.jpg", "video/narrator/monument.mp4", "video/narrator/outro.jpg", "video/narrator/outro.mp4", "video/narrator/shell-rock.jpg", "video/narrator/shell-rock.mp4", "video/narrator/trench.jpg", "video/narrator/trench.mp4", "video/narrator/zhang-site.jpg", "video/narrator/zhang-site.mp4"];
async function ranged(response,range){
 if(!range||response.status!==200)return response;
 const m=/^bytes=(\d*)-(\d*)$/.exec(range);
 if(!m||(!m[1]&&!m[2]))return response;
 const data=await response.arrayBuffer(),size=data.byteLength;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]&&m[2]?Math.min(Number(m[2]),size-1):size-1;
 if(start>end||start>=size||(!m[1]&&Number(m[2])===0))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
 return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':response.headers.get('Content-Type')||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+size}});
}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./',...ASSETS].map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('menglianggu-guide-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(event.request,{ignoreSearch:true});
  const range=event.request.headers.get('range'),media=/\.(mp3|mp4)$/.test(url.pathname);
  if(cached)return media?ranged(cached,range):cached;
  if(url.pathname.endsWith('.mp4')){
   const headers=new Headers(event.request.headers);headers.delete('range');headers.delete('if-range');
   const response=await fetch(new Request(event.request,{headers,cache:'reload'}));
   if(response.status===200)await cache.put(url.href,response.clone());
   return ranged(response,range);
  }
  const response=await fetch(event.request);
  if(response.ok&&url.pathname.endsWith('.woff2'))await cache.put(event.request,response.clone());
  return response;
 }));
});
