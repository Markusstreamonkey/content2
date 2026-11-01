const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const nova = JSON.parse(fs.readFileSync(process.argv[2] || __dirname + '/nova.json', 'utf8'));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.exposeFunction('__nova', () => nova);
  await p.addInitScript(() => {
    const streams = [{ id: 'c517c3ab-9980-489b-b71d-adea99457d20', name: 'Nova 96.9', enabled: true, group_ids: [] }];
    const mcp = { callTool: async (srv, tool, input) => {
      let payload;
      if (tool.endsWith('list_streams')) payload = { items: streams };
      else if (tool.endsWith('list_stream_groups')) payload = { items: [] };
      else if (tool.endsWith('get_stream_timeline')) payload = await window.__nova();
      else payload = { tracks: [], songs: [] };
      return { content: [], payload };
    } };
    window.claude = { use: async () => mcp };
  });
  const html = '<!doctype html><html><head><meta charset=utf8></head><body>' + fs.readFileSync(__dirname + '/../index.html', 'utf8') + '</body></html>';
  fs.writeFileSync('real.html', html); await p.goto('file://' + process.cwd() + '/real.html');
  await p.waitForTimeout(500);
  await p.click('#pick'); await p.check('#st-c517c3ab-9980-489b-b71d-adea99457d20'); await p.click('.brand');
  await p.evaluate(() => { const R = Date.parse('2026-11-01T20:00:00Z'); const realNow = Date.now; Date.now = () => R; }); await p.click('#d1'); await p.click('#run');
  await p.waitForFunction(() => /Sendeablauf/.test((document.querySelector('.note') || {}).textContent || ''), null, { timeout: 60000 });
  const rows = await p.$$eval('.grid2 .panel:nth-of-type(1) .row', rs => rs.map(r => r.querySelector('.a').textContent + ' | ' + r.querySelector('.t').textContent + ' | ' + r.querySelector('.fig b').textContent));
  console.log(JSON.stringify(rows.slice(0, 8), null, 1));
  console.log('total', await p.$eval('.strip', s => s.textContent)); console.log('errors', errs);
  await b.close();
})();
