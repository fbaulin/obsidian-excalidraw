// @ts-nocheck
// @ts-nocheck
import {mathjax} from 'mathjax-full/js/mathjax.js';
import {TeX} from 'mathjax-full/js/input/tex.js';
import {AllPackages} from 'mathjax-full/js/input/tex/AllPackages.js';
import {SVG} from 'mathjax-full/js/output/svg.js';
import {liteAdaptor} from 'mathjax-full/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from 'mathjax-full/js/handlers/html.js';
const adaptor=liteAdaptor();RegisterHTMLHandler(adaptor);
const engine=mathjax.document('',{InputJax:new TeX({packages:AllPackages}),OutputJax:new SVG({fontCache:'none'})});
/** Produces independent vector SVG; do not export MathJax's error box as artwork. */
export function texToSvg(tex,display=false){
  const normalized=String(tex??'').trim();
  if(!normalized)throw new Error('Empty LaTeX');
  const result=adaptor.outerHTML(engine.convert(normalized,{display}));
  if(/(?:data-mml-node|data-mjx-error)=["'](?:merror|true)["']|<mjx-merror\b|<merror\b/i.test(result))
    throw new Error('MathJax could not typeset formula: '+normalized);
  if(!/<svg[\s>]/i.test(result))throw new Error('MathJax returned no SVG');
  return result;
}
