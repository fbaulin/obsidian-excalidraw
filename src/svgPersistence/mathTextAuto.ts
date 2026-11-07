// @ts-nocheck
/** Safe, whole-text math detection, independent of Excalidraw/DOM. */
export function standaloneMath(source) {
  if (typeof source !== 'string') return null;
  const raw = source.trim();
  if (!raw || raw.length > 12000) return null;
  const display = raw.startsWith('$$') && raw.endsWith('$$') && raw.length > 4;
  const inline = !display && raw.startsWith('$') && raw.endsWith('$') && raw.length > 2;
  if (!display && !inline) return null;
  const content = raw.slice(display ? 2 : 1, display ? -2 : -1);
  if (!content.trim() || /(?<!\\)\$/.test(content)) return null;
  if (!display && /[\r\n]/.test(content)) return null;
  return {latex: content, display, source};
}

/** Pure guards to avoid converting linked, bound or grouped text. */
export function canConvertText(el) {
  return Boolean(el && el.type === 'text' && !el.isDeleted && !el.containerId &&
    !el.link && (!el.boundElements || el.boundElements.length === 0) &&
    (!el.groupIds || el.groupIds.length === 0) && standaloneMath(el.originalText ?? el.rawText ?? el.text));
}

/** A state machine; only converts text *after* its editor closes, never during typing. */
export class MathTextEditTracker {
  constructor() { this.editingId = null; this.pending = new Set(); }
  observe(appState) {
    const id = appState?.editingTextElement?.id ?? null;
    if (id) { this.editingId = id; return null; }
    if (!this.editingId) return null;
    const previous = this.editingId; this.editingId = null;
    if (this.pending.has(previous)) return null;
    this.pending.add(previous);
    return previous;
  }
  finish(id) { this.pending.delete(id); }
}
