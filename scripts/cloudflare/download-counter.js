// deployed as _worker.js next to the media; _routes.json sends only /api/* here, so audio never runs through it
const ID = /^[\w.-]{1,120}$/;
const MAX_TRACKS = 200;
const CORS = { 'Access-Control-Allow-Origin': '*' };

const reply = (status) => new Response(null, { status, headers: CORS });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/hit') return env.ASSETS.fetch(request);
    if (request.method !== 'POST') return reply(405);

    let body;
    try {
      body = JSON.parse(await request.text());
    } catch {
      return reply(400);
    }

    // t: single sample download, tp: sample inside a pack zip, p: pack zip
    const keys = [];
    const inPack = body.pack !== undefined;
    if (inPack) {
      if (!ID.test(body.pack)) return reply(400);
      keys.push(`p:${body.pack}`);
    }
    const tracks = Array.isArray(body.tracks) ? body.tracks.slice(0, MAX_TRACKS) : [];
    for (const id of new Set(tracks)) {
      if (typeof id === 'string' && ID.test(id)) keys.push(`${inPack ? 'tp' : 't'}:${id}`);
    }
    if (keys.length === 0) return reply(400);

    const add = env.DB.prepare('INSERT INTO counts (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1');
    await env.DB.batch(keys.map((key) => add.bind(key)));
    return reply(204);
  },
};
