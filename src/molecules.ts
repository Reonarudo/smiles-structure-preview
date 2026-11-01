/** One line of a SMILES fence: the string to depict and, optionally, the text that followed it. */
export interface MoleculeLine {
  smiles: string;
  label?: string;
  /** 1-based line of the fence the string is on. */
  line: number;
  /** 0-based offset of the string in its line, past any indentation. */
  offset: number;
}

/**
 * Split a SMILES fence into molecules, one per non-blank line, in the convention of `.smi` files:
 * the SMILES string ends at the first whitespace and anything after it names the molecule.
 *
 * Nothing here can fail; a fence with no non-blank line yields no molecules, which the fence
 * rule reports.
 */
export function parseMolecules(content: string): MoleculeLine[] {
  const molecules: MoleculeLine[] = [];
  content.split('\n').forEach((text, index) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const position = { line: index + 1, offset: text.length - text.trimStart().length };
    const split = /\s/.exec(trimmed);
    if (!split) {
      molecules.push({ smiles: trimmed, ...position });
    } else {
      molecules.push({ smiles: trimmed.slice(0, split.index), label: trimmed.slice(split.index).trim(), ...position });
    }
  });
  return molecules;
}
