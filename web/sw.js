const CACHE='menglianggu-guide-663b7fd8b21066bf';
const ASSETS=[".nojekyll", "audio/bridge.mp3", "audio/bridge.srt", "audio/bullet-rock.mp3", "audio/bullet-rock.srt", "audio/field-command.mp3", "audio/field-command.srt", "audio/hall.mp3", "audio/hall.srt", "audio/intro.mp3", "audio/intro.srt", "audio/monument.mp3", "audio/monument.srt", "audio/outro.mp3", "audio/outro.srt", "audio/shell-rock.mp3", "audio/shell-rock.srt", "audio/trench.mp3", "audio/trench.srt", "audio/zhang-site.mp3", "audio/zhang-site.srt", "content/data.js", "css/atlas.css", "css/epic.css", "css/monument.svg", "css/mountains.svg", "css/narrator.css", "css/style.css", "img/bridge.jpg", "img/bullet-rock.jpg", "img/field-command.jpg", "img/hall.jpg", "img/monument.jpg", "img/shell-rock.jpg", "img/trench.jpg", "img/zhang-site.jpg", "index.html", "js/app.js", "js/shell.js", "vendor/fonts/LICENSE", "vendor/leaflet/images/layers-2x.png", "vendor/leaflet/images/layers.png", "vendor/leaflet/images/marker-icon-2x.png", "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-shadow.png", "vendor/leaflet/leaflet.css", "vendor/leaflet/leaflet.js", "video/narrator/idle.jpg"];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(['./',...ASSETS].map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('menglianggu-guide-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const cached=await cache.match(event.request,{ignoreSearch:true});
  if(cached){
   const range=event.request.headers.get('range');
   if(range&&url.pathname.endsWith('.mp3')){
    const data=await cached.arrayBuffer(),m=/bytes=(\d+)-(\d*)/.exec(range);
    if(m){const start=Number(m[1]),end=m[2]?Math.min(Number(m[2]),data.byteLength-1):data.byteLength-1;
     if(start> end)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+data.byteLength}});
     return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+data.byteLength}});
    }
   }
   return cached;
  }
  const response=await fetch(event.request);
  if(response.ok&&url.pathname.endsWith('.woff2'))await cache.put(event.request,response.clone());
  return response;
 }));
});
