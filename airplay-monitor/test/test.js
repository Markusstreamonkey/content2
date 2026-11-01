const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|net::/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.addInitScript({ path: __dirname + '/mock.js' });
  const html = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>' + fs.readFileSync(__dirname + '/../index.html', 'utf8') + '</body></html>';
  fs.writeFileSync('page.html', html);
  await p.goto('file://' + process.cwd() + '/page.html');
  // fleet mode loads automatically
  await p.waitForSelector('text=Top 20 Songs', { timeout: 60000 });
  const songRows = await p.$$eval('section.panel:nth-of-type(1) .row', rs => rs.map(r => [r.querySelector('.t').textContent, r.querySelector('.a') && r.querySelector('.a').textContent, r.querySelector('.fig b').textContent, r.querySelector('.fig small').textContent]));
  const artRows = await p.$$eval('.grid2 section.panel:nth-of-type(2) .row', rs => rs.map(r => [r.querySelector('.t').textContent, r.querySelector('.fig b').textContent]));
  // ground truth over the same window as the page (7 days back from 15-min floor)
  const truth = await p.evaluate(() => {
    const to = Math.floor(Date.now() / 9e5) * 9e5, from = to - 7 * 864e5;
    const m = new Map(), a = new Map();
    for (const x of window.__truth.plays) if (x.at >= from && x.at < to) { const k = x.title + ' — ' + x.artist; m.set(k, (m.get(k) || 0) + 1); a.set(x.artist, (a.get(x.artist) || 0) + 1); }
    return { songs: [...m].sort((x, y) => y[1] - x[1]).slice(0, 20), artists: [...a].sort((x, y) => y[1] - x[1]).slice(0, 12), calls: window.__calls.length };
  });
  console.log('FLEET songs (page):', songRows.length); console.log(songRows.slice(0, 8));
  console.log('TRUTH songs:', truth.songs.slice(0, 8));
  const pageSet = songRows.map(r => r[0] + ' — ' + r[1] + '=' + r[2].replace(/\./g, ''));
  const truthSet = truth.songs.map(([k, v]) => k + '=' + v);
  console.log('songs exact match top20:', JSON.stringify(pageSet) === JSON.stringify(truthSet), 'missing:', truthSet.filter(x => !pageSet.includes(x)));
  console.log('ARTISTS page:', artRows.length, artRows.slice(0, 5)); console.log('TRUTH artists:', truth.artists.slice(0, 5));
  console.log('calls for fleet:', truth.calls);
  await p.screenshot({ path: 'fleet.png', fullPage: false });
  // drill: song
  await p.click('.grid2 section.panel:nth-of-type(1) .row >> nth=0');
  await p.waitForSelector('text=Plays je Sender', { timeout: 30000 });
  await p.waitForSelector('text=Katalog', { timeout: 30000 });
  await p.waitForSelector('.chartbox svg rect', { timeout: 30000 });
  console.log('SONG kpis:', await p.$$eval('.kpis > div', d => d.map(x => x.textContent)));
  console.log('SONG chart bars:', await p.$$eval('.chartbox svg rect', r => r.length), 'stations rows:', await p.$$eval('.grid2 section:nth-of-type(2) .row', r => r.length));
  console.log('SONG facts:', (await p.$$eval('.facts > div', d => d.map(x => x.textContent))).slice(0, 5));
  await p.screenshot({ path: 'song.png', fullPage: true });
  // drill: artist via byline
  await p.click('.hero .by button');
  await p.waitForSelector('text=Titel', { timeout: 30000 });
  await p.waitForFunction(() => document.querySelectorAll('.grid2 section:nth-of-type(1) .row').length > 0, null, { timeout: 30000 });
  console.log('ARTIST kpis:', await p.$$eval('.kpis > div', d => d.map(x => x.textContent)));
  console.log('ARTIST titles:', (await p.$$eval('.grid2 section:nth-of-type(1) .row', r => r.map(x => x.querySelector('.t').textContent + ' ' + x.querySelector('.fig b').textContent))).slice(0, 4));
  // drill: station from artist station list
  await p.waitForFunction(() => document.querySelectorAll('.grid2 section:nth-of-type(2) .row').length > 0, null, { timeout: 30000 });
  await p.click('.grid2 section:nth-of-type(2) .row >> nth=0');
  await p.waitForSelector('text=Musik-Plays', { timeout: 60000 });
  console.log('STATION crumbs:', await p.$eval('.crumbs', c => c.textContent));
  console.log('STATION kpis:', await p.$$eval('.kpis > div', d => d.map(x => x.textContent)));
  await p.screenshot({ path: 'station.png', fullPage: true });
  // back to charts via crumb, then station selection mode
  await p.click('.crumbs button >> text=Charts');
  await p.click('#pick');
  await p.click('.pop .groups button');
  await p.click('h1');
  console.log('chips:', await p.$$eval('.chip', c => c.map(x => x.textContent)));
  await p.click('#d1');
  await p.click('#run');
  await p.waitForFunction(() => document.querySelector('.note') && /Sendeablauf/.test(document.querySelector('.note').textContent), null, { timeout: 60000 });
  const selSongs = await p.$$eval('.grid2 section.panel:nth-of-type(1) .row', rs => rs.map(r => r.querySelector('.t').textContent + ' ' + r.querySelector('.fig b').textContent));
  const selTruth = await p.evaluate(() => {
    const to = Math.floor(Date.now() / 9e5) * 9e5, from = to - 864e5; const ids = new Set(['st-000','st-001','st-002','st-003','st-004']);
    const m = new Map(); for (const x of window.__truth.plays) if (ids.has(x.stream_id) && x.at >= from && x.at < to) m.set(x.title, (m.get(x.title) || 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => k + ' ' + v);
  });
  console.log('SELECTION page:', selSongs.slice(0, 5)); console.log('SELECTION truth:', selTruth);
  console.log('strip:', await p.$eval('.strip', s => s.textContent));
  await p.screenshot({ path: 'selection.png' });
  // phone width + dark
  await p.setViewportSize({ width: 390, height: 844 });
  await p.emulateMedia({ colorScheme: 'dark' });
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  console.log('phone horizontal overflow:', ov);
  await p.screenshot({ path: 'phone-dark.png' });
  console.log('ERRORS:', errs);
  await b.close();
})().catch(e => { console.error('TEST FAILED', e); process.exit(1); });
