import type { ExcalidrawImperativeAPI } from "@zsviczian/excalidraw/types/excalidraw/types";
import type { Action } from "@zsviczian/excalidraw/types/excalidraw/actions/types";

export interface MathCopyDependencies {
  captureUpdateNever: Exclude<Awaited<ReturnType<Action["perform"]>>, false>["captureUpdate"];
  copySvg: (selectedOnly: boolean) => Promise<void>;
  copyPng: (selectedOnly: boolean) => Promise<void>;
}

/** Override the engine's image-copy actions, which bypass the host export manager.
 * Registration is per editor instance; no global clipboard or engine mutation.
 */
export function registerMathCopyActions(
  api: ExcalidrawImperativeAPI,
  dependencies: MathCopyDependencies,
): void {
  for (const [name, label, copy] of [
    ["copyAsSvg", "labels.copyAsSvg", dependencies.copySvg],
    ["copyAsPng", "labels.copyAsPng", dependencies.copyPng],
  ] as const) {
    api.registerAction({
      name,
      label,
      trackEvent: false,
      keywords: [name === "copyAsSvg" ? "svg" : "png", "clipboard", "copy"],
      predicate: elements => elements.some(element => !element.isDeleted),
      perform: async (_elements, appState) => {
        // No selection means export the canvas, just like the engine actions.
        const selectedOnly = Object.values(appState.selectedElementIds).some(Boolean);
        try {
          await copy(selectedOnly);
          return { captureUpdate: dependencies.captureUpdateNever };
        } catch (error) {
          return {
            captureUpdate: dependencies.captureUpdateNever,
            appState: { errorMessage: error instanceof Error ? error.message : String(error) },
          };
        }
      },
    });
  }
}