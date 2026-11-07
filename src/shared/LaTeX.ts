import { DataURL } from "@zsviczian/excalidraw/types/excalidraw/types";
import { TFile } from "obsidian";
import ExcalidrawView from "../view/ExcalidrawView";
import { FileData, MimeType } from "src/types/embeddedFileLoaderTypes";
import { FileId } from "@zsviczian/excalidraw/types/element/src/types";
import ExcalidrawPlugin from "src/core/main";
import {renderEquationDataURL} from "src/svgPersistence/mathjaxDataURL";
import type { ExcalidrawExtrasAPI } from "@zsviczian/excalidraw-extras-api";
import type { MathJaxRenderOptions } from "src/types/mathJaxTypes";

type Tex2DataURLWithOptions = (
  tex: string,
  scale?: number,
  preamble?: string | null,
  options?: MathJaxRenderOptions,
) => ReturnType<ExcalidrawExtrasAPI["mathjax"]["tex2dataURL"]>;

export const updateEquation = async (
  equation: string,
  fileId: FileId,
  view: ExcalidrawView,
  addFiles: (files: FileData[], view: ExcalidrawView) => void,
) => {
  // view.plugin gives us access to the gateway
  const data = await tex2dataURL(equation, 4, view.plugin);
  if (data) {
    const files: FileData[] = [];
    files.push({
      mimeType: data.mimeType,
      id: fileId,
      dataURL: data.dataURL,
      created: data.created,
      size: data.size,
      hasSVGwithBitmap: false,
      shouldScale: true,
    });
    addFiles(files, view);
  }
};

export async function tex2dataURL(
  tex: string,
  scale: number = 4,
  _plugin: ExcalidrawPlugin,
  options?: MathJaxRenderOptions,
): Promise<{
  mimeType: MimeType;
  fileId: FileId;
  dataURL: DataURL;
  created: number;
  size: {height: number; width: number};
} | null> {
  try {
    return renderEquationDataURL(tex, scale) as any;
  } catch (error) {
    if (options?.throwOnError) throw error;
    console.error('SVG fork MathJax rendering failed:', error);
    return null;
  }
}
export const clearMathJaxVariables = (plugin: ExcalidrawPlugin) => {
  // Try to access without prompting the user.
  // If the plugin is disabled, we don't need to clear variables anyway.
  const api = plugin.app.plugins.plugins["excalidraw-extras"]
    ?.api as ExcalidrawExtrasAPI;
  if (api?.mathjax) {
    api.mathjax.clearMathJaxVariables();
  }
};
