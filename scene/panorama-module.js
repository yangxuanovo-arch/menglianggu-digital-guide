/* 场景重现（任务二·路线甲）接入模块：<script src="scene/panorama-module.js" defer></script>
   在 guide:shell-ready 后通过 GuideShell.registerModule('panorama', open) 注册，
   open() 以全屏 iframe 打开 scene/index.html。 */
(function () {
  var sceneUrl = new URL('index.html?embed=1', (document.currentScript && document.currentScript.src) || location.href).href;
  var layer = null, frame = null, opener = null;

  function close() {
    if (!layer) return;
    layer.close();
    layer.remove();
    layer = frame = null;
    document.documentElement.style.overflow = '';
    if (opener && opener.getClientRects().length) opener.focus();
    document.dispatchEvent(new CustomEvent('guide:module-closed', { detail: { id: 'panorama' } }));
  }

  function open() {
    if (layer) return;
    if (typeof HTMLDialogElement === 'undefined' || typeof HTMLDialogElement.prototype.showModal !== 'function') { location.assign(sceneUrl); return; }
    opener = document.activeElement;
    layer = document.createElement('dialog');
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', '孟良崮战役纪念碑场景重现');
    layer.setAttribute('aria-modal', 'true');
    layer.style.cssText = 'position:fixed;top:0;right:0;bottom:0;left:0;width:100%;height:100%;max-width:100%;max-height:100%;margin:0;padding:0;border:0;z-index:2147483000;background:#3e0608';
    layer.addEventListener('cancel', function (e) { e.preventDefault(); close(); });
    frame = document.createElement('iframe');
    frame.src = sceneUrl;
    frame.title = '孟良崮战役纪念碑场景重现';
    frame.allow = 'autoplay; fullscreen';
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    layer.appendChild(frame);
    document.body.appendChild(layer);
    document.documentElement.style.overflow = 'hidden';
    layer.showModal();
    frame.focus();
  }

  addEventListener('message', function (e) {
    if (!frame || e.origin !== location.origin || e.source !== frame.contentWindow) return;
    if (e.data && e.data.type === 'guide:close-module' && e.data.id === 'panorama') close();
  });
  addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

  var registered = false;
  function register() {
    if (registered || !window.GuideShell || typeof window.GuideShell.registerModule !== 'function') return;
    registered = true;
    window.GuideShell.registerModule('panorama', open);
  }
  window.GuidePanorama = { open: open, close: close };
  document.addEventListener('guide:shell-ready', register);
  window.addEventListener('guide:shell-ready', register);
  register();
})();
