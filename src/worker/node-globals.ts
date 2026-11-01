// Injected by esbuild into the worker bundle: the one Node global smiles-renderer's `compose`
// reads, `Buffer.byteLength`, to hold the composed SVG to the output limit in UTF-8 bytes.
const encoder = new TextEncoder();
export const Buffer = {
  byteLength: (text: string): number => encoder.encode(text).length
};
