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
  if (relative.endsWith(".json")) return JSON.parse(fs.readFileSync(path.resolve(root, relative), "utf8"));
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
test("bundled variable italic keeps the saved font ID without replacing Local Font", () => {
  const { registerLatexTextItalic, LATEX_TEXT_ITALIC, LATEX_TEXT_ITALIC_ID } = load("src/fonts/latexTextItalic");
  assert.equal(LATEX_TEXT_ITALIC, "LaTeX Math Italic");
  assert.equal(LATEX_TEXT_ITALIC_ID, 10001);
  const registered = new Map([[4, { local: true }]]);
  const calls = [];
  const runtime = { FONT_FAMILY: { "Local Font": 4, Excalifont: 5 }, Fonts: {
    registered, register: (name, metadata, face) => {
      assert.equal(name, LATEX_TEXT_ITALIC);
      assert.ok(metadata.metrics.ascender > 0);
      assert.match(face.uri, /^data:font\/otf;base64,/);
      assert.equal(Buffer.from(face.uri.split(",")[1], "base64").subarray(0, 4).toString(), "OTTO");
      assert.ok(Buffer.from(face.uri.split(",")[1], "base64").includes(Buffer.from("MathJax_Math")));
      registered.set(runtime.FONT_FAMILY[name], { metadata, face });
      calls.push(name);
    },
  } };
  registerLatexTextItalic(runtime);
  registerLatexTextItalic(runtime);
  assert.equal(calls.length, 1);
  assert.equal(runtime.FONT_FAMILY[LATEX_TEXT_ITALIC], LATEX_TEXT_ITALIC_ID);
  assert.deepEqual(registered.get(4), { local: true });
  assert.throws(() => registerLatexTextItalic({ FONT_FAMILY: { Other: LATEX_TEXT_ITALIC_ID }, Fonts: runtime.Fonts }), /occupied/);
});
test("background autoexports typeset SVG and rasterize math PNG without a live view", async () => {
  const { DOMParser, XMLSerializer } = nativeRequire("@xmldom/xmldom");
  const previousParser = globalThis.DOMParser;
  globalThis.DOMParser = DOMParser;
  try {
    const source = fs.readFileSync(path.join(root, "src/core/managers/AutoexportCoordinator.ts"), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    let text = "xx $Y^2$", nativePng = 0, rasterized = 0;
    const require = name => {
      if (name.endsWith("mathSvgRasterize")) return { rasterizeMathSvg: async (svg, scale) => {
        assert.equal(scale, 2);
        assert.ok(svg.getElementsByTagName("path").length > 0);
        assert.doesNotMatch(Array.from(svg.getElementsByTagName("text"), el => el.textContent).join(""), /\$/);
        rasterized++;
        return new Blob(["rendered"], { type: "image/png" });
      } };
      if (name.startsWith("../../svgPersistence/")) return load("src/svgPersistence/" + name.split("/").at(-1));
      if (name.endsWith("saveSnapshot")) return { cloneSceneForSave: structuredClone };
      if (name === "../../utils/utils") return {
        getSVG: async (scene, settings, padding, file, files) => {
          assert.equal(scene.appState.theme, "dark");
          assert.equal(settings.withBackground, false);
          assert.equal(settings.skipInliningFonts, false);
          assert.equal(padding, 12);
          assert.equal(file.path, "drawing.md");
          assert.equal(files.image, "embedded");
          const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="20" font-size="20px">${text}</text></svg>`, "image/svg+xml").documentElement;
          Object.defineProperty(svg, "outerHTML", { get: () => new XMLSerializer().serializeToString(svg) });
          return svg;
        },
        getPNG: async () => { nativePng++; return new Blob(["native"]); },
      };
      return {};
    };
    const module = { exports: {} };
    new Function("require", "module", "exports", compiled.outputText)(require, module, module.exports);
    const coordinator = Object.create(module.exports.AutoexportCoordinator.prototype);
    const scene = { elements: [{ type: "text", text, originalText: "" }], appState: { theme: "light" } };
    const before = structuredClone(scene);
    const request = { exportOptions: { padding: 12, scale: 2, withBackground: false, embedScene: false } };
    const context = { scene, overrideFiles: { image: "embedded" } };
    const args = [request, { path: "drawing.md" }, "dark", context];
    const svg = await coordinator.renderSVG(...args);
    assert.match(svg, /<path/);
    assert.doesNotMatch(svg, /<text[^>]*>[^<]*\$/);
    assert.equal((await coordinator.renderPNG(...args)).type, "image/png");
    assert.equal(rasterized, 1);
    assert.equal(nativePng, 0);
    text = "ordinary text";
    await coordinator.renderPNG(...args);
    assert.equal(nativePng, 1);
    assert.deepEqual(scene, before);
  } finally {
    if (previousParser === undefined) delete globalThis.DOMParser;
    else globalThis.DOMParser = previousParser;
  }
});
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
test("text resizing preserves font and permits only horizontal handles", () => {
  const resize = load("src/svgPersistence/liveResizeCore");
  const start = { id: "t", type: "text", x: 10, y: 20, width: 200, height: 60, fontSize: 20, fontFamily: 1, originalText: "Power $P=UI$" };
  for (const handle of ["n", "s", "nw", "ne", "sw", "se"]) {
    assert.equal(resize.isHorizontalTextHandle(handle), false);
    assert.deepEqual(resize.resizeGeometry(start, handle, 90, 40),
      { x: 10, y: 20, width: 200, height: 60 });
  }
  assert.equal(resize.isHorizontalTextHandle("e"), true);
  assert.equal(resize.isHorizontalTextHandle("w"), true);
  assert.deepEqual(resize.resizeGeometry(start, "w", 80, 40),
    { x: 90, y: 20, width: 120, height: 60 });
  const east = resize.resizeGeometry(start, "e", -80, 40);
  assert.deepEqual(east, { x: 10, y: 20, width: 120, height: 60 });
  const changed = resize.layoutLiveText(start, start, east, {
    getFontString: ({ fontSize }) => { assert.equal(fontSize, 20); return "20px test"; },
    wrapText: (source, font, width) => { assert.equal(width, 120); return source.replace(" ", "\n"); },
    measureText: text => ({ height: text.split("\n").length * 25 }),
  });
  assert.equal(changed.fontSize, 20);
  assert.equal(changed.originalText, start.originalText);
  assert.equal(changed.height, 50);
  assert.equal(changed.autoResize, false);
});
test("text pointer handler consumes disabled handles without starting native or custom resize", () => {
  const source = fs.readFileSync(path.join(root, "src/svgPersistence/liveTextResize.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const require = name => name.endsWith("liveResizeCore") ? load("src/svgPersistence/liveResizeCore") : {
    sceneCoordsToViewportCoords: ({ sceneX, sceneY }) => ({ x: sceneX, y: sceneY }),
    viewportCoordsToSceneCoords: ({ clientX, clientY }) => ({ x: clientX, y: clientY }),
  };
  new Function("require", "module", "exports", compiled.outputText)(require, module, module.exports);
  const element = { id: "t", type: "text", x: 100, y: 100, width: 200, height: 100 };
  for (const [handle, [clientX, clientY]] of Object.entries(load("src/svgPersistence/liveResizeCore").boxHandles(element))) {
    const listeners = new Set();
    const doc = { addEventListener: (name, fn) => listeners.add(fn), removeEventListener: (name, fn) => listeners.delete(fn) };
    const root = { ownerDocument: doc, contains: () => true };
    const view = { contentEl: root, file: {}, excalidrawAPI: {
      getAppState: () => ({ activeTool: { type: "selection" }, selectedElementIds: { t: true } }),
      getSceneElements: () => [element],
    } };
    const resize = new module.exports.LiveTextResize(view);
    resize.ensure();
    let consumed = 0;
    resize.onDown({ button: 0, isPrimary: true, pointerId: 1, clientX, clientY,
      target: { closest: () => root }, preventDefault: () => consumed++,
      stopPropagation: () => {}, stopImmediatePropagation: () => {} });
    assert.equal(consumed, 1, handle);
    assert.equal(listeners.has(resize.onMove), handle === "e" || handle === "w", handle);
    // Native handles are offset outside the text bounds, including after reflow.
    resize.end(false);
    element.height = 160;
    consumed = 0;
    resize.onDown({ button: 0, isPrimary: true, pointerId: 2,
      clientX: element.x + element.width + 12, clientY: element.y + element.height + 12,
      target: { closest: () => root }, preventDefault: () => consumed++,
      stopPropagation: () => {}, stopImmediatePropagation: () => {} });
    assert.equal(consumed, 1);
    assert.equal(listeners.has(resize.onMove), false);
    element.height = 100;
    const styles = new Map();
    const target = { closest: () => root, style: {
      getPropertyValue: key => styles.get(key)?.[0] || "",
      getPropertyPriority: key => styles.get(key)?.[1] || "",
      setProperty: (key, value, priority) => styles.set(key, [value, priority]),
    } };
    resize.onHover({ clientX: 200, clientY: 88, target, stopImmediatePropagation() {} });
    assert.deepEqual(styles.get("cursor"), ["default", "important"]);
    resize.onHover({ clientX: 312, clientY: 150, target, stopImmediatePropagation() {} });
    assert.deepEqual(styles.get("cursor"), ["ew-resize", "important"]);
    resize.dispose();
    assert.deepEqual(styles.get("cursor"), ["", ""]);
    assert.equal(listeners.size, 0);
  }
});
test("text height follows edited content and shrinks again without changing width", async () => {
  const source = fs.readFileSync(path.join(root, "src/svgPersistence/liveTextResize.ts"), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const module = { exports: {} };
  const require = name => name.endsWith("liveResizeCore") ? load("src/svgPersistence/liveResizeCore") : {
    CaptureUpdateAction: { NEVER: "NEVER" }, getFontString: () => "20px test",
    measureText: text => ({ height: text.split("\n").length * 25 }),
  };
  new Function("require", "module", "exports", compiled.outputText)(require, module, module.exports);
  let elements = [{ id: "t", type: "text", width: 120, height: 300, fontSize: 20, text: "one", version: 1 }];
  const state = {};
  const doc = { addEventListener() {}, removeEventListener() {} };
  const view = { file: {}, contentEl: { ownerDocument: doc }, excalidrawAPI: {
    getAppState: () => state, getSceneElements: () => elements,
  }, updateScene: update => { elements = update.elements; }, setDirty() {} };
  const resize = new module.exports.LiveTextResize(view);
  const settle = async () => { resize.onChange(); await new Promise(resolve => setTimeout(resolve, 10)); };
  await settle();
  assert.equal(elements[0].height, 25);
  elements[0].text = "one\ntwo\nthree";
  await settle();
  assert.equal(elements[0].height, 75);
  elements[0].text = "one";
  await settle();
  assert.equal(elements[0].height, 25);
  assert.equal(elements[0].width, 120);
  assert.equal(elements[0].fontSize, 20);
  resize.dispose();
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