// Sets up the shared development vault, ../test-vault: links this repo in as an installed
// plugin (Obsidian loads main.js, manifest.json and styles.css from the repo root and writes
// data.json beside them), enables it, and copies examples/ into a folder named after the plugin.
// Idempotent; run again after adding examples. Reload Obsidian (or the plugin) after `npm run build`.
import { cp, lstat, mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(repo, 'manifest.json'), 'utf8'));
const vault = process.env.TEST_VAULT ?? join(dirname(repo), 'test-vault');
const plugins = join(vault, '.obsidian', 'plugins');
const link = join(plugins, manifest.id);

await mkdir(plugins, { recursive: true });
const existing = await lstat(link).catch(() => undefined);
if (!existing) {
  await symlink(repo, link, 'dir');
} else if (!existing.isSymbolicLink() || (await readlink(link)) !== repo) {
  throw new Error(`${link} exists and is not a link to ${repo}; move it aside first.`);
}

const listFile = join(vault, '.obsidian', 'community-plugins.json');
const enabled = JSON.parse(await readFile(listFile, 'utf8').catch(() => '[]'));
if (!enabled.includes(manifest.id)) {
  enabled.push(manifest.id);
  await writeFile(listFile, JSON.stringify(enabled, null, 2) + '\n');
}

const notes = join(vault, manifest.id.replace(/-.*$/, ''));
await cp(join(repo, 'examples'), notes, { recursive: true });
console.log(`${manifest.id}: linked into ${vault}, examples in ${notes}`);
