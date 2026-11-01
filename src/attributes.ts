export type Alignment = 'left' | 'center' | 'right';

export interface FenceAttributes {
  alt?: string;
  caption?: string;
  class?: string;
  align?: Alignment;
}

export interface ParsedAttributes {
  attributes: FenceAttributes;
  /** Everything ignored while parsing, for the output channel. Never shown in the preview. */
  diagnostics: string[];
}

const ALIGNMENTS: ReadonlySet<string> = new Set(['left', 'center', 'right']);
const KEYS: ReadonlySet<string> = new Set(['alt', 'caption', 'class', 'align']);

/** One `key="value"` pair, single or double quoted, with `\` escaping a quote or a backslash. */
const PAIR = /^([A-Za-z-]+)\s*=\s*("(?:\\["\\]|[^"\\])*"|'(?:\\['\\]|[^'\\])*')(?:\s+|$)/;

/**
 * Read the attribute block of a SMILES or SMARTS fence's info string.
 *
 * Total by construction: no input throws, and anything unrecognised is dropped rather than
 * reported in the preview (ADR 0002). A parser exception here would not degrade one fence — VS
 * Code applies markdown-it plugins inside a try/catch, so a throw removes the whole extension
 * from the preview.
 */
export function parseAttributes(info: string): ParsedAttributes {
  const attributes: FenceAttributes = {};
  const diagnostics: string[] = [];
  // Everything after the fence's tag, whichever notation it names.
  const body = info.trim().replace(/^\S+/, '').trim();
  if (!body) {
    return { attributes, diagnostics };
  }
  if (!body.startsWith('{') || !body.endsWith('}')) {
    diagnostics.push(`Attributes must be wrapped in braces; ignoring ${JSON.stringify(body)}.`);
    return { attributes, diagnostics };
  }

  let remaining = body.slice(1, -1).trim();
  while (remaining) {
    const match = PAIR.exec(remaining);
    if (!match) {
      // A malformed block has no partial reading we could trust, so none of it is honoured.
      diagnostics.push(
        `Expected quoted key="value" pairs; ignoring the whole attribute block ` +
        `at ${JSON.stringify(remaining)}.`
      );
      return { attributes: {}, diagnostics };
    }
    const [consumed, key, quoted] = match as unknown as [string, string, string];
    remaining = remaining.slice(consumed.length);
    const value = quoted.slice(1, -1).replace(/\\(["'\\])/g, '$1');

    if (!KEYS.has(key)) {
      diagnostics.push(`Unknown attribute ${JSON.stringify(key)}; ignored.`);
      continue;
    }
    if (attributes[key as keyof FenceAttributes] !== undefined) {
      diagnostics.push(`Duplicate attribute ${JSON.stringify(key)}; keeping the first value.`);
      continue;
    }
    if (key === 'align') {
      if (!ALIGNMENTS.has(value)) {
        diagnostics.push(`Unknown alignment ${JSON.stringify(value)}; ignored.`);
        continue;
      }
      attributes.align = value as Alignment;
      continue;
    }
    attributes[key as 'alt' | 'caption' | 'class'] = value;
  }
  return { attributes, diagnostics };
}
