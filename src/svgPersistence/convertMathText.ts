// @ts-nocheck
import {getEA} from 'src/core';
import {standaloneMath,canConvertText,MathTextEditTracker} from './mathTextAuto';

/** Convert a complete $...$ or $$...$$ text element on blur into an editable LaTeX image.
 * This is a transitional renderer (not yet a true text-element renderer).
 * Source is retained in customData and ExcalidrawData equations.
 * Never removes the original if MathJax rendering or scene insertion fails.
 */
export class MathTextAutoConverter {
  private tracker = new MathTextEditTracker();
  private active = false;
  constructor(private view: any) {}
  onChange(_elements: any[], state: any) {
    const id = this.tracker.observe(state);
    if (id) setTimeout(() => {void this.convert(id);}, 0);
  }
  private async convert(id: string) {
    if (this.active) {this.tracker.finish(id);return;}
    this.active = true;
    let ea: any = null;
    try {
      const view = this.view;
      const api = view.excalidrawAPI;
      if (!api || api.isDestroyed || view.semaphores?.viewunload || !view.file) return;
      if (api.getAppState().editingTextElement) return;
      const original = api.getSceneElements().find((el: any) => el.id === id);
      if (!canConvertText(original)) return;
      const parsed = standaloneMath(original.originalText ?? original.rawText ?? original.text);
      if (!parsed) return;
      // Rendering happens before modifying or deleting the source text.
      ea = getEA(view);
      const imageId = await ea.addLaTex(original.x, original.y, parsed.latex, 1, 1, {throwOnError:true});
      if (!imageId || !ea.getElement(imageId)) return;
      const image = ea.getElement(imageId);
      const font = Math.max(8, Math.min(200, Number(original.fontSize) || 20));
      const targetHeight = font * (parsed.display ? 1.6 : 1.25);
      if (!image.height || !image.width) return;
      const resize = targetHeight / image.height;
      image.width *= resize; image.height *= resize;
      image.angle = original.angle || 0;
      // Keep the source, font size and display/inline status for future migration.
      ea.addAppendUpdateCustomData(imageId, {
        latex: parsed.latex,
        svgMathText: {source: parsed.source, fontSize: font, display: parsed.display, sourceElementId: original.id},
      });
      // Check again after the asynchronous MathJax render: element could have been edited/deleted.
      const latest = api.getSceneElements().find((el: any) => el.id === id);
      if (!latest || latest.version !== original.version || api.getAppState().editingTextElement ||
          !canConvertText(latest) || view.semaphores?.viewunload) return;
      ea.copyViewElementsToEAforEditing([latest]);
      const old = ea.getElement(id);
      if (!old) return;
      old.isDeleted = true;
      await ea.addElementsToView(false, false, false, false);
      view.excalidrawData.deleteTextElement(id);
      view.setDirty();
    } catch(error) {
      console.error('SVG fork: converting formula text failed; source was preserved unless commit completed',error);
    } finally {
      ea?.destroy(); this.active = false; this.tracker.finish(id);
    }
  }
}
