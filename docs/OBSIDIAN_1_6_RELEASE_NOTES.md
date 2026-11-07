# Candidate 5 — actual context-menu and keyboard event routing

The user reports candidate 4 still fails image copy, while Save as editable SVG
renders formulas correctly. Investigation of the shipped Obsidian engine shows
`getContextMenuItems` retains original `actionCopyAsPng/actionCopyAsSvg` objects
and `executeAction(item)` invokes them directly. Replacing the action registry
does not replace those menu objects. Earlier action-registry mocks missed this.

Mounted drawing views now capture their own image-copy menu clicks and
Alt+Shift+C, using the host export manager. PNG clipboard rendering explicitly
rasterizes `getSVG`, the route used by the working editable-SVG save command.
Text inputs and other views are excluded; React effect cleanup removes handlers.
A success notice identifies the new path; failures display an error notice.

Real Edge DOM event regression fixture:
`node scripts/testing/mathCopyBrowser.mjs math-copy-browser.html`, then open the
generated HTML in a browser. It tests nested menu targets, retained native action
bypass, PNG/SVG routing, Alt+Shift+C, text-input exclusion, other-view isolation,
and cleanup. It does not certify the actual Windows clipboard inside Obsidian.
Native action registration remains for action-palette/API consumers.

# SVG v1.1.1 / Obsidian 1.6.5 compatibility candidate 1

## Candidate 4: shortcut regression and export gating

- Restore native Alt+Shift+C (`KeyC`, Alt, Shift) on the replacement PNG copy
  action. The candidate 3 replacement omitted `keyTest`; this regression is
  confirmed and now covered by a behavioral test.
- Run the SVG math renderer against actual exported text regardless of the
  scene's cached `originalText`. Check both `text` and `originalText` when
  detecting math; rasterize rendered SVG if it contains math groups.
- Add an integration test exercising real `ViewExportManager.getSVG()` and
  `svg()` with a stale source-text cache, plus a native-browser DOM smoke test
  performed externally in headless Edge. Eighteen compatibility tests pass.
- The user's continuing raw-LaTeX output has NOT been reproduced in a running
  Obsidian renderer. The stale cache is a tested failure mode, not a confirmed
  diagnosis of that drawing. Clipboard/PNG acceptance inside Obsidian remains
  required; do not label that issue fully resolved from these tests.

## Candidate 3 — math in copied/exported images

- User confirmed candidate 2 starts in Obsidian 1.6.5.
- Override per-editor native Copy as SVG/PNG actions through the public
  `registerAction` API: those actions previously bypassed the host math exporter.
- Apply vector math export to Markdown-backed drawings too, not just `.svg` files.
- PNG output uses the math-expanded SVG rasterizer; formula source and scene
  elements are not converted into images or modified by copying.
- Tests exercise native action routing, selection/full-canvas behavior,
  clipboard errors and real MathJax replacement of standalone and centered
  shape-label SVG text, based on the reported failing export.
- Manual acceptance still required: copy selected text and shape labels as SVG
  and PNG, export using the host dialog, confirm vector formulas/no raw dollars,
  then reopen and edit the original formula source.
- This does not replace the engine's unrelated programmatic `exportToBlob`
  calls in optional AI integrations or implement multiline positioned tspans.

## Candidate 2 — reported plugin-load failure

User runtime evidence: Obsidian 1.6.5 failed at plugin module evaluation with
`TypeError: Cannot read properties of undefined (reading 'deserialize')`.
The supplied plugin position maps to `@lezer/css`'s `LRParser.deserialize`.
The installed host app position maps to NodeProp lookup/deserialization.
The bundled CSS grammar uses `NodeProp.isolate`, absent from that host runtime.

Removed the eager `@codemirror/lang-css` import from the optional sidepanel CSS
editor. Basic CodeMirror text editing, history and boilerplate insertion remain;
CSS grammar highlighting/completion is unavailable on this compatibility branch
(including newer hosts). No engine/dependency downgrade or global NodeProp
mutation. Dynamic imports are not a safe guard in this single-file build:
Rollup's `inlineDynamicImports` can eagerly evaluate those modules.

Added a behavioral module-evaluation regression test with an incompatible grammar
loader that throws if invoked. Candidate version: `2.29.0-svg.11.1-compat.2`.
Re-enabling the rebuilt plugin in the user's host is still required to confirm
the reported failure is resolved and discover any subsequent host issues.

**Experimental, not verified inside an Obsidian 1.6.5 renderer.** The manifest
minimum permits testing; it is not a runtime certification. See
`OBSIDIAN_1_6_COMPATIBILITY.md` for the outstanding acceptance matrix.

## Changes

- Avoid module-load failure when the host lacks `getLanguage()` (introduced 1.8.7).
  Prefer the native language API when present; otherwise read the legacy language
  storage key, defaulting to English if storage is unavailable.
- Check undocumented `app.saveAttachment()` before using it. On older hosts,
  retain the existing attachment-folder, path hook, unique-name and vault writer
  implementation instead. Do not change attachment preferences.
- Skip `loadIfDeferred()` on eager-loading hosts older than 1.7.2.
- Fall back from `Notice.messageEl` to legacy `noticeEl` for mask-file and
  slow-font notification listeners.
- Centralize optional native CLI detection. Keep its desktop/version/method guard;
  do not register it on 1.6.5. Legacy settings rendering remains available.
- Type the arrow geometry input to remove an inherited implicit-any diagnostic.
- Add behavioral host, persistence, resize, arrow-label and real MathJax tests.
- Add a relative-path WSL build script that works directly from this source,
  uses the dependency lock and does not apply historical patches or deploy to a vault.
- Both source manifests declare candidate version `2.29.0-svg.11.1-compat.1`
  and minimum app `1.6.5`; Rollup copies the production manifest and embeds the
  beta manifest version, so both must agree.

## Preserved

No drawing engine downgrade, codec migration, plugin ID change, drawing metadata
change, setting reset or original 2.18 installation modification. The complete
SVG v1.1.1 source stays in Git, including inline image persistence, local MathJax,
SVG/PNG export hooks, fixed-font resizing and ordinary SVG single-image import.
Preservation of source is not a claim of GUI regression testing.

## Risks and unsupported workflows

- Dual-plugin coexistence with 2.18 under the same ID is not supported.
- Native CLI and declarative settings require their original newer host APIs.
- Mobile is not part of this compatibility certification.
- Private canvas/workspace APIs, old installer Chromium, host CodeMirror,
  clipboard, popouts, autosave interruption and arrow overlays need GUI testing.
- Installed executable appears to be Electron 24.3.1 / Chromium 112, older than
  the optional Electron 30.1.2 installer for Obsidian 1.6.5. Capture live runtime
  versions before interpreting failures.
- The supplied snapshot has unrelated TypeScript diagnostics in orphan newer
  feature files and declaration files. Full `tsc` is not clean. They are recorded
  rather than suppressed. Production Rollup succeeds despite those diagnostics.