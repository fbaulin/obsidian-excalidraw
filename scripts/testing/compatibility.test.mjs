import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const nativeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(relative) {
  const file = path.resolve(root, relative.endsWith(".ts") ? relative : relative + ".ts");
  if (cache.has(file)) return cache.get(file);
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  cache.set(file, module.exports);
  const require = name => name.startsWith(".")
    ? load(path.relative(root, path.resolve(path.dirname(file), name)))
    : nativeRequire(name);
  new Function("require", "module", "exports", compiled.outputText)(require, module, module.exports);
  cache.set(file, module.exports);
  return module.exports;
}

const host = load("src/compatibility/host");
test("exported standalone and centered shape-label SVG text becomes real vector math", () => {
  const { DOMParser, XMLSerializer } = nativeRequire("@xmldom/xmldom");
  const parseXml = source => new DOMParser().parseFromString(source, "image/svg+xml");
  const svg = parseXml(`<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(203 201)"><text x="0" y="17.62" font-size="20px">xxkk</text><text x="0" y="42.62" font-size="20px">$x_1$</text></g><g transform="translate(343 242)"><text x="47.98" y="17.62" font-size="20px" text-anchor="middle">xx $Y^2$</text></g></svg>`).documentElement;
  const { overlayMathInSvg } = load("src/svgPersistence/mathSvgOverlay");
  const { texToSvg } = load("src/svgPersistence/mathjaxRenderer");
  const result = overlayMathInSvg(svg, { elements: [] }, texToSvg, {
    parseXml, measureText: text => text.length * 10,
  });
  assert.equal(result.converted, 2);
  assert.equal(result.skipped, 0);
  assert.ok(svg.getElementsByTagName("path").length > 0);
  const visible = Array.from(svg.getElementsByTagName("text"), text => text.textContent).join(" ");
  assert.match(visible, /xxkk/);
  assert.match(visible, /xx /);
  assert.doesNotMatch(visible, /\$|x_1|Y\^2/);
  const serialized = new XMLSerializer().serializeToString(svg);
  assert.match(serialized, /translate\(343 242\)/);
  assert.match(serialized, /data-latex-source="xx \$Y\^2\$"/);
  assert.equal(overlayMathInSvg(svg, {}, texToSvg, { parseXml }).converted, 0);
});
test("native SVG and PNG copy actions use host exporter for selection and full canvas", async () => {
  const actions = new Map(), copies = [];
  const { registerMathCopyActions } = load("src/svgPersistence/mathCopyActions");
  registerMathCopyActions({ registerAction: action => actions.set(action.name, action) }, {
    captureUpdateNever: "NEVER",
    copySvg: async selected => copies.push(["svg", selected]),
    copyPng: async selected => copies.push(["png", selected]),
  });
  for (const name of ["copyAsSvg", "copyAsPng"]) {
    const action = actions.get(name);
    assert.equal(action.predicate([{ isDeleted: true }]), false);
    assert.equal(action.predicate([{ isDeleted: false }]), true);
    assert.deepEqual(await action.perform([], { selectedElementIds: { label: true } }), { captureUpdate: "NEVER" });
    await action.perform([], { selectedElementIds: {} });
  }
  assert.deepEqual(copies, [["svg", true], ["svg", false], ["png", true], ["png", false]]);
  const png = actions.get("copyAsPng");
  assert.equal(png.keyTest({ code: "KeyC", altKey: true, shiftKey: true }), true);
  assert.equal(png.keyTest({ code: "KeyC", altKey: false, shiftKey: true }), false);
  assert.equal(png.keyTest({ code: "KeyV", altKey: true, shiftKey: true }), false);
  assert.equal(actions.get("copyAsSvg").keyTest, undefined);
});
test("math detection does not discard rendered text when originalText is stale", () => {
  const { hasMathText } = load("src/svgPersistence/mathSceneHasText");
  assert.equal(hasMathText({ elements: [{ type: "text", originalText: "", text: "$x_1$" }] }), true);
  assert.equal(hasMathText({ elements: [{ type: "text", originalText: "xx", text: "xx $Y^2$" }] }), true);
  assert.equal(hasMathText({ elements: [{ type: "text", isDeleted: true, text: "$x$" }] }), false);
});
test("actual export manager typesets clipboard SVG even without math in the source cache", async () => {
  const { DOMParser } = nativeRequire("@xmldom/xmldom");
  const previousParser = globalThis.DOMParser;
  globalThis.DOMParser = DOMParser;
  try {
    const filename = path.join(root, "src/view/managers/ViewExportManager.ts");
    const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    const module = { exports: {} };
    const require = name => name.startsWith("../../svgPersistence/")
      ? load("src/svgPersistence/" + name.split("/").at(-1))
      : {};
    new Function("require", "module", "exports", compiled.outputText)(require, module, module.exports);
    const scene = { elements: [{ type: "text", originalText: "", text: "xx $Y^2$" }], appState: {} };
    const view = { file: { extension: "md" }, excalidrawAPI: {}, getScene: selected => {
      assert.equal(selected, true);
      return scene;
    } };
    const manager = new module.exports.ViewExportManager(view, {
      isMaskFile: () => false,
      getSVG: async () => new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg"><g transform="translate(20 40)"><text x="0" y="20" font-size="20px">xx $Y^2$</text></g></svg>',
        "image/svg+xml").documentElement,
    });
    // Isolate settings/file loading, but run the actual svg() and getSVG() methods.
    manager.getViewExportWithBackground = () => false;
    manager.getViewExportTheme = () => "light";
    manager.getViewExportEmbedScene = () => false;
    manager.getViewExportPadding = () => 10;
    manager.loadFilesForExport = async () => undefined;
    const svg = await manager.getSVG(false, true);
    assert.ok(svg.getElementsByTagName("path").length > 0);
    assert.doesNotMatch(Array.from(svg.getElementsByTagName("text"), el => el.textContent).join(""), /\$|Y\^2/);
    assert.equal(scene.elements[0].text, "xx $Y^2$");
  } finally {
    if (previousParser === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = previousParser;
  }
});
test("clipboard failure is visible without changing scene or undo history", async () => {
  let action;
  const { registerMathCopyActions } = load("src/svgPersistence/mathCopyActions");
  registerMathCopyActions({ registerAction: registered => { action = registered; } }, {
    captureUpdateNever: "NEVER", copySvg: async () => {},
    copyPng: async () => { throw Error("Clipboard permission denied"); },
  });
  assert.deepEqual(await action.perform([], { selectedElementIds: {} }), {
    captureUpdate: "NEVER", appState: { errorMessage: "Clipboard permission denied" },
  });
});
test("CSS editor module evaluates without loading incompatible CSS parser", () => {
  const source = fs.readFileSync(path.join(root, "src/view/sidepanel/CSSCodeEditor.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  let grammarLoads = 0;
  const require = name => {
    if (name === "@codemirror/lang-css") {
      grammarLoads++;
      throw new TypeError("Cannot read properties of undefined (reading 'deserialize')");
    }
    if (name.endsWith("compatibility/host")) return host;
    if (name === "@lezer/common") return { NodeProp: {} };
    if (name === "@lezer/highlight") return { tags: new Proxy({}, { get: () => ({}) }) };
    if (name === "@codemirror/language") return { HighlightStyle: { define: rules => rules } };
    if (name.startsWith("@codemirror/")) return {};
    throw Error(`Unexpected dependency: ${name}`);
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(require, module, module.exports);
  assert.equal(typeof module.exports.CSSCodeEditor, "function");
  assert.equal(grammarLoads, 0);
});
test("notices prefer modern message element and fall back to legacy container", () => {
  const legacy = {};
  const modern = {};
  assert.equal(host.getNoticeElement({ noticeEl: legacy }), legacy);
  assert.equal(host.getNoticeElement({ noticeEl: legacy, messageEl: modern }), modern);
});
test("native CLI requires desktop, correct API semantics and method presence", () => {
  let calls = 0;
  const plugin = { registerCliHandler() { calls++; } };
  assert.equal(host.supportsNativeCli(plugin, true, () => false), false);
  assert.equal(host.supportsNativeCli({}, true, () => true), false);
  assert.equal(host.supportsNativeCli(plugin, false, () => true), false);
  assert.equal(host.supportsNativeCli(plugin, true, version => version === "1.12.2"), true);
  assert.equal(calls, 0, "capability probing must not register unsupported commands");
});
test("legacy host initializes language without invoking unavailable APIs", () => {
  assert.equal(host.getHostLanguage({}, () => "ru"), "ru");
  assert.equal(host.getHostLanguage({}, () => null), "en");
  assert.equal(host.getHostLanguage({}, () => { throw Error("denied"); }), "en");
});
test("modern language takes precedence and does not read legacy storage", () => {
  assert.equal(host.getHostLanguage({ getLanguage: () => "de" }, () => { throw Error("unexpected"); }), "de");
});
test("attachment fallback is selected only when native saving is absent", () => {
  assert.equal(host.supportsAttachmentSave({}), false);
  assert.equal(host.supportsAttachmentSave({ saveAttachment: true }), false);
  assert.equal(host.supportsAttachmentSave({ saveAttachment() {} }), true);
});
test("eager legacy and deferred modern views both load safely", async () => {
  await host.loadLeafIfDeferred({});
  let calls = 0;
  const leaf = { async loadIfDeferred() { assert.equal(this, leaf); calls++; } };
  await host.loadLeafIfDeferred(leaf);
  assert.equal(calls, 1);
  await assert.rejects(host.loadLeafIfDeferred({ async loadIfDeferred() { throw Error("load failed"); } }), /load failed/);
});

const codec = load("src/svgPersistence/editableSvgCodec");
test("ordinary SVG import creates exactly one image and embeds original artwork", () => {
  const importer = load("src/svgPersistence/inlineSvgImport");
  const artwork = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 160"><text x="5" y="20">世界</text><path d="M0 0L10 10"/></svg>';
  const imported = importer.asEditableScene(artwork);
  assert.equal(imported.scene.elements.length, 1);
  assert.equal(imported.element.type, "image");
  assert.equal(imported.element.width, 320);
  assert.equal(imported.element.height, 160);
  assert.equal(imported.element.fileId, imported.file.id);
  assert.equal(Buffer.from(imported.file.dataURL.split(",")[1], "base64").toString("utf8"), artwork);
  const persisted = codec.saveEditableSvg(artwork, imported.markdown);
  assert.equal(codec.loadEditableSvg(persisted), imported.markdown);
});
test("repeated SVG round trips retain Unicode, formulas, scene and embedded image bytes", () => {
  const source = JSON.stringify({
    text: "Привет 世界 $x^2+y^2=z^2$",
    formula: String.raw`\begin{aligned}I_0&=\frac{S_0+S_2}{3}\\I_1&=x\end{aligned}`,
    elements: [{ id: "text", x: 12, y: 44, width: 200, height: 70, fontSize: 20 }],
    files: { svg: "data:image/svg+xml;base64,PHN2Zy8+", png: "data:image/png;base64,iVBORw0KGgo=" },
  });
  let markdown = source;
  for (let i = 0; i < 10; i++) {
    const svg = codec.saveEditableSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>', markdown);
    assert.equal((svg.match(/<metadata /g) || []).length, 1);
    assert.equal(codec.isEditableExcalidrawSvg(svg), true);
    markdown = codec.asInternalMarkdown(svg, true);
    assert.equal(markdown, source);
  }
});
test("invalid or foreign scene metadata fails closed", () => {
  assert.throws(() => codec.loadEditableSvg("<svg/>"), /metadata/);
  assert.throws(() => codec.loadEditableSvg('<svg><metadata id="obsidian-excalidraw-persistence">bad</metadata></svg>'));
});

const geometry = load("src/svgPersistence/mathOverlayGeometry");
test("text resizing preserves font and independently changes height or width", () => {
  const resize = load("src/svgPersistence/liveResizeCore");
  const start = { id: "t", type: "text", x: 10, y: 20, width: 200, height: 60, fontSize: 20, fontFamily: 1, originalText: "Power $P=UI$" };
  const south = resize.resizeGeometry(start, "s", 90, 40);
  assert.deepEqual(south, { x: 10, y: 20, width: 200, height: 100 });
  const east = resize.resizeGeometry(start, "e", -80, 40);
  assert.deepEqual(east, { x: 10, y: 20, width: 120, height: 60 });
  const changed = resize.layoutLiveText(start, start, east, {
    getFontString: ({ fontSize }) => { assert.equal(fontSize, 20); return "20px test"; },
    wrapText: (source, font, width) => { assert.equal(width, 120); return source.replace(" ", "\n"); },
  });
  assert.equal(changed.fontSize, 20);
  assert.equal(changed.originalText, start.originalText);
  assert.equal(changed.height, 60);
  assert.equal(changed.autoResize, false);
});
test("arrow label tracks changed endpoints without moving its editable source", () => {
  const text = { x: 5, y: 6, width: 40, height: 20 };
  const arrow = { type: "arrow", x: 100, y: 50, width: 200, height: 0, points: [[0, 0], [200, 0]] };
  assert.deepEqual(geometry.labelTopLeft(text, arrow), { x: 180, y: 40 });
  arrow.points[1] = [400, 0]; arrow.width = 400;
  assert.deepEqual(geometry.labelTopLeft(text, arrow), { x: 280, y: 40 });
  assert.deepEqual(text, { x: 5, y: 6, width: 40, height: 20 });
});
test("real bundled MathJax renders inline, display and aligned equations as vectors", () => {
  const { texToSvg } = load("src/svgPersistence/mathjaxRenderer");
  for (const [formula, display] of [
    ["x^2+y^2=z^2", false],
    [String.raw`\frac{a+b}{c}`, true],
    [String.raw`\begin{aligned}I_0&=\frac{S_0+S_2}{3}\\I_1&=\frac{S_0-S_2/2-\sqrt3 S_3/2}{3}\\I_2&=\frac{S_0-S_2/2+\sqrt3 S_3/2}{3}\end{aligned}`, true],
  ]) {
    const svg = texToSvg(formula, display);
    assert.match(svg, /<svg[\s>]/);
    assert.match(svg, /<path /);
    assert.doesNotMatch(svg, /data-mml-node="merror"/);
    assert.doesNotMatch(svg, /background(?:-color)?\s*:\s*(?:black|#000)/);
  }
});