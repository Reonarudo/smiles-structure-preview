// The slice of Obsidian's DOM helpers the plugin uses (obsidian.d.ts: `Node.win`, `Node.doc`,
// `Node.createEl`, `Node.createDiv`, `Node.createSpan`, `Node.empty`, `Node.appendText`), installed on a happy-dom
// window for the unit tests. As in Obsidian, `createEl` on a node creates the element in that
// node's document, sets class names, then text, then attributes (null or false leaves one out),
// then appends it to the node.
type Info = { cls?: string | string[]; text?: string; attr?: Record<string, string | number | boolean | null>; title?: string };

export function installObsidianDom(window: { Node: { prototype: object } }): void {
  const proto = window.Node.prototype as Record<string, unknown>;
  const define = (name: string, value: PropertyDescriptor) => Object.defineProperty(proto, name, { configurable: true, ...value });
  define('doc', { get(this: Node) { return this.ownerDocument ?? this; } });
  define('win', { get(this: Node) { return (this.ownerDocument ?? (this as Document)).defaultView ?? window; } });
  function createEl(this: Node, tag: string, o?: Info | string, callback?: (el: HTMLElement) => void): HTMLElement {
    const info: Info = typeof o === 'string' ? { cls: o } : o ?? {};
    const el = (this.ownerDocument ?? (this as Document)).createElement(tag);
    if (info.cls) el.className = Array.isArray(info.cls) ? info.cls.join(' ') : info.cls;
    if (info.text !== undefined) el.textContent = info.text;
    for (const [name, value] of Object.entries(info.attr ?? {})) {
      if (value !== null && value !== false) el.setAttribute(name, String(value));
    }
    if (info.title !== undefined) el.title = info.title;
    callback?.(el);
    this.appendChild(el);
    return el;
  }
  define('createEl', { value: createEl });
  define('createDiv', { value(this: Node, o?: Info | string, callback?: (el: HTMLElement) => void) { return createEl.call(this, 'div', o, callback); } });
  define('createSpan', { value(this: Node, o?: Info | string, callback?: (el: HTMLElement) => void) { return createEl.call(this, 'span', o, callback); } });
  define('empty', { value(this: Node) { while (this.firstChild) this.removeChild(this.firstChild); } });
  define('appendText', { value(this: Node, text: string) { this.appendChild((this.ownerDocument ?? (this as Document)).createTextNode(text)); } });
}
