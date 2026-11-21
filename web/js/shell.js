(function(){
  'use strict';
  var modules=window.GuideModules=window.GuideModules||{};
  var titles={terrain:'3D 地形沙盘',narrator:'AI 数字讲述',panorama:'3D 场景漫游'};
  var launchers=document.querySelector('.module-launchers');
  document.querySelectorAll('.opening-experiences [data-module]').forEach(function(button){launchers.appendChild(button.cloneNode(true))});
  function refresh(id){document.querySelectorAll('[data-module="'+id+'"]').forEach(function(button){var ready=typeof modules[id]==='function';button.dataset.ready=String(ready);button.querySelector('.portal-state').textContent=ready?'进入体验':'暂不可用'})}
  function notice(text){var el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=text;document.body.appendChild(el);setTimeout(function(){el.remove()},3200)}
  function openModule(id,pointId){
    if(!Object.prototype.hasOwnProperty.call(titles,id))return false;
    var event=new CustomEvent('guide:open-module',{cancelable:true,detail:{module:id,pointId:pointId,opener:document.activeElement}});
    if(!window.dispatchEvent(event)){document.getElementById('intro').classList.add('hidden');return true}
    if(typeof modules[id]!=='function'){notice(titles[id]+'暂不可用，请先体验导览地图');return false}
    try{modules[id](event.detail);document.getElementById('intro').classList.add('hidden');return true}catch(e){notice('暂时无法打开'+titles[id]+'，请稍后重试');return false}
  }
  document.querySelectorAll('[data-module]').forEach(function(button){button.addEventListener('click',function(){openModule(button.dataset.module)})});
  window.GuideShell={
    registerModule:function(id,open){if(!Object.prototype.hasOwnProperty.call(titles,id)||typeof open!=='function')throw new TypeError('Unknown guide module or invalid opener');modules[id]=open;refresh(id)},
    openModule:openModule,
    refreshModules:function(){Object.keys(titles).forEach(refresh)}
  };
  window.GuideShell.refreshModules();
  window.dispatchEvent(new CustomEvent('guide:shell-ready',{detail:{shell:window.GuideShell}}));
})();
