/** The engine context menu retains native action objects, bypassing registerAction.
 * Capture only image-copy menu entries belonging to this mounted drawing.
 */
export function installMathCopyEvents(
  root: HTMLElement,
  copy: (format: "png" | "svg") => Promise<void>,
  reportError: (error: unknown) => void,
): () => void {
  const doc = root.ownerDocument;
  let ownsMenu = false;
  const element = (target: EventTarget | null): Element | null =>
    target && "nodeType" in target && target.nodeType === 1 ? target as Element : null;
  const run = (event: Event, format: "png" | "svg") => {
    event.preventDefault();
    event.stopImmediatePropagation();
    void copy(format).catch(reportError);
  };
  const context = (event: MouseEvent) => {
    ownsMenu = root.contains(element(event.target));
  };
  const click = (event: MouseEvent) => {
    const target = element(event.target);
    const item = target?.closest('[data-testid="copyAsPng"], [data-testid="copyAsSvg"]');
    if (ownsMenu && item?.closest('.context-menu')) {
      run(event, item.getAttribute("data-testid") === "copyAsPng" ? "png" : "svg");
      // Let the engine dismiss its portal without executing the retained action.
      doc.dispatchEvent(new doc.defaultView.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
    ownsMenu = false;
  };
  const key = (event: KeyboardEvent) => {
    const target = element(event.target);
    if (event.code !== "KeyC" || !event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey ||
        !root.contains(target) || target?.closest('input, textarea, [contenteditable="true"]')) return;
    run(event, "png");
  };
  doc.addEventListener("contextmenu", context, true);
  doc.addEventListener("click", click, true);
  doc.addEventListener("keydown", key, true);
  return () => {
    doc.removeEventListener("contextmenu", context, true);
    doc.removeEventListener("click", click, true);
    doc.removeEventListener("keydown", key, true);
  };
}