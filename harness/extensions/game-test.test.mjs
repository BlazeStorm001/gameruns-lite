import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createJiti } from 'jiti';
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
process.env.AGENT_EVAL_HARNESS_DIR = root;
const extension = (await createJiti(import.meta.url).import('./game-test/index.ts')).default;

test('browser launch failure preserves its cause and gives setup guidance without retrying', async () => {
  const { createBrowserSession } = await createJiti(import.meta.url).import('./game-test/browser.ts');
  const session = createBrowserSession();
  const originalLaunch = chromium.launch;
  const cause = new Error('synthetic missing Chromium executable');
  let attempts = 0;
  chromium.launch = async (options) => {
    attempts++;
    assert.deepEqual(options, {headless: true});
    throw cause;
  };
  try {
    await assert.rejects(session.runOperation('open', {url:'http://127.0.0.1:8000'}, root), error => {
      assert.equal(error.cause, cause);
      assert.match(error.message, /synthetic missing Chromium executable/);
      assert.match(error.message, /setup\.sh --install/);
      assert.match(error.message, /setup\.sh --check/);
      return true;
    });
    assert.equal(attempts, 1);
  } finally {
    chromium.launch = originalLaunch;
    await session.close();
  }
});

test('copied workspace discovers each extension once without copying tests', { timeout: 30000 }, async () => {
  const created = spawnSync('bash', [join(root, 'scripts/create-workspace.sh'),
    join(root, 'scenarios/neon-breach')], {
    encoding: 'utf8', cwd: root, env: {...process.env, ENABLE_CONTEXT7: '0'}, timeout: 10000,
  });
  assert.equal(created.status, 0, created.stderr);
  const workspace = created.stdout.trim();
  try {
    const extensionsDir = join(workspace, '.pi/extensions');
    assert.deepEqual((await readdir(extensionsDir)).sort(), ['game-test', 'generate-image.ts']);
    assert.deepEqual((await readdir(join(extensionsDir, 'game-test'))).sort(),
      ['browser.ts', 'index.ts', 'observe.ts']);
    const checked = spawnSync(process.execPath, ['--input-type=module', '--eval', `
      import assert from 'node:assert/strict';
      import { join } from 'node:path';
      import { pathToFileURL } from 'node:url';
      import { createJiti } from ${JSON.stringify(import.meta.resolve('jiti'))};
      import { discoverAndLoadExtensions } from ${JSON.stringify(new URL('./core/extensions/loader.js', import.meta.resolve('@earendil-works/pi-coding-agent')).href)};

      const loaded = await discoverAndLoadExtensions([], process.cwd(), process.env.PI_CODING_AGENT_DIR);
      assert.deepEqual(loaded.errors, []);
      assert.equal(loaded.extensions.length, 2);
      assert.deepEqual(loaded.extensions.flatMap(extension => [...extension.tools.keys()]).sort(),
        ['game_test', 'generate_image']);
      assert.deepEqual(loaded.extensions.map(extension => extension.path).sort(), [
        join(process.cwd(), '.pi/extensions/game-test/index.ts'),
        join(process.cwd(), '.pi/extensions/generate-image.ts'),
      ]);

      const jiti = createJiti(import.meta.url, {alias: {typebox: ${JSON.stringify(fileURLToPath(import.meta.resolve('typebox')))}}});
      const tools = [], handlers = [];
      const fakePi = {
        registerTool: tool => tools.push(tool),
        on: (event, handler) => { assert.equal(event, 'session_shutdown'); handlers.push(handler); },
      };
      for (const entry of loaded.extensions) {
        const factory = (await jiti.import(pathToFileURL(entry.path).href)).default;
        await factory(fakePi);
      }
      assert.deepEqual(tools.map(tool => tool.name).sort(), ['game_test', 'generate_image']);
      assert.equal(handlers.length, 1);
      const gameTest = tools.find(tool => tool.name === 'game_test');
      const ctx = {cwd: process.cwd()};
      await assert.rejects(gameTest.execute('test', {operation:'observe'}, undefined, undefined, ctx),
        /No game page is open/);
      const closed = await gameTest.execute('test', {operation:'close'}, undefined, undefined, ctx);
      assert.deepEqual(closed.details, {operation:'close'});
      await handlers[0]();
      console.log('Copied-workspace discovery and fake-Pi loading passed.');
    `], {
      encoding: 'utf8', cwd: workspace, timeout: 20000,
      env: {
        ...process.env,
        AGENT_EVAL_HARNESS_DIR: root,
        PI_CODING_AGENT_DIR: join(root, '.runtime/pi-agent'),
        PLAYWRIGHT_BROWSERS_PATH: join(root, '.runtime/browsers'),
        PI_SKIP_VERSION_CHECK: '1', PI_TELEMETRY: '0',
      },
    });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
  } finally {
    await rm(workspace, {recursive: true, force: true});
  }
});

test('registered tool observes a synthetic browser fixture', { timeout: 60000 }, async () => {
  let tool, shutdown, otherTool, otherShutdown;
  extension({ registerTool: value => { tool = value; }, on: (_, fn) => { shutdown = fn; } });
  extension({ registerTool: value => { otherTool = value; }, on: (_, fn) => { otherShutdown = fn; } });
  let version = 1;
  let contextUsage;
  let fixturePage;
  let screenshotEvent = false;
  let screenshotFailure = false;
  let screenshotOverflow = false;
  const originalLaunch = chromium.launch;
  chromium.launch = async function (...args) {
    const browser = await originalLaunch.apply(this, args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...args) => {
      const context = await newContext(...args);
      const newPage = context.newPage.bind(context);
      context.newPage = async (...args) => {
        const page = await newPage(...args);
        fixturePage = page;
        const screenshot = page.screenshot.bind(page);
        page.screenshot = async (...args) => {
          if (screenshotEvent) await page.evaluate(() => console.error('duplicate'));
          if (screenshotOverflow) {
            await page.evaluate(() => {
              for (let index = 0; index < 12; index++) {
                console.error(`screenshot overflow ${index}`);
              }
              console.error('duplicate');
            });
          }
          if (screenshotFailure) throw Error('synthetic screenshot failure');
          return screenshot(...args);
        };
        return page;
      };
      return context;
    };
    return browser;
  };
  const server = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>Fixture</title><body>fixture

      <script>
      let mode='sync', count=0;
      const shared={ok:true};
      window.__gameTest={
        snapshot(){if(mode==='error')throw Error('snapshot failure');
          const value={version:${version},count,shared:[shared,shared],long:'x'.repeat(600),array:Array(50).fill(0),object:Object.fromEntries(Array.from({length:70},(_,i)=>['k'+i,i])),deep:{a:{b:{c:{d:{e:1}}}}}};
          return mode==='async'?Promise.resolve(value):value},
        actions(){if(mode==='error')return Promise.reject(Error('actions failure')); return mode==='async'?Promise.resolve(['start']):['start']},
        act(action){if(action==='errors'){console.error('duplicate');console.error('duplicate')}
          else if(action==='overflow'){for(let i=0;i<20;i++) console.error('event'+i+'x'.repeat(1200)+'tail'+i)}
          else if(action==='dedup'){console.error('normalized   text');console.error('normalized text');console.warn('normalized text');console.error('z'.repeat(1200)+'a');console.error('z'.repeat(1200)+'b');console.error('z'.repeat(1200)+'a');console.error('s'.repeat(1000))}
          else if(action==='no-reset'){delete window.__gameTest.reset;console.error('before fallback reload')}

          else mode=action},
        reset(){count++}
      };
      </script></body>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const run = async (operation, extra = {}) => {
    const result = await tool.execute('test', { operation, settleMs: 0, screenshot: false, ...extra }, undefined, undefined, { cwd: root, getContextUsage: () => contextUsage });
    assert.doesNotMatch(JSON.stringify(result), /\b(?:canvases|controls|pixelStats)\b/);
    return result;
  };
  const obs = result => result.details.observation;
  try {
    const schema = JSON.stringify(tool.parameters);
    assert.deepEqual(tool.parameters.properties.operation.anyOf.map(value => value.const), [
      'open', 'observe', 'key', 'click', 'action', 'step', 'wait', 'reset', 'reload', 'close',
    ]);
    assert.doesNotMatch(schema, /\b(?:canvases|controls|pixelStats)\b/);
    assert.doesNotMatch([tool.description, ...tool.promptGuidelines].join('\n'), /\b(?:canvases|controls|pixelStats)\b/);
    let value = obs(await run('open', { url: `http://127.0.0.1:${server.address().port}` }));
    assert.equal(value.gameTest.snapshot.version, 1);
    assert.deepEqual(value.gameTest.actions, ['start']);
    assert.deepEqual(value.gameTest.snapshot.shared, [{ok:true},{ok:true}]);
    assert.equal(value.url, `http://127.0.0.1:${server.address().port}/`);
    assert.equal(value.title, 'Fixture');
    assert.equal(value.bodyText, 'fixture');
    assert.equal(value.gameTest.snapshot.long, 'x'.repeat(600));
    assert.deepEqual(value.gameTest.snapshot.array, Array(50).fill(0));
    assert.deepEqual(value.gameTest.snapshot.object, Object.fromEntries(Array.from({length:70}, (_,i) => ['k'+i,i])));
    assert.equal(value.gameTest.snapshot.deep.a.b.c.d.e, 1);
    assert.deepEqual(value.truncation, {});

    value = obs(await run('act', { action:'async' }));
    assert.deepEqual(value.gameTest.actions, ['start']);
    assert.equal(value.gameTest.snapshot.version, 1);
    const shot = await run('snapshot', { screenshot: undefined });
    assert.equal(shot.details.operation, 'observe');
    assert.equal(shot.content[1].type, 'image');

    value = obs(await run('action', {action:'error'}));
    assert.match(value.gameTest.snapshotError, /snapshot failure/);
    assert.match(value.gameTest.actionsError, /actions failure/);
    await run('action', {action:'sync'});
    await fixturePage.evaluate(() => {
      window.savedHooks = { ...window.__gameTest };
      const shared = {long:'x'.repeat(4000)};
      const deep = Array.from({length:40}).reduce(value => ({child:value}), {leaf:true});
      const full = {shared:[shared,shared], array:Array(2500).fill(7), deep};
      window.__gameTest.snapshot = () => full;
    });
    const fullResult = await run('observe');
    const full = obs(fullResult).gameTest.snapshot;
    assert.deepEqual(full.shared, [{long:'x'.repeat(4000)}, {long:'x'.repeat(4000)}]);
    assert.deepEqual(full.array, Array(2500).fill(7));
    let leaf = full.deep;
    for (let depth = 0; depth < 40; depth++) leaf = leaf.child;
    assert.deepEqual(leaf, {leaf:true});
    assert.deepEqual(JSON.parse(fullResult.content[0].text).gameTest.snapshot, full);
    assert.deepEqual(obs(fullResult).truncation, {});
    for (const expression of [
      'undefined', '1n', '(()=>{})', 'Symbol("bad")',
      '(()=>{const x={};x.self=x;return x})()',
      '({get value(){throw Error("must not invoke getter")}})',
    ]) {
      await fixturePage.evaluate(expression => {
        const invalid = () => (0, eval)(expression);
        window.__gameTest.snapshot = invalid;
        window.__gameTest.actions = async () => invalid();
      }, expression);
      contextUsage = {contextWindow:1};
      const result = await run('observe');
      assert.equal(obs(result).gameTest.snapshot, null);
      assert.equal(obs(result).gameTest.actions, null);
      assert.ok(obs(result).gameTest.snapshotError);
      assert.ok(obs(result).gameTest.actionsError);
      assert.equal(result.content.length, 1);
    }
    contextUsage = undefined;
    await fixturePage.evaluate(() => {
      const value = () => ({
        omitted: undefined,
        number: NaN,
        date: new Date('2026-01-01T00:00:00.000Z'),
        map: new Map(),
        set: new Set(),
        sparse: [,],
        get computed() { return 42; },
      });
      window.__gameTest.snapshot = value;
      window.__gameTest.actions = async () => value();
    });
    value = obs(await run('observe'));
    const serialized = {
      number: null,
      date: '2026-01-01T00:00:00.000Z',
      map: {},
      set: {},
      sparse: [null],
      computed: 42,
    };
    assert.deepEqual(value.gameTest.snapshot, serialized);
    assert.deepEqual(value.gameTest.actions, serialized);
    assert.equal(value.gameTest.snapshotError, null);
    assert.equal(value.gameTest.actionsError, null);
    await fixturePage.evaluate(() => {
      window.__gameTest.snapshot = async () => { throw Error('async snapshot failure'); };
      window.__gameTest.actions = () => { throw Error('sync actions failure'); };
    });
    value = obs(await run('observe'));
    assert.match(value.gameTest.snapshotError, /async snapshot failure/);
    assert.match(value.gameTest.actionsError, /sync actions failure/);
    await fixturePage.evaluate(() => {
      window.__gameTest.snapshot = () => 'x'.repeat(22);
      window.__gameTest.actions = () => Array(2100).fill('a'.repeat(600));
    });
    contextUsage = {contextWindow:12}; // JSON string length 24 => six estimated tokens.
    assert.equal((await run('observe')).content.length, 1);
    contextUsage = {contextWindow:10};
    let warned = await run('observe', {screenshot:true});
    assert.deepEqual(warned.content.map(block => block.type), ['text', 'text', 'image']);
    assert.equal(warned.content[0].text, 'Warning: this game snapshot is approximately 6 tokens, more than 50% of the configured 10-token context window.');
    assert.equal(JSON.parse(warned.content[1].text).gameTest.snapshot, 'x'.repeat(22));
    assert.deepEqual(obs(warned).gameTest.actions, Array(2100).fill('a'.repeat(600)));
    for (const usage of [undefined, {}, {contextWindow:0}, {contextWindow:-1}, {contextWindow:NaN}, {contextWindow:Infinity}, {contextWindow:'10'}]) {
      contextUsage = usage;
      assert.equal((await run('observe')).content.length, 1);
    }
    await fixturePage.evaluate(() => {
      window.__gameTest.snapshot = () => 'x'.repeat(191998);
    });
    contextUsage = {contextWindow:90000};
    warned = await run('observe');
    assert.equal(warned.content[0].text, 'Warning: this game snapshot is approximately 48,000 tokens, more than 50% of the configured 90,000-token context window.');
    assert.equal(JSON.parse(warned.content[1].text).gameTest.snapshot.length, 191998);
    contextUsage = undefined;
    await fixturePage.evaluate(() => Object.assign(window.__gameTest, window.savedHooks));
    value = obs(await run('act', {action:'errors'}));
    assert.equal(value.browserEvents.length, 1);
    const event = value.browserEvents[0];
    assert.deepEqual(event, {kind:'console.error', text:'duplicate', count:2});
    assert.deepEqual(obs(await run('observe')).browserEvents, []);
    screenshotEvent = true;
    value = obs(await run('act', {action:'errors', screenshot:true}));
    assert.equal(value.browserEvents[0].count, 2);
    screenshotEvent = false;
    const late = obs(await run('observe')).browserEvents;
    assert.equal(late.length, 1); assert.equal(late[0].count, 1);
    assert.deepEqual(late[0], {kind:'console.error', text:'duplicate', count:1});
    screenshotOverflow = true;
    value = obs(await run('act', {action:'errors', screenshot:true}));
    screenshotOverflow = false;
    assert.equal(value.browserEvents[0].count, 2);
    const recreated = obs(await run('observe'));
    assert.equal(recreated.browserEvents.length, 12);
    assert.ok(recreated.browserEvents.every(e => e.count > 0));

    assert.deepEqual(
      recreated.browserEvents.map(e => ({text: e.text, count: e.count})),
      [
        ...Array.from({length: 11}, (_, index) => ({
          text: `screenshot overflow ${index + 1}`,
          count: 1,
        })),
        {text: 'duplicate', count: 1},
      ],
    );
    assert.equal(recreated.browserEventInfo.dropped, 1);
    const consumed = obs(await run('observe'));
    assert.deepEqual(consumed.browserEvents, []);
    assert.equal(consumed.browserEventInfo.dropped, 0);
    screenshotFailure = true;
    await assert.rejects(run('act', {action:'errors', screenshot:true}), /synthetic screenshot failure/);
    screenshotFailure = false;
    assert.deepEqual(obs(await run('observe')).browserEvents, []);
    screenshotFailure = screenshotEvent = true;
    await assert.rejects(run('act', {action:'errors', screenshot:true}), /synthetic screenshot failure/);
    screenshotFailure = screenshotEvent = false;
    assert.deepEqual(obs(await run('observe')).browserEvents, [{kind:'console.error', text:'duplicate', count:1}]);
    value = obs(await run('act', {action:'dedup'}));
    assert.deepEqual(value.browserEvents, [
      {kind:'console.error', text:'normalized text', count:2},
      {kind:'console.warning', text:'normalized text', count:1},
      {kind:'console.error', text:'z'.repeat(500) + ' ... [truncated] ... ' + 'z'.repeat(499) + 'a', count:2},
      {kind:'console.error', text:'z'.repeat(500) + ' ... [truncated] ... ' + 'z'.repeat(499) + 'b', count:1},
      {kind:'console.error', text:'s'.repeat(1000), count:1},
    ]);
    value = obs(await run('act', {action:'overflow'}));
    assert.equal(value.browserEvents.length, 12);
    assert.equal(value.browserEventInfo.dropped, 8);
    assert.equal(value.browserEventInfo.limit, 12);
    assert.ok(value.browserEvents.every(e => e.text.length === 1000 + ' ... [truncated] ... '.length));
    assert.ok(value.browserEvents.every(e => e.text.includes(' ... [truncated] ... ')));
    assert.ok(value.browserEvents[0].text.endsWith('tail8'));
    assert.ok(value.browserEvents[11].text.endsWith('tail19'));
    assert.ok(value.browserEvents[0].text.startsWith('event8'));
    assert.ok(value.browserEvents[11].text.startsWith('event19'));
    value = obs(await run('observe'));
    assert.deepEqual(value.browserEvents, []);
    assert.equal(value.browserEventInfo.dropped, 0);

    version = 2;
    value = obs(await run('reset'));
    assert.equal(value.gameTest.snapshot.version, 1); assert.equal(value.gameTest.snapshot.count, 1);
    value = obs(await run('reload'));
    assert.equal(value.gameTest.snapshot.version, 2); assert.equal(value.gameTest.snapshot.count, 0);
    value = obs(await run('act', {action:'errors'}));
    assert.deepEqual(value.browserEvents, [event]);
    assert.deepEqual(obs(await run('reset')).browserEvents, []);
    for (const operation of ['reload', 'reset', 'open', 'close']) {
      screenshotOverflow = true;
      await run('observe', {screenshot:true});
      screenshotOverflow = false;
      if (operation === 'reset') {
        screenshotEvent = true;
        await run('act', {action:'no-reset', screenshot:true});
        screenshotEvent = false;
      }
      const result = await run(operation, operation === 'open' ? {url:`http://127.0.0.1:${server.address().port}`} : {});
      const cleared = operation === 'close'
        ? obs(await run('open', {url:`http://127.0.0.1:${server.address().port}`}))
        : obs(result);
      assert.deepEqual(cleared.browserEvents, []);
      assert.equal(cleared.browserEventInfo.dropped, 0);
    }

    const runOther = (operation, extra = {}) => otherTool.execute('other', {
      operation, settleMs: 0, screenshot: false, ...extra,
    }, undefined, undefined, {cwd: root});
    await assert.rejects(runOther('observe'), /No game page is open/);
    const firstPage = fixturePage;
    await firstPage.evaluate(() => {
      for (let index = 0; index < 20; index++) console.error(`first instance ${index}`);
    });
    await runOther('open', {url:`http://127.0.0.1:${server.address().port}`});
    await fixturePage.evaluate(() => console.error('second instance'));
    const first = obs(await run('observe'));
    assert.equal(first.browserEventInfo.dropped, 8);
    assert.deepEqual(first.browserEvents.map(event => event.text),
      Array.from({length: 12}, (_, index) => `first instance ${index + 8}`));
    assert.deepEqual(obs(await runOther('observe')).browserEvents,
      [{kind:'console.error', text:'second instance', count:1}]);
    await shutdown();
    assert.equal(obs(await runOther('observe')).gameTest.snapshot.version, 2);
    await assert.rejects(run('observe'), /No game page is open/);
  } finally {
    chromium.launch = originalLaunch;
    await shutdown();
    await otherShutdown();
    await new Promise(resolve => server.close(resolve));
  }
});
