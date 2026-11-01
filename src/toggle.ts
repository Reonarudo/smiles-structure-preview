import { BASE_CLASS } from './fence';

/**
 * The view toggle's memory: which fences of a note the reader flipped to source view. The pure
 * core (`match`, `collect`, `storageKey`, `load`, `save`) is smiles-markdown-preview's
 * media/preview.js, unchanged apart from types; only the storage moved, from the preview's
 * `localStorage` to this plugin's data file.
 *
 * A flipped fence is an entry { key, ordinal, index }: its fence key, its ordinal among the fences
 * sharing that key, and its index among all of the note's smiles and smarts fences, in document order.
 */
export interface Entry {
  key: string;
  ordinal: number;
  index: number;
}

export interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The positions to flip: the key's group at `ordinal` if the key is present, else `index`. */
export function match(entries: Entry[], keys: string[]): number[] {
  const groups = new Map<string, number[]>();
  keys.forEach((key, position) => {
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(position);
  });
  const flipped = new Set<number>();
  for (const entry of entries) {
    const group = groups.get(entry.key);
    const target = group ? group[entry.ordinal] : (entry.index < keys.length ? entry.index : undefined);
    if (target !== undefined) flipped.add(target);
  }
  return [...flipped].sort((a, b) => a - b);
}

/** The entries describing the flipped positions, recomputed from the document so they only ever name real fences. */
export function collect(keys: string[], flipped: Iterable<number>): Entry[] {
  const set = new Set(flipped);
  const seen = new Map<string, number>();
  const entries: Entry[] = [];
  keys.forEach((key, index) => {
    const ordinal = seen.get(key) || 0;
    seen.set(key, ordinal + 1);
    if (set.has(index)) entries.push({ key, ordinal, index });
  });
  return entries;
}

export function storageKey(base: string, uri: string): string {
  return `${base}-markdown-preview.view-toggle:${uri}`;
}

/** The stored entries, or none when storage is unavailable or holds something else. */
export function load(storage: Storage, key: string): Entry[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed as Entry[] : [];
  } catch {
    return [];
  }
}

/** Mirror the entries to storage; the key is removed when nothing is flipped. A storage that throws is memory-only. */
export function save(storage: Storage, key: string, entries: Entry[]): void {
  try {
    if (entries.length === 0) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(entries));
  } catch {
    // Memory-only: the flip still holds for this rendering, not a reload.
  }
}

/** Saved toggles: note path to entries, as kept in the plugin's data file. */
export type Toggles = Record<string, Entry[]>;

/** The toggles of every note, over the plugin's data; `changed` is called after each write. */
export class ToggleStore {
  private readonly record: Toggles;
  private readonly storage: Storage;
  private readonly changed: () => void;

  constructor(initial: unknown, changed: () => void) {
    // No prototype: a note may be called `__proto__` or `constructor`.
    const record: Toggles = Object.create(null) as Toggles;
    if (initial && typeof initial === 'object' && !Array.isArray(initial)) {
      for (const [path, entries] of Object.entries(initial)) if (Array.isArray(entries)) record[path] = entries as Entry[];
    }
    this.record = record;
    const prefix = storageKey(BASE_CLASS, '');
    const path = (key: string) => key.slice(prefix.length);
    this.storage = {
      getItem: (key) => Object.hasOwn(record, path(key)) ? JSON.stringify(record[path(key)]) : null,
      setItem: (key, value) => {
        record[path(key)] = JSON.parse(value) as Entry[];
        changed();
      },
      removeItem: (key) => {
        if (!Object.hasOwn(record, path(key))) return;
        delete record[path(key)];
        changed();
      }
    };
    this.changed = changed;
  }

  /** Whether the fence at `index` among the note's `keys` was left in source view. */
  isFlipped(notePath: string, keys: string[], index: number): boolean {
    return match(load(this.storage, storageKey(BASE_CLASS, notePath)), keys).includes(index);
  }

  /** Remember the fence at `index` as flipped or not, re-keying the note's entries to its current fences. */
  set(notePath: string, keys: string[], index: number, flipped: boolean): void {
    const key = storageKey(BASE_CLASS, notePath);
    const positions = new Set(match(load(this.storage, key), keys));
    if (flipped) positions.add(index);
    else positions.delete(index);
    save(this.storage, key, collect(keys, positions));
  }

  /** Forget every flip in a note. */
  clear(notePath: string): void {
    save(this.storage, storageKey(BASE_CLASS, notePath), []);
  }

  /** Follow a note to its new path. */
  rename(oldPath: string, newPath: string): void {
    if (!Object.hasOwn(this.record, oldPath)) return;
    this.record[newPath] = this.record[oldPath]!;
    delete this.record[oldPath];
    this.changed();
  }

  /** The data to persist. */
  toJSON(): Toggles {
    return this.record;
  }
}
