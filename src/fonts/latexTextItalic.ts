import { dataURL } from "./latexTextItalic.json";
import { getFontMetrics, type FontMetrics } from "../utils/fontMetrics";

export const LATEX_TEXT_ITALIC = "LaTeX Math Italic";
// Persistent scene identifier: never reuse a built-in or the user's Local Font slot.
export const LATEX_TEXT_ITALIC_ID = 10001;

export interface FontRuntime {
  FONT_FAMILY: Record<string, number>;
  Fonts: {
    registered: Map<number, unknown>;
    register: (family: string, metadata: { metrics: FontMetrics }, face: { uri: string }) => unknown;
  };
}

/** Register an unmodified italic face as its own family (not synthetic slant). */
export function registerLatexTextItalic(runtime: FontRuntime): void {
  const { FONT_FAMILY, Fonts } = runtime;
  if (FONT_FAMILY[LATEX_TEXT_ITALIC] === LATEX_TEXT_ITALIC_ID &&
      Fonts.registered.has(LATEX_TEXT_ITALIC_ID)) return;
  if (Object.values(FONT_FAMILY).includes(LATEX_TEXT_ITALIC_ID) ||
      Fonts.registered.has(LATEX_TEXT_ITALIC_ID)) {
    throw new Error("LaTeX Math Italic font identifier is already occupied");
  }
  const bytes = Uint8Array.from(atob(dataURL.split(",")[1]), char => char.charCodeAt(0));
  const metrics = getFontMetrics(bytes.buffer);
  if (!metrics) throw new Error("Invalid bundled LaTeX Math Italic font");
  FONT_FAMILY[LATEX_TEXT_ITALIC] = LATEX_TEXT_ITALIC_ID;
  Fonts.register(LATEX_TEXT_ITALIC, { metrics }, { uri: dataURL });
}