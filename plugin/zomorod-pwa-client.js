/* Optional Zomorod PWA — feature-gated, zero caches and no permission prompts on load. */
(() => {
  'use strict';
  const ROOT_ID = 'zomorod-pwa-controls';
  const SCOPE = '/sub/';
  const base = '/api/zomorod/pwa';
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const el = (id) => document.getElementById(id);
  const path = location.pathname.replace(/\/+$/, '');
  if (!path.startsWith(SCOPE) || path.slice(SCOPE.length).split('/').filter(Boolean).length > 2) return;
  const token = path.split('/').filter(Boolean).pop();
  if (!token || !/^[A-Za-z0-9._~-]{12,250}$/.test(token)) return;

  const setInfo = (message) => { const node = el('z-pwa-info'); if (node) node.textContent = message; };
  let deferredInstall = null, config = null, registration = null;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstall = event;
    if (config?.pwa_enabled && el('z-pwa-install')) el('z-pwa-install').hidden = isStandalone();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    if (el('z-pwa-install')) el('z-pwa-install').hidden = true;
    setInfo('زمرد روی دستگاه نصب شد.');
  });

  const keyBytes = (key) => {
    const binary = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
    return Uint8Array.from(binary, c => c.charCodeAt(0));
  };
  async function enablePush() {
    const button = el('z-pwa-push');
    if (!config?.push_enabled || !('PushManager' in window) || !('Notification' in window)) return;
    if (isIOS() && !isStandalone()) {
      setInfo('در آیفون ابتدا از Safari گزینه Share → Add to Home Screen را بزنید و زمرد را از آیکون نصب‌شده باز کنید.');
      return;
    }
    if (button) button.disabled = true;
    try {
      if (Notification.permission === 'denied') throw new Error('مجوز اعلان در تنظیمات مرورگر مسدود شده است.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('برای فعال‌شدن اعلان، مجوز لازم است.');
      registration ||= await navigator.serviceWorker.register(config.sw_url, {scope:SCOPE,updateViaCache:'none'});
      const subscription = await registration.pushManager.getSubscription() ||
        await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.vapid_public_key)});
      const result = await fetch(base+'/subscribe/'+encodeURIComponent(token), {
        method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
        body:JSON.stringify(subscription.toJSON())
      });
      if (!result.ok) throw new Error('ثبت دستگاه در سرور انجام نشد.');
      button.textContent = 'اعلان‌ها فعال هستند';
      setInfo('اعلان‌ها برای این دستگاه فعال شدند.');
    } catch (error) {
      setInfo(error.message || 'امکان فعال‌سازی اعلان وجود ندارد.');
    } finally {
      if (button) button.disabled = false;
    }
  }
  async function disablePush() {
    const button=el('z-pwa-disable');
    if (button) button.disabled=true;
    try {
      const subscription=await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch(base+'/subscribe/'+encodeURIComponent(token), {
          method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(subscription.toJSON())
        });
        await subscription.unsubscribe();
      }
      const push=el('z-pwa-push'); if (push) push.textContent='فعال‌سازی اعلان‌ها';
      setInfo('اعلان‌های این دستگاه غیرفعال شد.');
    } catch (_) { setInfo('قطع اعلان با خطا روبه‌رو شد. از تنظیمات گوشی نیز می‌توانید مجوز را لغو کنید.'); }
    finally {if(button)button.disabled=false;}
  }
  async function start() {
    if (!isSecureContext || !('serviceWorker' in navigator)) return;
    try {
      const response = await fetch(base+'/config',{cache:'no-store',credentials:'same-origin'});
      if (!response.ok) return;
      config = await response.json();
    } catch (_) { return; }
    if (!config.pwa_enabled) {
      try { const regs=await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.filter(r=>r.active?.scriptURL.includes(base+'/sw.js')).map(r=>r.unregister()));
      } catch (_) {}
      return;
    }
    const manifest=document.createElement('link');
    manifest.rel='manifest';manifest.href=config.manifest_url+'?start='+encodeURIComponent(path);
    document.head.appendChild(manifest);
    const theme=document.createElement('meta');theme.name='theme-color';theme.content='#064C38';document.head.appendChild(theme);
    try {registration=await navigator.serviceWorker.register(config.sw_url,{scope:SCOPE,updateViaCache:'none'});}
    catch (_) { /* PWA web page remains functional if worker registration is blocked. */ }
    const shell=document.createElement('section');
    shell.id=ROOT_ID;
    shell.dir='rtl';
    shell.style.cssText='box-sizing:border-box;max-width:820px;margin:16px auto 40px;padding:12px 16px;border:1px solid var(--border,#d6d6d6);background:var(--card,#fff);color:var(--foreground,inherit);border-radius:16px;font:inherit;display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between';
    shell.innerHTML='<div style="flex:1;min-width:170px"><strong style="font-size:14px">وب‌اپ زمرد</strong><div id="z-pwa-info" style="font-size:12px;opacity:.75;line-height:1.8">نصب روی گوشی و دریافت اعلان‌های اشتراک</div></div><button id="z-pwa-install" type="button" style="font:inherit;font-size:12px;cursor:pointer;border:1px solid currentColor;border-radius:9px;background:transparent;color:inherit;padding:8px 11px">افزودن به صفحه اصلی</button><button id="z-pwa-push" type="button" hidden style="font:inherit;font-size:12px;cursor:pointer;border:1px solid currentColor;border-radius:9px;background:transparent;color:inherit;padding:8px 11px">فعال‌سازی اعلان‌ها</button><button id="z-pwa-disable" type="button" hidden style="font:inherit;font-size:11px;cursor:pointer;border:0;background:transparent;color:inherit;text-decoration:underline;padding:6px">لغو اعلان</button>';
    document.body.appendChild(shell);
    const install=el('z-pwa-install');
    install.hidden=isStandalone();
    install.addEventListener('click',async()=>{
      if(deferredInstall){try{await deferredInstall.prompt();await deferredInstall.userChoice;}catch(_){}deferredInstall=null;}
      else setInfo(isIOS()?'در Safari از منوی Share گزینه Add to Home Screen را انتخاب کنید.':'در منوی مرورگر گزینه Install App یا افزودن به صفحه اصلی را انتخاب کنید.');
    });
    if(config.push_enabled && registration && 'PushManager' in window && 'Notification' in window){
      const button=el('z-pwa-push'), off=el('z-pwa-disable');
      button.hidden=false;off.hidden=false;button.addEventListener('click',enablePush);
      off.addEventListener('click',disablePush);
      try{if(await registration.pushManager.getSubscription())button.textContent='اعلان‌ها فعال هستند';}catch(_){}
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();