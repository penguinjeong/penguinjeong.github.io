// 성지순례 앱 서비스 워커: 앱 파일과 본 이미지를 저장해 오프라인에서도 열리게 한다.
// movie.html 등을 수정해서 올릴 때마다 VERSION 숫자를 올려야 폰에 새 버전이 반영된다.
const VERSION = 'spots-v5';
const CORE = ['./movie.html', './spots.js', './spots.en.js', './i18n.js', './manifest.json', './icon-192.png', './icon-512.png', './privacy-policy.html'];
const IMG_CACHE = 'spots-img-v1';
const IMG_LIMIT = 250;

self.addEventListener('install', event => {
  // cache: 'reload' 로 브라우저 HTTP 캐시를 건너뛰고 항상 최신 파일을 받는다.
  event.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 구글 지도 임베드는 항상 네트워크
  if (url.hostname.endsWith('google.com')) return;

  // 페이지 이동: 네트워크 우선, 실패하면 저장본
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./movie.html', copy));
        return res;
      }).catch(() => caches.match('./movie.html'))
    );
    return;
  }

  // 같은 출처 파일: 저장본 우선
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req)));
    return;
  }

  // 외부 이미지(위키미디어 썸네일): 저장본 우선, 없으면 받아서 저장
  if (req.destination === 'image') {
    event.respondWith(
      caches.open(IMG_CACHE).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          if (res && (res.ok || res.type === 'opaque')) {
            cache.put(req, res.clone()).then(() => trimCache(IMG_CACHE, IMG_LIMIT));
          }
          return res;
        }))
      )
    );
  }
});
