// Real-data check of the "Alle Sender" path.
// 1. Loads real 24 h get_stream_timeline results of all stations (real/tl_<id>.json).
// 2. Derives every play with the page's own station-counting rules (validated against song_airplay).
// 3. Ground truth = exact Top 20 songs/artists over all plays.
// 4. Serves song_airplay from those plays with the service's observed behaviour
//    (case-insensitive substring filters, rows sorted plays desc then artist asc, capped at 200 rows),
//    search_songs from the same titles, and runs the published page's fleet mode against it.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIR = process.env.REAL_DIR || path.join(__dirname, 'real');
const FROM = Date.parse('2026-10-31T20:00:00Z'), TO = Date.parse('2026-11-01T20:00:00Z');
const PAGE = process.argv[2] || path.join(__dirname, '..', 'index.html');

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const key = (a, t) => norm(a) + '\u0001' + norm(t);
const streams = JSON.parse(fs.readFileSync(path.join(DIR, 'streams.json'), 'utf8'));
const plays = [];
let loaded = 0;
for (const s of streams) {
  const f = path.join(DIR, 'tl_' + s.id + '.json');
  if (!fs.existsSync(f)) continue;
  let d; try { d = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { continue; }
  loaded++;
  // same rules as stationPlays() in the page
  const blocks = (d.blocks || []).filter((b) => b.type === 'music' || b.type === 'uncertain').sort((a, b) => (a.from < b.from ? -1 : 1));
  const canon = new Map();
  for (const b of blocks) if (b.type === 'music' && b.meta && b.meta.artist && b.meta.raw_title) canon.set(norm(b.meta.raw_title), { artist: b.meta.artist, title: b.meta.title });
  const lastByKey = new Map(); let lastRaw = null;
  for (const b of blocks) {
    let artist, title;
    if (b.type === 'music') { if (!b.meta || !b.meta.artist) continue; artist = b.meta.artist; title = b.meta.title; lastRaw = norm(b.meta.raw_title || artist + ' - ' + title); }
    else { const st = b.meta && b.meta.stale_title; if (!st) continue; const raw = norm(st); if (raw === lastRaw) continue; lastRaw = raw; const c = canon.get(raw); if (!c) continue; artist = c.artist; title = c.title; }
    const k = key(artist, title), t0 = Date.parse(b.from), t1 = Date.parse(b.to), prev = lastByKey.get(k);
    lastByKey.set(k, t1);
    if (prev && t0 - prev < 75e3) continue;
    if (t0 < FROM || t0 >= TO) continue;
    plays.push({ stream_id: s.id, stream: s.name, artist, title, at: t0 });
  }
}
console.log('stations loaded:', loaded, 'of', streams.length, '| plays:', plays.length);

// ground truth (keys case-insensitive, like the page's exact matching)
const tSong = new Map(), tArt = new Map();
for (const p of plays) {
  const k = key(p.artist, p.title); const c = tSong.get(k) || { artist: p.artist, title: p.title, plays: 0, st: new Set() }; c.plays++; c.st.add(p.stream_id); tSong.set(k, c);
  const a = norm(p.artist); const d = tArt.get(a) || { artist: p.artist, plays: 0, st: new Set() }; d.plays++; d.st.add(p.stream_id); tArt.set(a, d);
}
const truthSongs = [...tSong.values()].sort((a, b) => b.plays - a.plays);
const truthArts = [...tArt.values()].sort((a, b) => b.plays - a.plays);

const data = { plays, streams, songs: truthSongs.map((s, i) => ({ id: 'r' + i, artist: s.artist, title: s.title, stations: s.st.size })) };
fs.writeFileSync(path.join(require('os').tmpdir(), 'realdata.json'), JSON.stringify(data));

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript({ content: 'window.__REAL = ' + fs.readFileSync(path.join(require('os').tmpdir(), 'realdata.json'), 'utf8') + ';' });
  await p.addInitScript(() => {
    const D = window.__REAL; const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const iso = (t) => new Date(t).toISOString();
    window.__calls = 0;
    function airplay(inp) {
      if (!inp.artist && !inp.title && !inp.song_id) throw { code: 'tool_error', message: 'at least one of artist/title/song_id is required' };
      const a = norm(inp.artist), ti = norm(inp.title), lo = Date.parse(inp.from), hi = Date.parse(inp.to);
      const byArtist = inp.group_by === 'artist';
      const rows = new Map();
      for (const x of D.plays) {
        if (x.at < lo || x.at >= hi || !norm(x.artist).includes(a) || !norm(x.title).includes(ti)) continue;
        const k = (byArtist ? x.artist : x.artist + '\u0001' + x.title) + '\u0001' + x.stream_id;
        const r = rows.get(k) || { artist: x.artist, title: x.title, stream_id: x.stream_id, stream: x.stream, plays: 0, first: x.at, last: x.at, titles: new Set() };
        r.plays++; r.first = Math.min(r.first, x.at); r.last = Math.max(r.last, x.at); r.titles.add(x.title); rows.set(k, r);
      }
      const capped = [...rows.values()].sort((x, y) => y.plays - x.plays || x.artist.localeCompare(y.artist)).slice(0, 200);
      const ents = new Map();
      for (const r of capped) {
        const k = byArtist ? r.artist : r.artist + '\u0001' + r.title;
        const e = ents.get(k) || { artist: r.artist, ...(byArtist ? {} : { title: r.title }), total_plays: 0, stations: 0, first_played_at: iso(r.first), last_played_at: iso(r.last), per_station: [], spellings: [r.artist], _t: new Set() };
        e.total_plays += r.plays; e.stations++; r.titles.forEach((t) => e._t.add(t));
        if (iso(r.first) < e.first_played_at) e.first_played_at = iso(r.first);
        if (iso(r.last) > e.last_played_at) e.last_played_at = iso(r.last);
        e.per_station.push({ stream_id: r.stream_id, stream: r.stream, plays: r.plays, station_kind: 'stream' });
        ents.set(k, e);
      }
      return { from: inp.from, to: inp.to, tracks: [...ents.values()].map((e) => { if (byArtist) e.tracks = e._t.size; delete e._t; return e; }) };
    }
    function songs(inp) {
      let l = D.songs; if (inp.artist) l = l.filter((s) => norm(s.artist).includes(norm(inp.artist))); if (inp.title) l = l.filter((s) => norm(s.title).includes(norm(inp.title)));
      l = l.slice().sort((x, y) => y.stations - x.stations);
      return { count: Math.min(l.length, inp.limit || 25), songs: l.slice(0, inp.limit || 25) };
    }
    const H = {
      'ad-fingerprinting_song_airplay': airplay,
      'ad-fingerprinting_search_songs': songs,
      'ad-fingerprinting_list_streams': () => ({ items: D.streams }),
      'ad-fingerprinting_list_stream_groups': () => ({ items: [] }),
      'ad-fingerprinting_get_stream_timeline': () => ({ blocks: [] }),
    };
    const mcp = { callTool: async (srv, tool, input) => { window.__calls++; await new Promise((r) => setTimeout(r, 1)); const payload = H[tool](input || {}); return { content: [], payload }; } };
    window.claude = { use: async () => mcp };
    const fixed = Date.parse('2026-11-01T20:00:00Z'); Date.now = () => fixed;
  });
  const html = '<!doctype html><html><head><meta charset=utf8></head><body>' + fs.readFileSync(PAGE, 'utf8') + '</body></html>';
  fs.writeFileSync(path.join(require('os').tmpdir(), 'realfleet.html'), html);
  await p.goto('file://' + path.join(require('os').tmpdir(), 'realfleet.html'));
  // page auto-loads 7 days; switch to 24 h and load again
  await p.waitForSelector('text=Top 20 Songs', { timeout: 300000 });
  await p.click('#d1'); await p.click('#run');
  await p.waitForFunction(() => /24 h/.test((document.querySelector('.strip') || {}).textContent || '') && !document.querySelector('#run').disabled, null, { timeout: 300000 });
  const got = await p.$$eval('.grid2 .panel:nth-of-type(1) .row', (rs) => rs.map((r) => ({ t: r.querySelector('.t').textContent, a: r.querySelector('.a').textContent, v: +r.querySelector('.fig b').textContent.replace(/\./g, '') })));
  const gotA = await p.$$eval('.grid2 .panel:nth-of-type(2) .row', (rs) => rs.map((r) => ({ a: r.querySelector('.t').textContent, v: +r.querySelector('.fig b').textContent.replace(/\./g, '') })));
  const calls = await p.evaluate(() => window.__calls);
  const tv = truthSongs.slice(0, 20).map((s) => s.plays), gv = got.map((x) => x.v);
  const cut = tv[19];
  const truthKeys = new Map(truthSongs.map((s) => [key(s.artist, s.title), s.plays]));
  const songsOk = JSON.stringify(tv) === JSON.stringify(gv) && got.every((x) => truthKeys.get(key(x.a, x.t)) === x.v)
    && truthSongs.filter((s) => s.plays > cut).every((s) => got.some((x) => key(x.a, x.t) === key(s.artist, s.title)));
  const av = truthArts.slice(0, 20).map((s) => s.plays), gav = gotA.map((x) => x.v);
  const artKeys = new Map(truthArts.map((s) => [norm(s.artist), s.plays]));
  const artsOk = JSON.stringify(av) === JSON.stringify(gav) && gotA.every((x) => artKeys.get(norm(x.a)) === x.v);
  console.log('page calls (both runs):', calls);
  console.log('\nRANK | PAGE (Song – Interpret: Plays) | TRUTH');
  for (let i = 0; i < 20; i++) console.log(String(i + 1).padStart(2), '|', got[i] ? `${got[i].t} – ${got[i].a}: ${got[i].v}` : '-', '|', truthSongs[i] ? `${truthSongs[i].title} – ${truthSongs[i].artist}: ${truthSongs[i].plays}` : '-');
  console.log('\nTOP 20 SONGS correct:', songsOk);
  console.log('\nARTISTS PAGE :', gotA.map((x) => x.a + ' ' + x.v).join(' | '));
  console.log('ARTISTS TRUTH:', truthArts.slice(0, 20).map((x) => x.artist + ' ' + x.plays).join(' | '));
  console.log('TOP 20 ARTISTS correct:', artsOk);
  console.log('page errors:', errs);
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
