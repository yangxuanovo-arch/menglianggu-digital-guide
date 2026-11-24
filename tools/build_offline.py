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
                if p.is_file() and p.name not in ['sw.js', 'package.json', 'package-lock.json']
                and not any(part.startswith('.') or part in ['node_modules', 'src'] for part in p.relative_to(WEB).parts)
                and p.suffix not in ['.otf', '.ttf', '.woff2', '.md', '.map', '.mp4'] and p.stat().st_size <= 2 * 1024 * 1024)
videos = sorted(p.relative_to(WEB).as_posix() for p in (WEB/'video/narrator').glob('*.mp4'))
video_bytes = sum((WEB/p).stat().st_size for p in videos)
precache_videos = sum((WEB/p).stat().st_size for p in assets) + video_bytes <= 30 * 1024 * 1024
if precache_videos:
    assets = sorted(assets + videos)
cache_assets = sorted({(path[:-10] or './') if path.endswith('index.html') else path for path in assets})
version = hashlib.sha256(b''.join(p.encode() + (WEB/p).read_bytes() for p in sorted(set(assets + videos))) + (WEB/'vendor/fonts/certificate.woff2').read_bytes() + Path(__file__).read_bytes()).hexdigest()[:16]
worker = '''const CACHE='menglianggu-guide-VERSION';
const ASSETS=ASSET_LIST;
async function ranged(response,range){
 if(!range||response.status!==200)return response;
 const m=/^bytes=(\\d*)-(\\d*)$/.exec(range);
 if(!m||(!m[1]&&!m[2]))return response;
 const data=await response.arrayBuffer(),size=data.byteLength;
 const start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 const end=m[1]&&m[2]?Math.min(Number(m[2]),size-1):size-1;
 if(start>end||start>=size||(!m[1]&&Number(m[2])===0))return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+size}});
 return new Response(data.slice(start,end+1),{status:206,headers:{'Content-Type':response.headers.get('Content-Type')||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':String(end-start+1),'Content-Range':'bytes '+start+'-'+end+'/'+size}});
}
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(path,{cache:'reload'})))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('menglianggu-guide-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 event.respondWith(caches.open(CACHE).then(async cache=>{
  const key=new URL(url.href);key.pathname=key.pathname.replace(/\\/index\\.html$/,'/');
  const cached=await cache.match(key.href,{ignoreSearch:true});
  const range=event.request.headers.get('range'),media=/\\.(mp3|mp4)$/.test(url.pathname);
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
'''
(WEB/'sw.js').write_text(worker.replace('VERSION', version).replace('ASSET_LIST', json.dumps(cache_assets, ensure_ascii=False)))
print(f'Offline cache {version}: {len(assets)} assets; certificate font {(WEB/"vendor/fonts/certificate.woff2").stat().st_size} bytes')
print(f'Video policy: {"precache" if precache_videos else "runtime on first play"}; {len(videos)} clips; {video_bytes} video bytes; {sum((WEB/p).stat().st_size for p in assets)} precache bytes')
