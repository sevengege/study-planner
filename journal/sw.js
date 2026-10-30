/* 连思晨学习手账 - Service Worker
 * 目标：装到桌面后能离线打开、日常秒开。
 * 策略：导航请求 network-first（回退缓存首页）；静态资源 cache-first（后台更新）。
 */
const BASE = '/study-planner/journal';
const VERSION = 'lsc-journal-v1';
const CORE = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/manifest.webmanifest',
  BASE + '/icon-192.png',
  BASE + '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      // 单个资源失败不阻断安装
      await Promise.all(
        CORE.map((url) => cache.add(url).catch(() => undefined)),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith('lsc-journal-') && k !== VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // 第三方（如 DeepSeek）不接管

  // 页面导航：优先网络，失败回退缓存首页
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(VERSION);
          cache.put(BASE + '/', fresh.clone()).catch(() => undefined);
          return fresh;
        } catch {
          const cache = await caches.open(VERSION);
          const cached = (await cache.match(BASE + '/')) || (await cache.match(BASE + '/index.html'));
          return cached || Response.error();
        }
      })(),
    );
    return;
  }

  // 静态资源：缓存优先
  if (url.pathname.startsWith(BASE + '/_next/static/') || url.pathname.startsWith(BASE + '/icon-')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone()).catch(() => undefined);
        return res;
      })(),
    );
  }
});
