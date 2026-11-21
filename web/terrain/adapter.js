/* Optional shell bridge. Include <script src="terrain/adapter.js" defer></script>.
 * Self-contained: does not change shell markup, global styles, or narrator IDs.
 */
(function(){
  'use strict';
  var script=document.currentScript;
  var base=new URL('./',script?script.src:location.href);
  var dialog,frame,opener;
  function close(){if(!dialog)return;frame.contentWindow.postMessage({type:'guide:terrain-pause'},location.origin);dialog.close();frame.src='about:blank';opener&&opener.focus();}
  function open(){
    opener=document.activeElement;
    if(!dialog){
      dialog=document.createElement('dialog');dialog.setAttribute('aria-label','孟良崮三维战场沙盘');
      dialog.style.cssText='position:fixed;inset:0;width:100%;height:100%;max-width:100%;max-height:100%;margin:0;padding:0;border:0;background:#120e0c;overflow:hidden;color:#eee6d6;';
      frame=document.createElement('iframe');frame.title='孟良崮三维战场沙盘';frame.style.cssText='display:block;width:100%;height:100%;border:0;';
      dialog.append(frame);document.body.append(dialog);
      dialog.addEventListener('cancel',function(e){e.preventDefault();close();});
      window.addEventListener('message',function(e){if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data&&e.data.type==='guide:terrain-close')close();});
    }
    frame.src=new URL('index.html?embedded=1',base).href;dialog.showModal();
  }
  function register(){if(window.GuideShell&&typeof window.GuideShell.registerModule==='function')window.GuideShell.registerModule('terrain',open);}
  window.addEventListener('guide:shell-ready',register);register();
})();
