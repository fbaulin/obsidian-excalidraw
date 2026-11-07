// @ts-nocheck
import {splitMath} from './mathSyntax';
const NS='http://www.w3.org/2000/svg';
const number=(value,fallback=NaN)=>{const n=parseFloat(String(value??''));return Number.isFinite(n)?n:fallback;};
const isMath=part=>part.type==='math';
// Excalidraw's getSVG() normally returns a *detached* SVG. For detached SVGs
// SVGTextContentElement.getComputedTextLength() may return 0 even for visible text.
// Treat zero as invalid for nonempty text; otherwise subsequent math overlaps it.
function cssValue(el,key) {
  for(let cur=el;cur&&cur.nodeType===1;cur=cur.parentNode){
    const attr=cur.getAttribute?.(key);
    if(attr)return attr;
    const inline=cur.getAttribute?.('style')||'';
    const match=inline.match(new RegExp('(?:^|;)\\s*'+key+'\\s*:\\s*([^;]+)','i'));
    if(match)return match[1].trim();
  }
  return null;
}
function textWidth(value,fontSize,original,doc,provided) {
  if(!value)return 0;
  let width=NaN;
  if(provided){try{width=provided(value,fontSize,original);}catch{}}
  if(!(Number.isFinite(width)&&width>0)){
    try{
      const canvas=doc.createElement('canvas');
      const ctx=canvas.getContext?.('2d');
      if(ctx){
        const family=cssValue(original,'font-family')||'Arial, sans-serif';
        const weight=cssValue(original,'font-weight')||'normal';
        const style=cssValue(original,'font-style')||'normal';
        ctx.font=`${style} ${weight} ${fontSize}px ${family}`;
        width=ctx.measureText(value).width;
        const spacing=number(cssValue(original,'letter-spacing'),0);
        if(spacing)width+=Math.max(0,value.length-1)*spacing;
      }
    }catch{}
  }
  if(!(Number.isFinite(width)&&width>0)){
    try{
      const probe=original.cloneNode(false);
      probe.textContent=value;
      probe.setAttribute('text-anchor','start');
      probe.setAttribute('x','0');probe.setAttribute('y','0');
      original.parentNode.appendChild(probe);
      try{width=probe.getComputedTextLength?.();}finally{probe.remove();}
    }catch{}
  }
  // Last resort: never allow a nonempty run to occupy zero width.
  if(!(Number.isFinite(width)&&width>0))width=value.length*fontSize*.56;
  return width;
}

/** Render $...$ and $$...$$ inside the *actual* exported SVG text nodes.
 * Excalidraw serializes shape-bound labels into SVG text too. No scene-text
 * equality assumption: Excalidraw may wrap/reformat its text before export.
 * Scene and original source remain untouched and are embedded by the codec.
 */
export function overlayMathInSvg(svg,scene,texToSvg,{parseXml,measureText}={}) {
  const parser=parseXml||(value=>new DOMParser().parseFromString(value,'image/svg+xml'));
  const doc=svg.ownerDocument;
  const nodes=Array.from(svg.getElementsByTagName('text'));
  let converted=0,skipped=0,groupsConverted=0;
  const expected=(scene?.elements||[]).filter(el=>el.type==='text'&&!el.isDeleted&&
    splitMath(String(el.originalText??el.text??'')).some(isMath)).length;
  const sourceSeen=new Set();
  for(const original of nodes) {
    // Don't rewrite text inside definitions, masks, or metadata.
    let ancestor=original.parentNode,ignore=false;
    while(ancestor&&ancestor!==svg){
      if(['defs','mask','clipPath','metadata','pattern'].includes(ancestor.localName)){ignore=true;break;}
      ancestor=ancestor.parentNode;
    }
    if(ignore||!original.parentNode)continue;
    // Multiline positioned tspans need a line-level layout pass (not yet supported).
    // Do not collapse them into one line, which can cause overlap or lost text.
    const tspans=Array.from(original.getElementsByTagName('tspan'));
    if(tspans.length>1){skipped++;continue;}
    const source=original.textContent||'';
    const parts=splitMath(source);
    if(!parts.some(isMath))continue;
    const fontSize=number(cssValue(original,'font-size'),20);
    const x=number(original.getAttribute('x')??tspans[0]?.getAttribute('x'),NaN);
    const y=number(original.getAttribute('y')??tspans[0]?.getAttribute('y'),NaN);
    if(!Number.isFinite(x)||!Number.isFinite(y)||fontSize<=0){skipped++;continue;}
    const color=cssValue(original,'fill')||'#000000';
    const computed=[];let ok=true;
    for(const part of parts){
      if(part.type==='text') {
        const width=textWidth(part.value,fontSize,original,doc,measureText);
        computed.push({type:'text',value:part.value,width});
      } else {
        try {
          const parsed=parser(texToSvg(part.value,part.display));
          if(parsed.getElementsByTagName('parsererror').length)throw Error('MathJax produced invalid XML');
          const from=parsed.getElementsByTagName('svg')[0];
          if(!from)throw Error('MathJax returned no SVG');
          const vb=(from.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
          if(vb.length!==4||!vb.every(Number.isFinite)||vb[2]<=0||vb[3]<=0)throw Error('Invalid MathJax viewBox');
          // MathJax SVG viewBox uses 1000 units per em. Its glyphs remain true paths.
          const scale=fontSize/1000;
          const width=vb[2]*scale, height=vb[3]*scale;
          computed.push({type:'math',part,from,vb,width,height,scale});
        } catch(e){console.warn('SVG fork: failed to export LaTeX',part.value,e);ok=false;break;}
      }
    }
    if(!ok){skipped++;continue;} // Never delete original text on render failure.
    const total=computed.reduce((sum,p)=>sum+p.width,0);
    const anchor=original.getAttribute('text-anchor');
    let cursor=x-(anchor==='middle'?total/2:anchor==='end'?total:0);
    const group=doc.createElementNS(NS,'g');
    group.setAttribute('data-svg-fork-math','true');
    group.setAttribute('data-latex-source',source);
    // The upstream <g> already carries element transforms. Preserve any per-line ones.
    for(const attr of Array.from(original.attributes))
      if(['transform','opacity','clip-path','mask','direction'].includes(attr.name))
        group.setAttribute(attr.name,attr.value);
    for(const piece of computed){
      if(piece.type==='text'){
        if(piece.value){
          const t=doc.createElementNS(NS,'text');
          for(const attr of Array.from(original.attributes))
            if(!['x','y','text-anchor','transform','opacity','clip-path','mask'].includes(attr.name))
              t.setAttribute(attr.name,attr.value);
          t.setAttribute('text-anchor','start');t.setAttribute('x',String(cursor));t.setAttribute('y',String(y));
          t.textContent=piece.value;group.appendChild(t);
        }
      } else {
        const nested=doc.importNode(piece.from,true);
        nested.removeAttribute('id');
        nested.setAttribute('x',String(cursor));
        nested.setAttribute('y',String(y+piece.vb[1]*piece.scale));
        nested.setAttribute('width',String(piece.width));
        nested.setAttribute('height',String(piece.height));
        nested.setAttribute('color',color);nested.setAttribute('fill',color);
        nested.setAttribute('style',`color:${color};overflow:visible`);
        nested.setAttribute('data-latex',piece.part.value);
        group.appendChild(nested);converted++;
      }
      cursor+=piece.width;
    }
    original.parentNode.replaceChild(group,original);
    groupsConverted++;
    sourceSeen.add(source);
  }
  // Detect math-bearing scene elements that still had no SVG text candidate.
  // This is diagnostic only: don't corrupt or reject a valid editable drawing.
  if(expected>groupsConverted)skipped+=expected-groupsConverted;
  return {converted,skipped,groupsConverted,expected};
}
