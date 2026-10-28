import './style.css';
import { PoolPhysics } from './physics.js';
import { PoolScene } from './scene.js';
import { PoolAudio } from './audio.js';
import { POOL } from './water.js';

const $ = id => document.getElementById(id);
let toastTimer;
function toast(text) { $('toast').textContent = text; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2400); }
const names = { duck: '一只小鸭来陪你', ring: '给夏天多一个圈', ball: '快乐，就让它滚起来', board: '今天就漂在这里', flamingo: '粉色朋友来报到' };

async function start() {
  const physics = new PoolPhysics(); physics.reset(); const scene = new PoolScene($('scene'), physics), audio = new PoolAudio();
  scene.syncToys(); scene.makeThumbnails();
  let previousTime = performance.now(), lastIdleRipple = 0, active = true;
  const canvas = scene.renderer.domElement;
  const updateCount = () => { $('toy-count').textContent = physics.items.length; };
  const pointers = new Set(); let pointer = null, longPress = null, lastHover = null;
  const clearPress = () => { clearTimeout(longPress); longPress = null; };
  function release(cancelled = false) {
    clearPress(); const item = physics.release();
    if (item && pointer?.pressed && !cancelled) { physics.splash(item.body.position.x, item.body.position.z, 0.18); scene.droplets.splash(item.body.position.x, item.body.position.z, 27, 0.8); audio.splash(0.7); }
    pointer = null; canvas.style.cursor = 'grab';
  }
  canvas.addEventListener('pointerdown', event => {
    pointers.add(event.pointerId);
    if (pointers.size > 1) { release(true); return; }
    if (event.button !== 0) return;
    const point = scene.waterPoint(event.clientX, event.clientY); if (!point) return;
    const item = scene.pick(event.clientX, event.clientY);
    pointer = { id: event.pointerId, item, pressed: false, startX: event.clientX, startY: event.clientY, last: point.clone(), offsetX: item ? item.body.position.x - point.x : 0, offsetZ: item ? item.body.position.z - point.z : 0 };
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
    if (item) {
      physics.grab(item, item.body.position);
      longPress = setTimeout(() => {
        if (!pointer?.item) return;
        pointer.pressed = true; physics.moveGrab(item.body.position.x, item.body.position.z, true); audio.splash(0.35); toast('松开，看看它浮起来');
      }, 420);
    } else if (physics.water.contains(point.x, point.z, 0.03)) {
      physics.splash(point.x, point.z, 0.13); scene.droplets.splash(point.x, point.z, 12, 0.65); audio.splash(0.5);
    }
  });
  canvas.addEventListener('pointermove', event => {
    if (pointers.size > 1) return;
    const point = scene.waterPoint(event.clientX, event.clientY); if (!point) return;
    if (pointer && pointer.id === event.pointerId) {
      if (Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 9) clearPress();
      if (pointer.item) physics.moveGrab(point.x + pointer.offsetX, point.z + pointer.offsetZ, pointer.pressed);
      else if (physics.water.contains(point.x, point.z, 0.08) && point.distanceTo(pointer.last) > 0.055) {
        physics.water.disturb(point.x, point.z, 0.06, 0.19); pointer.last.copy(point); audio.splash(0.15);
      }
    } else if (event.pointerType === 'mouse' && !event.buttons) {
      const item = scene.pick(event.clientX, event.clientY); canvas.style.cursor = item ? 'grab' : physics.water.contains(point.x, point.z) ? 'crosshair' : 'default';
      if (lastHover && physics.water.contains(point.x, point.z, 0.08) && point.distanceTo(lastHover) > 0.17) { physics.water.disturb(point.x, point.z, 0.017, 0.18); lastHover.copy(point); }
      else if (!lastHover) lastHover = point.clone();
    }
  });
  for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, event => { pointers.delete(event.pointerId); if (pointer?.id === event.pointerId) release(type === 'pointercancel'); });
  canvas.addEventListener('lostpointercapture', event => { pointers.delete(event.pointerId); if (pointer?.id === event.pointerId) release(true); });
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerleave', () => { lastHover = null; });

  $('wave').addEventListener('click', () => {
    const x = (Math.random() - 0.5) * 2, z = (Math.random() - 0.5) * 1.1;
    physics.splash(x, z, 0.3); scene.droplets.splash(x, z, 40, 1.3); audio.splash(1); toast('浪花来了，抓稳小鸭');
  });
  for (const button of document.querySelectorAll('[data-toy]')) button.addEventListener('click', () => {
    const kind = button.dataset.toy, item = physics.spawn(kind, { y: POOL.level + 1.2 });
    if (!item) return toast('泳池有点挤啦，重新摆放再来吧');
    scene.syncToys(); updateCount(); audio.splash(0.4); toast(names[kind]);
  });
  $('reset').addEventListener('click', () => { release(true); physics.reset(); scene.syncToys(); updateCount(); toast('又是一个崭新的夏日'); });
  $('view').addEventListener('click', () => { scene.toggleView(); const label = scene.topView ? '切换斜视视角' : '切换俯视视角'; $('view').setAttribute('aria-label', label); $('view').title = label; });
  $('settings-toggle').addEventListener('click', () => { const open = $('settings').hidden; $('settings').hidden = !open; $('settings-toggle').setAttribute('aria-expanded', String(open)); });
  $('wind').addEventListener('input', event => {
    const wind = Number(event.target.value) / 100; physics.water.wind = wind;
    $('wind-value').textContent = wind < 0.15 ? '无风' : wind < 0.5 ? '微风' : '起风啦'; $('mood').textContent = wind < 0.15 ? '风平浪静，慢慢漂' : wind < 0.5 ? '微风，适合发呆' : '起风了，荡一会儿';
  });
  $('sound').addEventListener('click', async () => {
    try { const enabled = await audio.toggle(); $('sound').setAttribute('aria-pressed', String(enabled)); $('sound').setAttribute('aria-label', enabled ? '关闭水声' : '开启水声'); $('sound').querySelector('span').textContent = enabled ? '水声开' : '水声关'; $('sound-path').setAttribute('d', enabled ? 'M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14' : 'm16 9 5 6m0-6-5 6'); } catch { toast('水声暂未开启，可以再轻点一次'); }
  });
  document.addEventListener('visibilitychange', () => { active = !document.hidden; previousTime = performance.now(); if (!active) release(true); });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); active = false; toast('画面暂时休息了，刷新页面即可继续'); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());
  function frame(now) {
    requestAnimationFrame(frame); const dt = Math.min((now - previousTime) / 1000, 0.05); previousTime = now; if (!active) return;
    physics.step(dt);
    if (physics.time - lastIdleRipple > 2.2 && physics.water.wind > 0.02) {
      lastIdleRipple = physics.time; physics.water.disturb(Math.sin(physics.time * 0.53) * 2.7, Math.cos(physics.time * 0.71) * 1.7, physics.water.wind * 0.022, 0.32);
    }
    scene.render(dt);
  }
  requestAnimationFrame(frame); updateCount(); $('loading').classList.add('done');
  // Read-only diagnostics plus explicit test actions; no external requests.
  window.__POOL__ = {
    ready: true, state: () => ({ ...physics.snapshot(), fps: scene.fps, width: canvas.clientWidth, height: canvas.clientHeight, pixelRatio: scene.renderer.getPixelRatio(), webgl: !!scene.renderer.getContext(), topView: scene.topView }),
    project: (x, y = POOL.level, z = 0) => scene.project(x, y, z),
    projectItem: id => { const item = physics.items.find(i => i.id === id); return item ? scene.project(item.body.position.x, item.body.position.y + (item.kind === 'duck' ? 0.2 : 0.08), item.body.position.z) : null; },
    splash: (x = 0, z = 0) => physics.splash(x, z), reset: () => { physics.reset(); scene.syncToys(); updateCount(); },
    press: id => { const item = physics.items.find(i => i.id === id); if (item) { physics.grab(item, item.body.position); physics.moveGrab(item.body.position.x, item.body.position.z, true); } }, release: () => physics.release(),
  };
}
start().catch(error => {
  console.error(error); $('loading').innerHTML = '<span>泳池暂时没有打开</span><span>请使用支持 WebGL 2 的浏览器，刷新后再试。</span><button class="wave-button" id="reload">重新打开泳池 ↗</button>';
  $('reload').addEventListener('click', () => location.reload());
});
