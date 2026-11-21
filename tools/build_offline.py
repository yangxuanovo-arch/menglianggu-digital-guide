"""Regenerate the certificate subset and content-versioned offline worker."""
import hashlib
from pathlib import Path
import subprocess
import sys
import json

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'
SOURCE = Path.home() / '.local/share/fonts/NotoSansCJKsc-Regular.otf'
GLYPHS = '红色研学证书同你已通过崮上丰碑数字导览完成孟良战役纪念地全部个点位的打卡并知识问答传承基因赓续沂蒙精神！：，。、★“” ·0123456789/-年月日'
subprocess.run([sys.executable, '-m', 'fontTools.subset', str(SOURCE), '--text=' + GLYPHS,
                '--flavor=woff2', '--output-file=' + str(WEB/'vendor/fonts/certificate.woff2')], check=True)
assets = sorted(p.relative_to(WEB).as_posix() for p in WEB.rglob('*')
                if p.is_file() and p.name != 'sw.js' and p.suffix not in ['.otf', '.ttf', '.woff2'])
version = hashlib.sha256(b''.join(p.encode() + (WEB/p).read_bytes() for p in assets) + (WEB/'vendor/fonts/certificate.woff2').read_bytes()).hexdigest()[:16]
worker = '''const CACHE='menglianggu-guide-VERSION';
const ASSETS=ASSET_LIST;
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
    const data=await cached.arrayBuffer(),m=/bytes=(\\d+)-(\\d*)/.exec(range);
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
'''
(WEB/'sw.js').write_text(worker.replace('VERSION', version).replace('ASSET_LIST', json.dumps(assets, ensure_ascii=False)))
print(f'Offline cache {version}: {len(assets)} assets; certificate font {(WEB/"vendor/fonts/certificate.woff2").stat().st_size} bytes')
