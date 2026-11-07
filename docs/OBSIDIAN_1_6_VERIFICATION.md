# Compatibility candidate verification record

Date: 2026-11-07. Runtime GUI acceptance: **NOT RUN** on either old or new host.

## Commands executed

Repository inventory used `git status --short`, `git branch --show-current`,
`git remote -v`, `git log`, and exact tag/commit inspection. The supplied fork
was preserved before compatibility edits.

WSL Ubuntu, Node **22.23.4**, npm **10.9.9**. From repository root:

```bash
bash scripts/build-compat-wsl.sh
```

That script executed these commands in a fresh Linux workspace:

```bash
npm ci --no-audit --no-fund
npm run test:compat
npm run test:obsidian:runner
npm run test:markdown-embeds
npm run build
node --check dist/main.js
```

Additional validation in a disposable Linux build workspace:

```bash
npx eslint src/compatibility/host.ts
npm run test:compat
npx tsc --noEmit
npx tsc --noEmit -p tsconfig.runtime.json
```

The last command was repeated after temporarily replacing ONLY the disposable
workspace's `node_modules/obsidian/obsidian.d.ts` with published 1.6.6 declarations,
then restoring the original declarations before the final production build.
Neither dependency lock nor source declarations were downgraded.

## Results

| Check | Result |
|---|---|
| Locked install | PASS, 840 packages; deprecated-package warnings |
| Compatibility behavioral tests | PASS, 12/12 |
| Existing host runner tests | PASS, 11/11; mocks, not actual native host |
| Existing Markdown embed tests | PASS, 20/20 |
| Targeted compatibility helper ESLint | PASS, exit 0 |
| Final production Rollup | PASS, exit 0, approximately 30 seconds |
| JavaScript syntax | PASS |
| Manifest | Candidate version and minimum 1.6.5 preserved in output |
| Runtime source TypeScript, 1.8.7 | FAIL exit 2: dependency/ambient declaration errors only |
| Runtime source TypeScript, 1.6.6 | FAIL exit 2: dependency/ambient declaration errors only |
| Full repository TypeScript | FAIL: also orphan snapshot files and copied documentation declarations |
| Full repository lint | NOT RUN |
| Windows Obsidian GUI, old/new | NOT RUN |

Earlier targeted lint failures (unsafe Function calls/assignment) were fixed
with narrowed typed call signatures and an unknown result; latest run passes.
Earlier historical API errors for `getLanguage`, `loadIfDeferred` and
`Notice.messageEl` were fixed and no longer appear in runtime source checking.

Retained declaration failures include missing published Excalidraw/mermaid/
jotai-scope declaration imports, JSX namespace declarations, and Obsidian adapter/
Markdown subview interface augmentation mismatches. They were not disabled with
new suppression directives or skipLibCheck changes.

Production uses a runtime-rooted TS project to avoid checking unreferenced master
snapshot files during bundling. The original broad TS project remains unchanged
and its failures are explicitly reported. No upstream tests were disabled.

MathJax circular-dependency warnings remain. No production runtime-source
TypeScript warnings appeared in the final Rollup build.

## Evidence limitations

Host helpers and storage are tested as functions; these are not a real
Obsidian plugin initialization or vault I/O integration test. Persistence tests
exercise the actual codec, ordinary SVG import and repeated lossless scene data,
but not interrupted OS writes. MathJax tests invoke real bundled rendering, but
not the Windows clipboard, canvas overlay or host font metrics. Resize geometry
uses a test wrapping callback, not an actual browser font measurement.

The manual checklist and runtime-version capture procedure are in
`OBSIDIAN_1_6_COMPATIBILITY.md`. Until completed, this candidate does **not**
satisfy the requested runtime completion criterion.