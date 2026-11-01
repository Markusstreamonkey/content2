// Test-only mock of window.claude.use("mcp") reproducing the observed aireal tool shapes,
// including the 200-row cap of broad song_airplay queries (rows sorted plays desc, artist asc).
(() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const streams = Array.from({ length: 60 }, (_, i) => ({
    id: "st-" + String(i).padStart(3, "0"), name: (i < 5 ? "Testwelle Region " + (i + 1) : "Teststation " + (i + 1)),
    enabled: true, group_ids: i < 5 ? ["g1"] : [],
  }));
  const groups = [{ id: "g1", name: "Testwelle Regionen Kombi", stream_count: 5, simulcast: true }];
  // songs: a few broad hits (many stations, low rotation each) + power rotation on few stations + long tail
  const songs = [];
  const artists = ["Alpha Nord", "Beta Süd", "Cora Lind", "Dana Ost", "Emil West", "Fiona Berg", "Gus Tal", "Hanna Moor", "Ida Feld", "Jon Bach", "Kim Hain", "Lou Rand"];
  for (let i = 0; i < 120; i++) songs.push({ artist: artists[i % artists.length], title: "Titel " + (i + 1) });
  const now = Date.now();
  const plays = [];
  streams.forEach((s, si) => {
    for (let k = 0; k < 7 * 24 * 12; k++) { // ~12 songs/hour/station over 7 days
      const t = now - 7 * 864e5 + k * 300e3 + rnd() * 60e3;
      let idx;
      const r = rnd();
      if (r < 0.25) idx = Math.floor(rnd() * 6);            // broad hits 1-6 on every station
      else if (r < 0.40) idx = 6 + (si % 5);                  // power rotation per station cluster
      else idx = 11 + Math.floor(rnd() * 109);                // long tail
      plays.push({ stream_id: s.id, stream: s.name, artist: songs[idx].artist, title: songs[idx].title, at: t, dur: 200e3 });
    }
  });
  const inRange = (p, from, to) => p.at >= Date.parse(from || 0) && p.at < Date.parse(to || "2100-01-01");
  const iso = (t) => new Date(t).toISOString();
  function airplay(inp) {
    if (!inp.artist && !inp.title && !inp.song_id) throw { code: "tool_error", message: "at least one of artist/title/song_id is required" };
    const a = (inp.artist || "").toLowerCase(), ti = (inp.title || "").toLowerCase();
    const sel = plays.filter((p) => inRange(p, inp.from, inp.to) && p.artist.toLowerCase().includes(a) && p.title.toLowerCase().includes(ti));
    const byArtist = inp.group_by === "artist";
    const rows = new Map();
    for (const p of sel) {
      const k = (byArtist ? p.artist : p.artist + "|" + p.title) + "|" + p.stream_id;
      const r = rows.get(k) || { artist: p.artist, title: p.title, stream_id: p.stream_id, stream: p.stream, plays: 0, first: p.at, last: p.at, titles: new Set() };
      r.plays++; r.first = Math.min(r.first, p.at); r.last = Math.max(r.last, p.at); r.titles.add(p.title); rows.set(k, r);
    }
    const capped = [...rows.values()].sort((x, y) => y.plays - x.plays || x.artist.localeCompare(y.artist)).slice(0, 200);
    const ents = new Map();
    for (const r of capped) {
      const k = byArtist ? r.artist : r.artist + "|" + r.title;
      const e = ents.get(k) || { artist: r.artist, ...(byArtist ? {} : { title: r.title }), total_plays: 0, stations: 0, first_played_at: iso(r.first), last_played_at: iso(r.last), per_station: [], spellings: [r.artist], _t: new Set() };
      e.total_plays += r.plays; e.stations++; r.titles.forEach((x) => e._t.add(x));
      if (iso(r.first) < e.first_played_at) e.first_played_at = iso(r.first);
      if (iso(r.last) > e.last_played_at) e.last_played_at = iso(r.last);
      e.per_station.push({ stream_id: r.stream_id, stream: r.stream, plays: r.plays, seconds: r.plays * 200, station_kind: "stream" });
      ents.set(k, e);
    }
    const tracks = [...ents.values()].map((e) => { if (byArtist) e.tracks = e._t.size; delete e._t; return e; });
    return { from: inp.from, to: inp.to, group_by: inp.group_by || "track", note: "mock", tracks };
  }
  function timeline(inp) {
    const sel = plays.filter((p) => p.stream_id === inp.stream_id && inRange(p, inp.from, inp.to)).sort((a, b) => a.at - b.at);
    const blocks = [];
    for (const p of sel) {
      blocks.push({ type: "music", from: iso(p.at), to: iso(p.at + 150e3), label: p.artist + " – " + p.title, meta: { artist: p.artist, title: p.title, source: "icy" } });
      blocks.push({ type: "speech", from: iso(p.at + 150e3), to: iso(p.at + 200e3), label: "editorial", meta: { text: "…" } });
    }
    // simulate a song split by a speech clip: duplicate block 1 minute later for every 10th play
    sel.forEach((p, i) => { if (i % 10 === 0) blocks.push({ type: "music", from: iso(p.at + 160e3), to: iso(p.at + 190e3), label: "", meta: { artist: p.artist, title: p.title } }); });
    return { blocks, count: blocks.length, stream_id: inp.stream_id };
  }
  function searchSongs(inp) {
    let list = songs.map((s, i) => ({ id: "song-" + i, artist: s.artist, title: s.title, stations: Math.max(1, 60 - i), disputes: 0, bpm: 90 + (i % 40), length_secs: 180 + i, first_release_year: 2000 + (i % 25), isrcs: ["DEXX" + (1000 + i)], genres: ["pop", "dance-pop"], spotify_track_id: "abc" + i, danceability: 0.6, energy: 0.7, valence: 0.4, acousticness: 0.1, loudness_db: -6.2, musical_key: i % 12, musical_mode: i % 2 }));
    if (inp.artist) list = list.filter((s) => s.artist.toLowerCase().includes(inp.artist.toLowerCase()));
    if (inp.title) list = list.filter((s) => s.title.toLowerCase().includes(inp.title.toLowerCase()));
    return { count: Math.min(list.length, inp.limit || 25), songs: list.slice(0, inp.limit || 25) };
  }
  const handlers = {
    "ad-fingerprinting_song_airplay": airplay,
    "ad-fingerprinting_get_stream_timeline": timeline,
    "ad-fingerprinting_search_songs": searchSongs,
    "ad-fingerprinting_list_streams": () => ({ count: streams.length, items: streams }),
    "ad-fingerprinting_list_stream_groups": () => ({ count: 1, items: groups }),
  };
  window.__calls = [];
  window.__truth = { plays };
  const mcp = {
    callTool: async (server, tool, input) => {
      window.__calls.push(tool);
      if (server !== "aireal Live Platform MCP") throw { code: "server_not_connected", message: "no such server" };
      await new Promise((r) => setTimeout(r, 5));
      const payload = handlers[tool](input || {});
      return { content: [{ type: "text", text: JSON.stringify(payload) }], payload };
    },
  };
  window.claude = { use: async (n) => (n === "mcp" ? mcp : null) };
})();
