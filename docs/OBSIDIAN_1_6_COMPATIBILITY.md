# Obsidian 1.6.5 compatibility audit

## Status — experimental candidate, not runtime-certified

Audit date: 2026-11-07. Branch: `compat/obsidian-1.6.5`.
The mandatory Windows GUI acceptance matrix is **NOT RUN**. Do not deploy to an
irreplaceable vault. A successful bundle and mocked host tests do not establish
real host compatibility. No vault or existing Excalidraw 2.18 installation was modified.

## Baselines and repository safety

- Authoritative plugin repository: `zsviczian/obsidian-excalidraw-plugin` on GitHub,
  not `obsidianmd/obsidian-excalidraw-plugin`.
- Tag `2.29.0`: `4acaf9e375e1dfb731faec9c2dd3439bd52cc4cb` (local exact tag).
- Existing fork preserved in commit `73e1211`, including all supplied untracked
  files. This is **not pristine upstream**: SVG cumulative v1.1.1 marker,
  local MathJax, SVG save/load, inline images, export and resizing modules exist.
- The preserved snapshot also contains orphan files from a newer master snapshot.
  These were not deleted or silently attributed to compatibility changes.
- Engine remains `@zsviczian/excalidraw` **0.18.143**, React/ReactDOM **19.2.8**.
  No engine or dependency downgrade.
- Upstream plugin 2.18.0 declares minimum Obsidian **1.5.7**; it is reference
  material, not the backport's drawing engine.
- Development declarations remain Obsidian **1.8.7**. Historical **1.6.6**
  declarations were compared separately; this is a proxy, NOT exact 1.6.5 evidence.

## Evidence and method

Compared published `obsidian@1.6.6/obsidian.d.ts` and
`obsidian@1.8.7/obsidian.d.ts`, current official `obsidianmd/obsidian-api`
declarations with `@since` annotations, all runtime source imports and member
matches, private API augmentations in `src/types/types.d.ts`, and build external
modules. Recompiled once against the historical declaration file in a disposable
Linux workspace. The production dependency lock was not changed for that check.

Reference locations (repository/package identifiers, not bundled dependencies):

- `obsidianmd/obsidian-api`, `obsidian.d.ts`, `getLanguage`: `@since 1.8.7`.
- `obsidianmd/obsidian-developer-docs`, `en/Plugins/Guides/Defer views.md`:
  deferred views introduced in 1.7.2.
- Official Obsidian desktop release notes, 2024-06-25, version 1.6.5:
  optional installer Electron 30.1.2.
- Authoritative plugin tag `2.18.0`: manifest minimum 1.5.7.

## Findings

| Category | Source / API | Feature and evidence | Modification / verification |
|---|---|---|---|
| B | `src/constants/constants.ts`: `getLanguage()` | Called during module evaluation; missing in 1.6.6 declarations, introduced 1.8.7. Missing export can prevent plugin loading before `onload`. | Namespace feature detection via `compatibility/host.ts`; legacy `localStorage.language`, then `en`; storage errors contained. Both branches tested. Real startup pending. |
| C | `src/view/sidepanel/CSSCodeEditor.ts`: bundled `@lezer/css` calls external `LRParser.deserialize` with `NodeProp.isolate` | User startup stack mapped to generated CSS parser and host NodeProp deserializer. Host lacks requested property; plugin fails before onload. | Removed optional CSS grammar import; basic CSS text editing remains. Module-evaluation regression test added. Actual re-enable pending. |
| B | `src/utils/fileUtils.ts`: `app.saveAttachment()` | Undocumented and locally augmented, not guaranteed by either public declaration version. Image import previously invoked it unconditionally for active drawings. | Capability probe; when absent use existing hook/attachment-folder/unique-path/vault-write path. No attachment preference mutation. Selection tested; real host file write pending. |
| B | `src/view/sidepanel/MarkdownImageEditor.ts`: `leaf.loadIfDeferred()` | Added 1.7.2, absent in historical declarations. | Central helper invokes only if available; legacy `setViewState` eagerly loads. Tests cover no-op, bound method, error propagation. GUI pending. |
| B | `src/shared/ExcalidrawData.ts`, `src/view/ExcalidrawView.ts`: `Notice.messageEl` | Missing from historical declarations, which expose `noticeEl`. Affects slow font notices and mask-file interaction. | Shared helper prefers modern message element, otherwise documented legacy container. Both selection branches tested. GUI pending. |
| C | `src/core/managers/ExcalidrawCLI.ts`: `registerCliHandler` | Optional native CLI is 1.12.2+. | Centralized existing desktop/version/method checks; no registrations on old hosts. Capability test verifies probes have no registration side effects. |
| C | `src/core/settings.ts`: declarative definitions | API 1.13+ is already gated with `requireApiVersion`; legacy settings renderer remains. | Existing guard retained, no preference reset. Settings GUI pending. |
| A | `main.ts`, `ExcalidrawLoading.ts`, `ExcalidrawView.ts`: `registerView`, `registerExtensions`, `FileView`, `TextFileView`, `getLeaf`, `setViewState`, `onLayoutReady` | Core interfaces exist in historical declarations. SVG context-menu opt-in uses these interfaces rather than owning all SVG extensions. | No lifecycle rewrite. Runtime restoration, tab switching and restart pending. |
| A | `fileUtils.ts`, `pathUtils.ts`, SVG save route: `Vault.read/modify/create/createBinary/modifyBinary`, `getFileByPath/getFolderByPath`, `FileManager.renameFile/getAvailablePathForAttachment` | Historical public declarations provide these operations. | Existing implementation retained; codec repeated-cycle tests pass. Actual autosave interruption and rename pending. |
| A | command/menu/settings registration, workspace events, Markdown rendering | Found in historical API declarations; callbacks registered through existing plugin lifecycle helpers. | Retained, existing host-runner and Markdown-embed tests run. Not a GUI certification. |
| A | SVG math renderer | Bundles `mathjax-full`, independent of host MathJax or paid Extras. | Live MathJax inline/display/AMS rendering tests pass. Browser overlay/clipboard pending. |
| E | `src/types/types.d.ts`, `customEmbeddableUtils.ts`, `CanvasNodeFactory.ts`, `MonkeyPatchManager.ts`: private workspace/canvas internals, DOM helpers, host CodeMirror | Declaration augmentation does not prove runtime availability. Some optional integration code uses internal leaf/canvas APIs. | Remains a runtime risk; primary SVG workflow does not need Markdown image editor, AI or external-plugin integrations. No claim all private APIs have been certified. |
| E | `ViewExportManager.ts`, `mathSvgRasterize.ts`: clipboard, Canvas, SVG-to-image, font metrics | Browser permissions, OS clipboard, ownerDocument/popout behavior cannot be proven by Node mocks. | Export hooks retained. Windows selection SVG/PNG and backgrounds require manual tests. |

## Runtime audit

Installed app package was read without changing it: `obsidian-1.6.5.asar`
package version **1.6.5**. Installed `resources/app.asar` package version **1.3.5**.
The executable contains literal user-agent version strings **Electron/24.3.1**
and **Chrome/112.0.5615.183**. These are static executable evidence, NOT a live
`process.versions` capture. No remote-debugging interface was present in the
running application's command line. The agent did not attach to a real vault.

**Important:** the user's installer is older than the Electron 30.1.2 installer
associated with Obsidian 1.6.5. Capture live versions using the procedure below.
Do not infer Electron from the app version or from development Node 22.

Plugin target is ES2022, supported by Chromium 112 as a language baseline.
Engine runtime is distributed prebuilt and is not transpiled by this plugin's
TypeScript pass. Canvas, SVG, Pointer Events, ResizeObserver, clipboard, workers,
font loading, `:has()` and newer CSS used by the embedded editor need real-browser
checks. There is no demonstrated reason to replace the 2.29 engine. The engine's
actual old-Electron behavior, CSS and host-provided CodeMirror compatibility are
still open integration risks, not proven blockers or solved problems.

## Automated verification and known diagnostics

- `npm ci --no-audit --no-fund`: succeeded using Node 22.23.4 / npm 10.9.9.
- Initial `npm run test:compat`: 8/8 passed; subsequently expanded with native
  CLI gating, resize, ordinary SVG import and notice tests: final suite **12 tests**.
- `npm run test:obsidian:runner`: 11/11 passed.
- `npm run test:markdown-embeds`: 20/20 passed.
- `npm run build`: succeeded and JavaScript syntax check passed.
- Full `npx tsc --noEmit`: **fails**, including stale documentation declarations,
  published dependency declaration issues and preserved orphan master files
  (`cliIcons`, `cliImages`, Lucide picker, template/error dialogs). These are not
  fixed by suppressing type checking. Initial build emitted 32 TypeScript
  diagnostics from those orphan files; runtime Rollup graph still builds.
- Historical-declarations check also initially exposed weak structural interface
  errors in compatibility helpers; fixed by narrow `in`/`typeof` checks on
  `object`, without `any`, `ts-ignore` or dependency downgrades.
- Targeted ESLint on the compatibility helper initially passed. Full repository
  lint status must not be inferred from this.
- Production now uses `tsconfig.runtime.json`, rooted at the shipped entry point
  and ambient declarations. This avoids compiling unrelated orphan source/docs
  into the runtime check without deleting them or disabling tests. The broad
  upstream config remains available. `tsc --noEmit -p tsconfig.runtime.json`
  still reports published dependency/ambient augmentation declaration errors;
  no shipped runtime source errors were reported with either 1.8.7 or 1.6.6
  host declarations after the fallback fixes.
- MathJax circular-dependency warnings are inherited from the bundled MathJax
  graph, not a new host fallback.

## Reproducible WSL build

From the repository root with Node >=22 and npm >=10 selected:

```bash
bash scripts/build-compat-wsl.sh
```

The script copies the source to a fresh Linux temporary directory, runs locked
`npm ci`, compatibility and existing regression tests, production Rollup, and
`node --check`. It copies only built files to `dist/`. It needs no cumulative
patch package. It retains the workspace for diagnosis. It never installs into a
vault. All paths inside the script are derived from its own location.

## Manual Windows acceptance — NOT RUN

Use a **disposable** vault with the old plugin disabled. Keep the real 2.18
installation unchanged. This fork deliberately keeps the same plugin ID, so
both versions cannot independently coexist under that ID. Plugin isolation is a
separate task.

1. In Obsidian 1.6.5, open Developer Tools and record:

   ```js
   JSON.stringify({api: require('obsidian').apiVersion,
     runtime: process.versions, agent: navigator.userAgent})
   ```

2. Record console errors from a clean startup. Manually copy `dist/main.js`,
   `dist/styles.css`, `dist/manifest.json` into the test vault's plugin directory.
   Never copy the older release ZIP over the candidate. Enable the plugin.
3. Run every unchecked item below. Repeat on a newer Obsidian installation.
   For each failure, record app/installer version, exact steps, source fixture,
   console stack, expected/actual output and whether data remained recoverable.

- [ ] Enables on 1.6.5; no startup exception; canvas/tools respond.
- [ ] Existing editable SVG opens; all original elements and properties remain.
- [ ] Save/reopen ten times; Unicode, original formulas and metadata survive.
- [ ] SVG previews correctly in Obsidian and Edge, without duplicate metadata.
- [ ] Multiple autosaves, rename, close/reopen, tab switching and full restart.
- [ ] Simulated denied/interrupted save reports failure; original file survives.
- [ ] Ordinary SVG imports as **one** image object, not converted primitives.
- [ ] Insert PNG/SVG, remove source files, reopen; image bytes remain embedded.
- [ ] Vault attachment file count does not increase for inline SVG drawing imports.
- [ ] `$x^2+y^2=z^2$`, `$$\frac{a+b}{c}$$` and aligned formula below render.
- [ ] Inline math mixed with normal text, rectangle/ellipse/arrow labels render.
- [ ] Double-click formula edits original source; no auto image conversion.
- [ ] Copy/export selection to SVG and PNG renders math, not raw dollar notation.
- [ ] Formula background transparent; no duplicate text or black rectangles.
- [ ] Invalid formula reports failure but source and drawing element survive.
- [ ] N/S/E/corner text resizing: fixed font, live reflow, independent dimensions.
- [ ] Shape text remains positioned; moving arrow endpoints keeps label attached.
- [ ] Basic popout document ownership and unload do not leak listeners.
- [ ] Settings open, stored unknown preferences survive, old host has no CLI command registrations.

```latex
$$\begin{aligned}
I_0&=\frac{S_0+S_2}{3}\\
I_1&=\frac{S_0-S_2/2-\sqrt3 S_3/2}{3}\\
I_2&=\frac{S_0-S_2/2+\sqrt3 S_3/2}{3}
\end{aligned}$$
```

No failed GUI items or console stacks are supplied because these checks have
not been executed. This is not evidence that they pass.