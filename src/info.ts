/**
 * Where a code block sits in its note. Obsidian hands a code block processor the fence body but
 * not its info string, and runs one processor per block, so the attribute block
 * (```` ```smiles {caption="..."} ````) and the list of the note's fences, which the toggle needs
 * to tell identical bodies apart, are recovered by scanning the note's text.
 *
 * The toggle's list is shared by both languages: every `smiles` and `smarts` fence of the note,
 * in document order, as the VS Code extension's preview script saw them (one `.smiles-fence`
 * selector for both words). A fence's key is its body alone, so a `smiles` and a `smarts` fence
 * with the same body share a key and are told apart by their ordinal, exactly as there.
 */

export interface ScannedFence {
  /** 0-based line of the opening fence. */
  line: number;
  /** The language: the info string's first word, one of the words scanned for. */
  word: string;
  /** The info string after the fence characters, trimmed. */
  info: string;
  /** The lines between the fences, with container prefixes removed, joined by `\n`. */
  body: string;
}

/** A fence opener: blockquote markers, indentation, then three or more backticks or tildes. */
const OPEN = /^((?:[ \t]*>)*)([ \t]*)(`{3,}|~{3,})(.*)$/;

function markers(prefix: string): number {
  return (prefix.match(/>/g) ?? []).length;
}

/** Remove `count` blockquote markers (each with one optional following space), or `undefined` if the line has fewer. */
function stripQuotes(line: string, count: number): string | undefined {
  let rest = line;
  for (let i = 0; i < count; i++) {
    const match = /^[ \t]*>[ ]?/.exec(rest);
    if (!match) return undefined;
    rest = rest.slice(match[0].length);
  }
  return rest;
}

/**
 * Every fenced code block in `text` whose language (the first word of its info string, as
 * Obsidian reads it) is one of `words`, in document order. Fences of every language are tracked,
 * so a smiles fence quoted inside another fence is not counted. Fences may sit in blockquotes and list items; an
 * unclosed fence runs to the end of its container.
 */
export function scanFences(text: string, words: readonly string[]): ScannedFence[] {
  const lines = text.split(/\r?\n/);
  const found: ScannedFence[] = [];
  let i = 0;
  while (i < lines.length) {
    const open = OPEN.exec(lines[i]!);
    if (!open || (open[3]!.startsWith('`') && open[4]!.includes('`'))) {
      i++;
      continue;
    }
    const quotes = markers(open[1]!);
    // Indentation counts from inside the blockquote markers, as the body lines' does.
    const opener = stripQuotes(lines[i]!, quotes)!;
    const indent = /^[ \t]*/.exec(opener)![0].replace(/\t/g, '    ').length;
    const fence = open[3]!;
    const info = open[4]!.trim();
    const closing = new RegExp(`^[ \\t]*${fence[0] === '`' ? '`' : '~'}{${fence.length},}[ \\t]*$`);
    const body: string[] = [];
    let j = i + 1;
    for (; j < lines.length; j++) {
      const inner = stripQuotes(lines[j]!, quotes);
      if (inner === undefined) break;
      if (closing.test(inner)) {
        j++;
        break;
      }
      const lead = /^[ \t]*/.exec(inner)![0].replace(/\t/g, '    ').length;
      if (indent > 0 && inner.trim() !== '' && lead < indent) break;
      body.push(inner.slice(Math.min(indent, /^[ ]*/.exec(inner)![0].length)));
    }
    const word = info.split(/\s+/)[0] ?? '';
    if (words.includes(word)) found.push({ line: i, word, info, body: body.join('\n') });
    i = Math.max(j, i + 1);
  }
  return found;
}

/**
 * Which of `fences` a processor call for language `word` is rendering: the one of that language in
 * the section's line range, or, when the section holds several (a list or blockquote is one
 * section), the first whose body matches.
 */
export function locate(fences: ScannedFence[], lineStart: number, lineEnd: number, source: string, word: string): number {
  const inRange: number[] = [];
  fences.forEach((fence, index) => {
    if (fence.word === word && fence.line >= lineStart && fence.line <= lineEnd) inRange.push(index);
  });
  if (inRange.length === 1) return inRange[0]!;
  const wanted = source.trimEnd();
  const same = inRange.find((index) => fences[index]!.body.trimEnd() === wanted);
  return same ?? inRange[0] ?? -1;
}
