// ═══════════════════════════════════════════════
// Sign Diver Service Worker
// 目的: MediaPipe WASM / モデル / GLB / VRM / Three.js のキャッシュ
// ═══════════════════════════════════════════════

// キャッシュバージョン — ファイル更新時にここを変える
const CACHE_VERSION = 'sd-cache-v3';

// プリキャッシュ対象（初回インストール時に全てDL）
const PRECACHE_URLS = [
  // MediaPipe WASM（本丸）
  './mediapipe/wasm/vision_wasm_internal.js',
  './mediapipe/wasm/vision_wasm_internal.wasm',
  './mediapipe/wasm/vision_wasm_nosimd_internal.js',
  './mediapipe/wasm/vision_wasm_nosimd_internal.wasm',
  // MediaPipe モデル
  './mediapipe/hand_landmarker.task',
  // TFJS モデル
  './tfjs_model_official/model.json',
  './tfjs_model_official/label_map_unified.json',
  './tfjs_model_official/group1-shard1of1.bin',
];

// キャッシュ対象パターン（動的キャッシュ用）
// これに一致するリクエストはキャッシュファーストで返す
const CACHEABLE_PATTERNS = [
  /\/mediapipe\//,
  /\/tfjs_model_official\//,
  /\/glb\//,              // GLBアニメーション（sign_poses, wait_actions, special_actions等）
  /\/threejs\//,           // Three.js / three-vrm ライブラリ
  /\.vrm(\?|$)/,          // VRMモデルファイル
];

// ─── install: プリキャッシュ ───
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] Pre-caching core assets...');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => {
        console.log('[SW] Pre-cache complete ✅');
        return self.skipWaiting();
      })
      .catch(err => {
        console.warn('[SW] Pre-cache failed (some files may not be deployed yet):', err);
        return self.skipWaiting();
      })
  );
});

// ─── activate: 古いキャッシュを削除 ───
self.addEventListener('activate', event => {
  console.log(`[SW] Activating ${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('sd-cache-') && key !== CACHE_VERSION)
          .map(key => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ─── fetch: キャッシュファースト戦略 ───
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // キャッシュ対象パターンに一致するか
  const isCacheable = CACHEABLE_PATTERNS.some(p => p.test(url.pathname));

  if (!isCacheable) {
    // キャッシュ対象外 → ネットワークにそのまま流す
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) {
          console.log(`[SW] Cache HIT: ${url.pathname}`);
          return cached;
        }
        console.log(`[SW] Cache MISS → fetch: ${url.pathname}`);
        return fetch(event.request).then(response => {
          // 正常レスポンスのみキャッシュ
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
  );
});
