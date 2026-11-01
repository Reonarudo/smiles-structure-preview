// Modules that exist only at build time (scripts/worker-bundle.mjs and scripts/build.mjs).

/** The render worker's bundled source, embedded as a string. */
declare module 'virtual:render-worker' {
  const source: string;
  export default source;
}

/** Files inside the installed smiles-renderer package, outside its public `exports`. */
declare module '#renderer/dist/compose.js' {
  export class OutputTooLarge extends Error {}
  export function compose(cells: { svg: string; label?: string }[], prefix: string, outputBytes: number): string;
}
