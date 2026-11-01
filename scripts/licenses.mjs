// The license texts of everything main.js embeds, as one comment at its head. A community
// install ships only main.js, manifest.json and styles.css, so the notices travel inside main.js.
import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

export async function licenseBanner() {
  const require = createRequire(join(root, 'package.json'));
  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const name = Object.keys(pkg.dependencies).find((dep) => dep.startsWith('@reonarudo/'));
  const renderer = dirname(require.resolve(`${name}/package.json`));
  const sections = [[`${manifest.name} (this plugin)`, join(root, 'LICENSE')], [name, join(renderer, 'LICENSE')]];
  const bundled = (await readdir(join(renderer, 'licenses'))).sort();
  for (const file of bundled) sections.push([`${name}: licenses/${file}`, join(renderer, 'licenses', file)]);
  // xmldom, the sanitizer's parser, is embedded in every plugin; not every renderer lists it.
  if (!bundled.some((file) => /xmldom/i.test(file))) {
    const xmldom = createRequire(join(renderer, 'package.json')).resolve('@xmldom/xmldom/package.json');
    sections.push(['@xmldom/xmldom', join(dirname(xmldom), 'LICENSE')]);
  }
  const texts = await Promise.all(sections.map(async ([title, file]) => `==== ${title} ====\n\n${(await readFile(file, 'utf8')).trim()}\n`));
  return `/*! Third-party notices for ${manifest.name}; see also THIRD_PARTY_NOTICES.md.\n\n${texts.join('\n')}*/`
    .replace(/\*\/(?!$)/g, '*\\/');
}
