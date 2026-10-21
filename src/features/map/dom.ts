// Classes and tag names belong to application code. External content is always text.
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string | number): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
