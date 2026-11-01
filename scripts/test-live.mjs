// The live run: a real Obsidian, launched with a throwaway profile and a throwaway vault holding
// the built plugin and examples/view-toggle.md, driven over the Chrome DevTools Protocol. Covers
// what the unit tests cannot: the processor in Reading view and Live Preview, attributes
// recovered from the note, the worker inside Obsidian, and the toggle's persistence across
// re-render, reopen and plugin reload.
//
// Usage: npm run build && npm run test:live
// Set OBSIDIAN_EXECUTABLE to use an Obsidian other than /Applications/Obsidian.app.
// Screenshots (light and dark, both views) are written to the directory it prints.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'smiles';
const FIXTURE = {
  file: 'examples/view-toggle.md',
  /** smiles and smarts blocks in the note, in document order. */
  fences: 12,
  /** Positions of the two blocks with identical bodies. */
  twins: [5, 6],
  /** Position of the block whose one line does not parse. */
  broken: 3,
  /** Position of the empty block. */
  empty: 11,
  /** Position of the three-line block whose middle line does not parse. */
  partly: 10
};
/** Blocks whose whole slot is an error card. */
const ERRORS = [FIXTURE.broken, FIXTURE.empty];
const EXECUTABLE = process.env.OBSIDIAN_EXECUTABLE ?? '/Applications/Obsidian.app/Contents/MacOS/Obsidian';

const manifest = JSON.parse(await readFile('manifest.json', 'utf8'));
const root = await mkdtemp(join(tmpdir(), `${BASE}-live-`));
const vault = join(root, 'vault');
const shots = join(root, 'screenshots');
const pluginDir = join(vault, '.obsidian', 'plugins', manifest.id);
await mkdir(pluginDir, { recursive: true });
await mkdir(shots);
for (const file of ['main.js', 'manifest.json', 'styles.css']) await cp(file, join(pluginDir, file));
await cp(FIXTURE.file, join(vault, 'view-toggle.md'));
await writeFile(join(vault, 'other.md'), '# Another note\n');
await writeFile(join(vault, '.obsidian', 'community-plugins.json'), JSON.stringify([manifest.id]));
await writeFile(join(vault, '.obsidian', 'app.json'), JSON.stringify({ defaultViewMode: 'preview', livePreview: true }));

const app = spawn(EXECUTABLE, [`--user-data-dir=${join(root, 'profile')}`, '--remote-debugging-port=0'], { stdio: ['ignore', 'ignore', 'pipe'] });
const endpoint = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Obsidian did not open a DevTools port')), 30000);
  app.stderr.on('data', (chunk) => {
    const found = /DevTools listening on (ws:\/\/\S+)/.exec(String(chunk));
    if (found) { clearTimeout(timer); resolve(found[1]); }
  });
  app.on('exit', (code) => reject(new Error(`Obsidian exited with ${code}`)));
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let browser;
let page;
const checks = [];
async function check(name, body) {
  await body();
  checks.push(name);
  console.log(`ok ${checks.length} - ${name}`);
}

/** The window whose URL contains `fragment`, once it exists. */
async function windowWith(fragment) {
  for (let i = 0; i < 120; i++) {
    const found = browser.contexts().flatMap((context) => context.pages()).find((p) => p.url().includes(fragment));
    if (found) return found;
    await sleep(250);
  }
  throw new Error(`no window at ${fragment}`);
}

/** Wrapper states in document order: view, key, and what the rendering slot holds. */
const state = (scope) => page.evaluate(({ base, scope }) => {
  const container = scope === 'live'
    ? app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-source-view')
    : app.workspace.activeLeaf.view.containerEl.querySelector('.markdown-reading-view');
  return [...container.querySelectorAll(`.${base}-fence`)].map((fence) => {
    const slot = fence.querySelector(`.${base}-rendering`);
    return {
      view: fence.getAttribute('data-view') ?? 'rendering',
      key: fence.getAttribute('data-fence-key'),
      holds: slot.querySelector(`svg.${base}`) ? 'diagram'
        : slot.querySelector(`.${base}-error`) ? 'error'
        : slot.querySelector(`.${base}-loading`) ? 'loading' : 'empty',
      structures: slot.querySelectorAll(`svg.${base}`).length,
      patterns: slot.querySelectorAll(`svg.${base}.smarts`).length,
      cellErrors: slot.querySelectorAll(`.${base}-molecule > .${base}-error`).length,
      labels: [...slot.querySelectorAll(`.${base}-label`)].map((label) => label.textContent),
      cards: [...slot.querySelectorAll(`svg.${base}`)].map((svg) => getComputedStyle(svg).backgroundColor),
      filters: [...slot.querySelectorAll(`svg.${base}`)].map((svg) => getComputedStyle(svg).filter),
      language: fence.querySelector(':scope > pre > code')?.className ?? null,
      caption: slot.querySelector('figcaption')?.textContent ?? null,
      align: [...(slot.querySelector('figure')?.classList ?? [])].find((name) => name.startsWith(`${base}-align-`)) ?? null,
      alt: slot.querySelector('[role="img"]')?.getAttribute('aria-label') ?? null,
      error: slot.querySelector(`.${base}-error pre`)?.textContent ?? null,
      sourceShown: getComputedStyle(fence.querySelector(':scope > pre')).display !== 'none',
      renderingShown: getComputedStyle(slot).display !== 'none'
    };
  });
}, { base: BASE, scope });

/** Reading view renders sections lazily; scroll through so every block is drawn, and wait until none is loading. */
async function settle(scope, count = FIXTURE.fences) {
  for (let i = 0; i < 80; i++) {
    await page.evaluate((scope) => {
      const view = app.workspace.activeLeaf.view;
      const scroller = scope === 'live'
        ? view.containerEl.querySelector('.cm-scroller')
        : view.containerEl.querySelector('.markdown-preview-view');
      scroller.scrollTop = scroller.scrollHeight;
    }, scope);
    await sleep(100);
    const fences = await state(scope);
    if (fences.length === count && fences.every((fence) => fence.holds !== 'loading' && fence.holds !== 'empty')) {
      return fences;
    }
  }
  const last = await state(scope);
  throw new Error(`${scope}: expected ${count} settled blocks, have ${JSON.stringify(last.map((fence) => fence.holds))}`);
}

const click = (scope, position) => page.evaluate(({ base, scope, position }) => {
  const selector = scope === 'live' ? '.markdown-source-view' : '.markdown-reading-view';
  const container = app.workspace.activeLeaf.view.containerEl.querySelector(selector);
  const button = container.querySelectorAll(`.${base}-fence > .${base}-toggle`)[position];
  button.scrollIntoView({ block: 'center' });
  const rect = button.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  return { x, y, hit: hit === button || button.contains(hit) ? null : `${hit?.tagName}.${hit?.className}` };
}, { base: BASE, scope, position }).then(async ({ x, y, hit }) => {
  if (hit) throw new Error(`block ${position}'s toggle is covered by ${hit}`);
  await page.mouse.click(x, y);
  await sleep(50);
});

const setMode = (mode) => page.evaluate(async (mode) => {
  const leaf = app.workspace.activeLeaf;
  const viewState = leaf.getViewState();
  viewState.state.mode = mode === 'live' ? 'source' : 'preview';
  viewState.state.source = false;
  await leaf.setViewState(viewState);
}, mode);

const storedToggles = async () => {
  await sleep(400);
  const data = JSON.parse(await readFile(join(pluginDir, 'data.json'), 'utf8').catch(() => '{}'));
  return data.toggles?.['view-toggle.md'] ?? null;
};

const views = (fences) => fences.map((fence, index) => fence.view === 'source' ? index : -1).filter((index) => index >= 0);

try {
  browser = await chromium.connectOverCDP(endpoint);
  const starter = await windowWith('starter');
  await starter.evaluate((path) => require('electron').ipcRenderer.sendSync('vault-open', path, false), vault);
  page = await windowWith('index.html');
  // Tall enough for the whole note: Reading view keeps only the sections near the viewport.
  await page.setViewportSize({ width: 1200, height: 4000 });
  await page.waitForFunction(() => window.app?.workspace?.layoutReady, null, { timeout: 30000 });
  await page.evaluate(() => app.changeTheme('obsidian'));
  await page.evaluate(async (id) => {
    await app.plugins.setEnable(true);
    await app.plugins.enablePluginAndSave(id);
  }, manifest.id);
  await page.waitForFunction((id) => !!app.plugins.plugins[id], manifest.id, { timeout: 10000 });
  // A fresh vault greets with a modal (trust prompt or welcome); it would sit over every block.
  for (let i = 0; i < 10; i++) {
    const title = await page.evaluate(() => document.querySelector('.modal-container')?.textContent?.slice(0, 80) ?? null);
    if (title === null) break;
    console.log(`# dismissing modal: ${title}`);
    await page.keyboard.press('Escape');
    await sleep(200);
  }
  await page.evaluate(async () => {
    const file = app.vault.getAbstractFileByPath('view-toggle.md');
    await app.workspace.getLeaf(false).openFile(file, { state: { mode: 'preview' } });
  });

  let fences = await settle('reading');
  await check('Reading view draws every smiles and smarts block, wrapped, and no other fence', async () => {
    assert.equal(fences.length, FIXTURE.fences);
    for (const language of ['json', 'smi']) {
      const unclaimed = await page.evaluate(({ base, language }) => document.querySelectorAll(`.markdown-reading-view pre > code.language-${language}`).length
        - document.querySelectorAll(`.${base}-fence code.language-${language}`).length, { base: BASE, language });
      assert.equal(unclaimed, 1, language);
    }
    fences.forEach((fence, index) => {
      if (ERRORS.includes(index)) assert.equal(fence.holds, 'error', `block ${index}`);
      else assert.equal(fence.holds, 'diagram', `block ${index}`);
      assert.equal(fence.view, 'rendering');
      assert.equal(fence.renderingShown, true);
      assert.equal(fence.sourceShown, false);
    });
  });

  await check('attributes are read from the note, including in a list item and a callout', async () => {
    assert.equal(fences[1].caption, 'Figure 1: L-alanine, stereocentre marked');
    assert.equal(fences[1].align, `${BASE}-align-center`);
    assert.equal(fences[2].alt, 'ethanol');
    assert.equal(fences[2].align, `${BASE}-align-right`);
    assert.equal(fences[7].caption, 'Inside a list item');
    assert.equal(fences[8].caption, 'Inside a callout');
    assert.equal(fences[8].align, `${BASE}-align-center`);
  });

  await check('each line is its own structure: rows, labels, smarts classes, and a bad line costs only its cell', async () => {
    assert.deepEqual(fences.map((fence) => fence.structures), [1, 1, 1, 0, 8, 1, 1, 1, 1, 2, 2, 0]);
    assert.deepEqual(fences[0].labels, ['aspirin']);
    assert.equal(fences[4].labels.length, 8);
    assert.deepEqual(fences.map((fence) => fence.patterns), [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 0, 0]);
    assert.deepEqual(fences.map((fence) => /language-(\w+)/.exec(fence.language)?.[1]),
      ['smiles', 'smiles', 'smiles', 'smiles', 'smiles', 'smiles', 'smiles', 'smiles', 'smarts', 'smarts', 'smiles', 'smiles']);
    assert.equal(fences[FIXTURE.partly].cellErrors, 1);
    assert.deepEqual(fences[FIXTURE.partly].labels, ['ethanol', 'broken', 'propane']);
    assert.equal(fences[FIXTURE.broken].error, 'dangling ring closure: 1 at line 1, column 5\n\nC1CC\n    ^');
    assert.equal(fences[FIXTURE.empty].error, 'The fence is empty. Write one SMILES string per line.');
  });

  await check('structures take dark-theme colours by default, readable on the page, and the setting keeps the white card', async () => {
    // Every structure in Reading view: its texts (atom labels, SMARTS annotations), bonds and
    // highlights, with the background each one sits on (the page, or a callout's background).
    const look = () => page.evaluate((base) => {
      const opaque = (el) => {
        for (let node = el; node; node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          // Translucent layers (a callout's tint) are skipped: the opaque page beneath decides.
          if (bg && bg.startsWith('rgb(')) return bg;
        }
        return 'rgb(255, 255, 255)';
      };
      return [...document.querySelectorAll(`.markdown-reading-view svg.${base}`)].map((svg) => {
        const css = getComputedStyle(svg);
        const drawing = [...svg.querySelectorAll('line, text, circle')];
        const highlights = drawing.filter((el) => el.localName === 'circle' && Number(el.getAttribute('r')) > 12).map((el) => getComputedStyle(el).fill);
        return {
          background: css.backgroundColor, filter: css.filter, scheme: css.colorScheme, behind: opaque(svg.parentElement),
          texts: [...svg.querySelectorAll('text')].map((t) => ({ text: t.textContent, fill: getComputedStyle(t).fill })),
          bonds: [...svg.querySelectorAll('line')].filter((l) => Number(l.getAttribute('stroke-width')) < 10).map((l) => getComputedStyle(l).stroke),
          highlights,
          annotations: drawing.filter((el) => el.localName === 'text' && /pi|h\d|!a/.test(el.textContent)).map((t) => getComputedStyle(t).fill)
        };
      });
    }, BASE);
    const channels = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const luminance = (css) => {
      const [r, g, b] = channels(css).map((c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (x, y) => { const [a, b] = [luminance(x), luminance(y)].sort((p, q) => q - p); return (a + 0.05) / (b + 0.05); };
    const followed = await look();
    assert.equal(followed.length, 19, "every structure in the note");
    let chlorine = 0;
    let annotated = 0;
    for (const svg of followed) {
      assert.equal(svg.background, 'rgba(0, 0, 0, 0)');
      assert.equal(svg.filter, 'none');
      assert.equal(svg.scheme, 'dark');
      for (const { text, fill } of svg.texts) {
        assert.ok(contrast(fill, svg.behind) >= 4.5, `text ${text} ${fill} on ${svg.behind}`);
        if (text === 'Cl') chlorine++;
      }
      for (const stroke of svg.bonds) assert.ok(contrast(stroke, svg.behind) >= 3, `bond ${stroke} on ${svg.behind}`);
      for (const highlight of svg.highlights) {
        assert.ok(luminance(highlight) < 0.1, `the pale highlight goes dark: ${highlight}`);
        for (const fill of svg.annotations) {
          annotated++;
          assert.ok(contrast(fill, highlight) >= 4.5, `annotation ${fill} on its highlight ${highlight}`);
        }
      }
    }
    assert.ok(chlorine >= 2, 'the note draws chlorine');
    assert.ok(annotated >= 1, 'the note draws a SMARTS highlight with annotations');
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ followDarkTheme: false }), manifest.id);
    const card = await look();
    for (const svg of card) {
      assert.equal(svg.background, 'rgb(255, 255, 255)');
      assert.equal(svg.scheme, 'light');
      assert.equal(svg.filter, 'none');
    }
    assert.ok(card.flatMap((svg) => svg.texts).filter(({ text }) => text === 'Cl').every(({ fill }) => fill === 'rgb(31, 240, 31)'),
      'chlorine in OpenChemLib\'s own green, exactly');
    await page.screenshot({ path: join(shots, 'reading-dark-card.png') });
    await page.evaluate((id) => app.plugins.plugins[id].updateSettings({ followDarkTheme: true }), manifest.id);
    for (const svg of await look()) assert.equal(svg.scheme, 'dark');
  });

  await check('identical bodies share a fence key', async () => {
    const [a, b] = FIXTURE.twins;
    assert.equal(fences[a].key, fences[b].key);
    assert.equal(new Set(fences.map((fence) => fence.key)).size, FIXTURE.fences - 1);
  });

  await page.screenshot({ path: join(shots, 'reading-dark.png') });

  const [first, second] = FIXTURE.twins;
  await check('a click flips only that block, and a second click flips it back', async () => {
    await click('reading', second);
    fences = await state('reading');
    assert.deepEqual(views(fences), [second]);
    assert.equal(fences[second].sourceShown, true);
    assert.equal(fences[second].renderingShown, false);
    await click('reading', FIXTURE.broken);
    await click('reading', FIXTURE.broken);
    assert.deepEqual(views(await state('reading')), [second]);
    assert.deepEqual(await storedToggles(), [{ key: fences[second].key, ordinal: 1, index: second }]);
  });

  await page.screenshot({ path: join(shots, 'reading-flipped.png') });

  await check('a flip survives a re-render of the view', async () => {
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.rerender(true));
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('a flip survives closing and reopening the note', async () => {
    await page.evaluate(async () => {
      const leaf = app.workspace.activeLeaf;
      await leaf.openFile(app.vault.getAbstractFileByPath('other.md'));
      await leaf.openFile(app.vault.getAbstractFileByPath('view-toggle.md'), { state: { mode: 'preview' } });
    });
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('a flip survives reloading the plugin', async () => {
    await page.evaluate(async (id) => {
      await app.plugins.disablePlugin(id);
      await app.plugins.enablePlugin(id);
    }, manifest.id);
    await page.evaluate(() => app.workspace.activeLeaf.view.previewMode.rerender(true));
    assert.deepEqual(views(await settle('reading')), [second]);
  });

  await check('Live Preview always shows the structures and leaves the corner to Obsidian\'s edit button', async () => {
    await setMode('live');
    const live = await settle('live');
    assert.equal(live[8].caption, 'Inside a callout');
    // The flip saved in Reading view does not apply here, as Mermaid has no source view either.
    live.forEach((fence, index) => {
      assert.equal(fence.renderingShown, true, `block ${index}`);
      assert.equal(fence.sourceShown, false, `block ${index}`);
    });
    const corner = await page.evaluate((base) => {
      const block = document.querySelectorAll('.markdown-source-view .cm-preview-code-block')[0];
      block.scrollIntoView({ block: 'center' });
      const toggle = block.querySelector(`.${base}-toggle`);
      const edit = block.querySelector('.edit-block-button').getBoundingClientRect();
      return { toggle: getComputedStyle(toggle).display, x: edit.left + edit.width / 2, y: edit.top + edit.height / 2 };
    }, BASE);
    assert.equal(corner.toggle, 'none');
    await page.mouse.move(corner.x, corner.y);
    await sleep(200);
    const under = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.edit-block-button'), corner);
    assert.equal(under, true);
  });

  await page.screenshot({ path: join(shots, 'live-dark.png') });

  await check('Obsidian\'s edit button opens the fence for editing, as for Mermaid', async () => {
    await page.evaluate(() => app.workspace.activeLeaf.view.editor.setCursor({ line: 0, ch: 0 }));
    await sleep(200);
    const button = await page.evaluate(() => {
      const block = document.querySelectorAll('.markdown-source-view .cm-preview-code-block')[0];
      block.scrollIntoView({ block: 'center' });
      const r = block.querySelector('.edit-block-button').getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.move(button.x, button.y);
    await sleep(150);
    await page.mouse.click(button.x, button.y);
    await sleep(300);
    const editing = await page.evaluate(() => {
      const editor = app.workspace.activeLeaf.view.editor;
      return { line: editor.getLine(editor.getCursor().line - 1), selection: editor.getSelection() };
    });
    assert.match(editing.line, /^```smiles/);
    assert.match(editing.selection, /CC\(=O\)Oc1ccccc1C\(=O\)O aspirin/);
    await page.evaluate(() => app.workspace.activeLeaf.view.editor.setCursor({ line: 0, ch: 0 }));
  });

  await check('in Reading view the button appears on hover, dressed as Obsidian\'s, and names what it shows', async () => {
    await setMode('reading');
    const fences = await settle('reading');
    assert.deepEqual(views(fences), [second]);
    const look = (position) => page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      const button = fence.querySelector(`.${base}-toggle`);
      const f = fence.getBoundingClientRect();
      const b = button.getBoundingClientRect();
      const style = getComputedStyle(button);
      return { opacity: style.opacity, background: style.backgroundColor, label: button.getAttribute('aria-label'),
        inset: [Math.round(f.right - b.right), Math.round(b.top - f.top)], size: [Math.round(b.width), Math.round(b.height)] };
    }, { base: BASE, position });
    await page.mouse.move(1, 1);
    await sleep(200);
    const away = await look(first);
    assert.equal(away.opacity, '0');
    assert.equal(away.label, 'Show source');
    assert.deepEqual(away.inset, [4, 4]);
    assert.deepEqual(away.size, [28, 24]);
    assert.equal(away.background, 'rgba(0, 0, 0, 0)');
    const box = await page.evaluate(({ base, position }) => {
      const fence = document.querySelectorAll(`.markdown-reading-view .${base}-fence`)[position];
      fence.scrollIntoView({ block: 'center' });
      const r = fence.getBoundingClientRect();
      return { x: r.left + 40, y: r.top + r.height / 2 };
    }, { base: BASE, position: first });
    await page.mouse.move(box.x, box.y);
    await sleep(200);
    assert.equal((await look(first)).opacity, '1');
    await page.screenshot({ path: join(shots, 'reading-hover-button.png'), clip: { x: box.x - 40, y: box.y - 120, width: 760, height: 240 } });
    assert.equal((await look(second)).label, 'Show structure');
  });

  await page.screenshot({ path: join(shots, 'reading-hover.png') });

  await check('a flip reaches the same note open in a second Reading view, and flipping back clears the saved data', async () => {
    await page.evaluate(async () => {
      const file = app.vault.getAbstractFileByPath('view-toggle.md');
      const original = app.workspace.activeLeaf;
      const split = app.workspace.getLeaf('split');
      await split.openFile(file, { state: { mode: 'preview' } });
      app.workspace.setActiveLeaf(original, { focus: true });
    });
    await sleep(1500);
    const otherViews = () => page.evaluate((base) => {
      const leaves = app.workspace.getLeavesOfType('markdown').filter((leaf) => leaf !== app.workspace.activeLeaf);
      return [...leaves[0].view.containerEl.querySelectorAll(`.markdown-reading-view .${base}-fence`)]
        .flatMap((fence, index) => fence.getAttribute('data-view') === 'source' ? [index] : []);
    }, BASE);
    assert.deepEqual(await otherViews(), [second]);
    await click('reading', second);
    assert.deepEqual(views(await state('reading')), []);
    await sleep(300);
    assert.deepEqual(await otherViews(), []);
    assert.equal(await storedToggles(), null);
    await page.evaluate(() => {
      for (const leaf of app.workspace.getLeavesOfType('markdown')) if (leaf !== app.workspace.activeLeaf) leaf.detach();
    });
    // Closing the split widens the remaining view, which draws its blocks again; wait for that.
    await sleep(1000);
    await settle('reading');
  });

  await check('the command shows every structure in the note again', async () => {
    await click('reading', FIXTURE.broken);
    assert.deepEqual(views(await state('reading')), [FIXTURE.broken]);
    await page.evaluate((id) => app.commands.executeCommandById(`${id}:reset-source-views`), manifest.id);
    assert.deepEqual(views(await state('reading')), []);
    assert.equal(await storedToggles(), null);
  });

  await check('the light theme draws the same', async () => {
    await page.evaluate(() => app.changeTheme('moonstone'));
    const light = await settle('reading');
    assert.equal(light.filter((fence) => fence.holds === 'diagram').length, FIXTURE.fences - ERRORS.length);
    for (const fence of light) for (const card of fence.cards) assert.equal(card, 'rgb(255, 255, 255)');
    for (const fence of light) for (const filter of fence.filters) assert.equal(filter, 'none');
    const lightLook = await page.evaluate((base) => [...document.querySelectorAll(`.markdown-reading-view svg.${base}`)].map((svg) => ({
      scheme: getComputedStyle(svg).colorScheme,
      chlorine: [...svg.querySelectorAll('text')].filter((t) => t.textContent === 'Cl').map((t) => getComputedStyle(t).fill)
    })), BASE);
    for (const svg of lightLook) assert.equal(svg.scheme, 'light');
    assert.deepEqual(lightLook.flatMap((svg) => svg.chlorine), ['rgb(31, 240, 31)', 'rgb(31, 240, 31)']);
    assert.deepEqual(views(light), []);
    await page.screenshot({ path: join(shots, 'reading-light.png') });
  });

  await check('the renderer runs in a browser Worker and stops with the plugin', async () => {
    const stopped = await page.evaluate(async (id) => {
      const plugin = app.plugins.plugins[id];
      const host = plugin.host;
      await app.plugins.disablePlugin(id);
      return { hadHost: !!host, after: await host.render({ source: 'CCO', notation: 'smiles' }) };
    }, manifest.id);
    assert.equal(stopped.hadHost, true);
    assert.deepEqual(stopped.after, { status: 'unavailable', reason: 'the renderer was stopped' });
  });

  console.log(`\n${checks.length} live checks passed. Screenshots: ${shots}`);
} catch (error) {
  await page?.screenshot({ path: 'test-live-failure.png' }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  app.kill();
  await sleep(500);
  await rm(join(root, 'profile'), { recursive: true, force: true }).catch(() => {});
}
