// Generate a standalone real-DOM event regression fixture. Open in a browser.
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(new URL("../../src/svgPersistence/mathCopyEvents.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const html = `<!doctype html><meta charset="utf-8"><div id="drawing"><canvas tabindex="0"></canvas><textarea></textarea></div><div id="other"></div><div class="context-menu"><li data-testid="copyAsPng"><span>PNG</span></li><li data-testid="copyAsSvg">SVG</li></div><pre id="result">RUNNING</pre><script>
const exports = {};
${code}
(async () => {
 const root=document.querySelector('#drawing'), canvas=root.querySelector('canvas'), menu=document.querySelector('.context-menu');
 const calls=[], errors=[];
 const dispose=exports.installMathCopyEvents(root,async format=>{calls.push(format)},e=>errors.push(String(e)));
 const assert=(condition,message)=>{if(!condition)throw Error(message)};
 let native=0; menu.addEventListener('click',()=>native++);
 canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));
 menu.querySelector('span').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
 assert(calls.join()==='png' && native===0,'retained native context action must be bypassed');
 canvas.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));
 menu.querySelector('[data-testid="copyAsSvg"]').click();
 assert(calls.join()==='png,svg','SVG context route');
 canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC',key:'C',altKey:true,shiftKey:true,bubbles:true,cancelable:true}));
 assert(calls.join()==='png,svg,png','Alt Shift C route');
 root.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC',altKey:true,shiftKey:true,bubbles:true}));
 document.querySelector('#other').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}));
 menu.querySelector('span').click();
 assert(calls.length===3 && native===1,'other view and text editor must be untouched');
 dispose();
 canvas.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyC',altKey:true,shiftKey:true,bubbles:true}));
 assert(calls.length===3,'cleanup removes handlers');
 assert(errors.length===0,'no handler errors');
 document.querySelector('#result').textContent='PASS: context PNG/SVG, nested target, Alt+Shift+C, editor exclusion, other-view isolation, cleanup';
})().catch(error=>document.querySelector('#result').textContent='FAIL: '+error.stack);
</script>`;
fs.writeFileSync(process.argv[2] || "math-copy-browser.html", html);