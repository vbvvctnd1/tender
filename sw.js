/* Приложение в памяти браузера — чтобы в зале без связи оно всё-таки открылось.

   Правило нарочно осторожное: сначала спрашиваем сеть и только если она молчит
   — отдаём сохранённое. Так свежая выложенная версия всегда побеждает и нельзя
   застрять на вчерашней. Плата за это — короткое ожидание сети при запуске;
   без связи оно не наступает, запрос отваливается сразу.

   Данные тренера (сервер Supabase) сюда не попадают никогда: они должны быть
   живыми, а не из кармана.

   Файл лежит рядом с index.html и обновляется вместе с ним. Если его на сайте
   нет — приложение просто работает как раньше, без запаса. */

const CACHE = 'silovoy-1';

const SHELL = [
    './',
    './index.html',
    'https://telegram.org/js/telegram-web-app.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.js'
];

const NET_WAIT = 3500;   // сколько ждём сеть, прежде чем достать сохранённое

self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE).then(function (c) {
            // по одному: не ответил один адрес — остальное всё равно ляжет
            return Promise.all(SHELL.map(function (u) {
                return c.add(new Request(u, { cache: 'reload' })).catch(function () {});
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                return k === CACHE ? null : caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

function fetchWithTimeout(req) {
    return new Promise(function (resolve, reject) {
        const timer = setTimeout(function () { reject(new Error('сеть молчит')); }, NET_WAIT);
        fetch(req).then(
            function (r) { clearTimeout(timer); resolve(r); },
            function (err) { clearTimeout(timer); reject(err); }
        );
    });
}

self.addEventListener('fetch', function (e) {
    const req = e.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch (err) { return; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    // данные тренера — только живьём
    if (url.hostname.indexOf('supabase.co') !== -1) return;

    const isPage = req.mode === 'navigate';

    e.respondWith(
        fetchWithTimeout(req).then(function (res) {
            if (res && res.ok) {
                const copy = res.clone();
                // Telegram открывает приложение с длинным хвостом в адресе.
                // Страницу кладём всегда под одним именем, иначе в памяти
                // накопятся десятки почти одинаковых копий.
                const key = isPage ? './index.html' : req;
                caches.open(CACHE).then(function (c) { c.put(key, copy); });
            }
            return res;
        }).catch(function () {
            return caches.match(req, { ignoreSearch: isPage }).then(function (hit) {
                if (hit) return hit;
                if (isPage) return caches.match('./index.html');
                return Response.error();
            });
        })
    );
});

/* Запасной выход: приложение может попросить забыть всё сохранённое.
   Пригодится, если когда-нибудь запас окажется испорченным. */
self.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'drop-cache') return;
    e.waitUntil(caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }));
});
