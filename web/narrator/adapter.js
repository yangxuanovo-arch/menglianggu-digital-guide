(function(){
  'use strict';
  var url=new URL('index.html',document.currentScript.src),layer=null,frame=null,opener=null,point=null;
  function close(){
    if(!layer)return;layer.close();layer.remove();layer=frame=null;
    if(point){window.dispatchEvent(new CustomEvent('guide:narrator-return',{detail:{id:point}}));point=null}
    else{var target=opener&&opener.getClientRects().length?opener:document.querySelector('.module-launchers [data-module="narrator"]');if(target)target.focus()}
  }
  function open(detail){
    if(layer)return;detail=detail||{};opener=detail.opener||document.activeElement;
    point=window.GUIDE.points.some(function(p){return p.id===detail.pointId})?detail.pointId:null;
    var src=new URL(url.href);src.searchParams.set('clip',point||'intro');src.searchParams.set('embedded','1');
    if(typeof HTMLDialogElement==='undefined'||typeof HTMLDialogElement.prototype.showModal!=='function'){location.assign(src.href);return}
    layer=document.createElement('dialog');layer.setAttribute('aria-label','AI 数字讲述');layer.setAttribute('aria-modal','true');
    layer.style.cssText='position:fixed;top:0;right:0;bottom:0;left:0;width:100%;height:100%;max-width:100%;max-height:100%;margin:0;padding:0;border:0;background:#211513;overflow:hidden';
    layer.addEventListener('cancel',function(e){e.preventDefault();close()});frame=document.createElement('iframe');frame.src=src.href;frame.title='AI 数字讲述 · 虚构数字讲解员';frame.allow='autoplay';frame.style.cssText='width:100%;height:100%;border:0;display:block';layer.appendChild(frame);document.body.appendChild(layer);layer.showModal();frame.focus();
  }
  addEventListener('message',function(e){if(!frame||e.source!==frame.contentWindow||e.origin!==location.origin||!e.data)return;if(e.data.type==='guide:narrator-close')close();else if(e.data.type==='guide:narrator-complete'&&window.GUIDE.points.some(function(p){return p.id===e.data.id}))window.dispatchEvent(new CustomEvent('guide:narrator-stamp',{detail:{id:e.data.id}}))});
  function register(){if(window.GuideShell)window.GuideShell.registerModule('narrator',open)}
  addEventListener('guide:shell-ready',register);register();
})();
