// deployed as _worker.js next to the media; _routes.json sends only /api/* here, so audio never runs through it
const MAX_TRACKS = 200;
// past this many telegram messages in an hour, one notice goes out and the rest are skipped
const HOURLY_NOTIFY_CAP = 20;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const reply = (status) => new Response(null, { status, headers: CORS });

// sample and pack names published with the media, so only real ids get counted
let names;
async function loadNames(env, requestUrl) {
  if (!names) {
    const res = await env.ASSETS.fetch(new URL('/meta/names.json', requestUrl));
    if (!res.ok) throw new Error('names.json missing');
    names = await res.json();
  }
  return names;
}

async function notify(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const hour = new Date().toISOString().slice(0, 13);
  const { sent } = await env.DB.prepare(
    'INSERT INTO notify_log (hour, sent) VALUES (?1, 1) ON CONFLICT(hour) DO UPDATE SET sent = sent + 1 RETURNING sent'
  )
    .bind(hour)
    .first();
  if (sent > HOURLY_NOTIFY_CAP + 1) return;
  if (sent === HOURLY_NOTIFY_CAP + 1) {
    text = 'Lots of downloads right now, so notifications are paused until the next hour. Downloads are still being counted.';
  }
  // plain text (no parse_mode), so names can't inject formatting or links
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
}

const times = (n) => `${n} download${n === 1 ? '' : 's'} total`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/hit') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return reply(405);

    let body;
    let known;
    try {
      body = JSON.parse(await request.text());
      known = await loadNames(env, request.url);
    } catch {
      return reply(400);
    }

    // t: single sample download, tp: sample inside a pack zip, p: pack zip
    const inPack = body.pack !== undefined;
    if (inPack && !Object.hasOwn(known.packs, body.pack)) return reply(400);
    const ids = [...new Set(Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [])].filter(
      (id) => typeof id === 'string' && Object.hasOwn(known.tracks, id)
    );
    if (ids.length === 0) return reply(400);

    const keys = [...(inPack ? [`p:${body.pack}`] : []), ...ids.map((id) => `${inPack ? 'tp' : 't'}:${id}`)];
    const add = env.DB.prepare('INSERT INTO counts (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1 RETURNING n');
    const results = await env.DB.batch(keys.map((key) => add.bind(key)));
    const firstCount = results[0].results[0].n;

    const text = inPack
      ? `📦 Pack downloaded\n${known.packs[body.pack]} (${ids.length} sample${ids.length === 1 ? '' : 's'})\n${times(firstCount)}`
      : `⬇️ Sample downloaded\n${known.tracks[ids[0]]}\n${times(firstCount)}`;
    ctx.waitUntil(notify(env, text).catch(() => {}));
    return reply(204);
  },
};
