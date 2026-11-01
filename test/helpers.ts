// Helpers the tests share: a DOM, and one fence drawn the way the plugin draws it.
import { Window } from 'happy-dom';
import { installObsidianDom } from './obsidian-dom';
import type { Notation, RenderInput, RenderResult } from '@reonarudo/smiles-renderer';
import { parseAttributes } from '../src/attributes';
import { buildFence, drawFence, fenceKey } from '../src/fence';

export const window = new Window();
installObsidianDom(window as never);
export const document = window.document as unknown as Document;

/**
 * A fence with info string `info` (its first word, `smiles` or `smarts`, is the notation) and
 * `body`, every line rendered through `render`, which may answer directly, by promise, or throw.
 */
export async function fence(info: string, body: string, render: (input: RenderInput) => RenderResult | Promise<RenderResult>): Promise<HTMLElement> {
  const notation = info.trim().split(/\s+/)[0] as Notation;
  const parts = buildFence(document.createElement('div'), body, fenceKey(body), notation);
  await drawFence(parts.rendering, notation, body, parseAttributes(info).attributes, async (input) => render(input));
  return parts.wrapper;
}

/** The rendering slot's inner HTML, so the exact-markup tests assert only the rendering. */
export function rendering(wrapper: Element): string {
  return wrapper.querySelector('.smiles-rendering')!.innerHTML;
}
