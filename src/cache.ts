import type { RenderInput, RenderResult } from '@reonarudo/smiles-renderer';

export interface CachedRender {
  render(input: RenderInput): Promise<RenderResult>;
  clear(): void;
}

/**
 * Remember recent results by notation and string. Obsidian runs a code block processor again
 * whenever a section is re-rendered (scrolling, switching views, an edit elsewhere in the note), so
 * without this every pass would re-run OpenChemLib. The same string can mean different things in
 * the two notations, so the key is `notation \0 source`, as in the VS Code extension. Identical
 * inputs rendered at the same time share one render. Failures and timeouts are cached, since they
 * would only repeat until the string changes; `unavailable` is not, so a restarted renderer gets
 * another chance. `onFresh` hears every real render, never a cache hit.
 */
export function createCache(
  render: (input: RenderInput) => Promise<RenderResult>,
  max = 96,
  onFresh: (input: RenderInput, result: RenderResult) => void = () => {}
): CachedRender {
  const entries = new Map<string, Promise<RenderResult>>();
  return {
    render(input) {
      const key = `${input.notation}\0${input.source}`;
      const hit = entries.get(key);
      if (hit) {
        // Most recently used goes last; the first key is evicted first.
        entries.delete(key);
        entries.set(key, hit);
        return hit;
      }
      const pending = render(input);
      entries.set(key, pending);
      if (entries.size > max) entries.delete(entries.keys().next().value!);
      pending.then((result) => {
        onFresh(input, result);
        if (result.status === 'unavailable' && entries.get(key) === pending) entries.delete(key);
      }, () => {
        if (entries.get(key) === pending) entries.delete(key);
      });
      return pending;
    },
    clear() {
      entries.clear();
    }
  };
}
