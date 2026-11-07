// @ts-nocheck
/** Bundled MathJax output for Excalidraw's existing LaTeX image-element workflow.
 * The custom data retained by EA carries the editable TeX source.
 * This does NOT make ordinary text elements render TeX while editing.
 */
// @ts-nocheck
import {fileid} from '../constants/constants';
import {texToSvg} from './mathjaxRenderer';
const NS='http://www.w3.org/2000/svg';
export function renderEquationDataURL(source:string,scale=4) {
  const tex=source.trim().replace(/^\$\$([\s\S]*)\$\$$/,'$1').replace(/^\$([^$]*)\$$/,'$1');
  if(!tex)throw Error('LaTeX source is empty');
  const markup=texToSvg(tex,true);
  const doc=new DOMParser().parseFromString(markup,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('MathJax produced invalid XML');
  const svg=doc.getElementsByTagNameNS(NS,'svg')[0];
  if(!svg)throw Error('MathJax did not produce SVG');
  const box=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
  if(box.length!==4||box.some(x=>!Number.isFinite(x))||box[2]<=0||box[3]<=0)throw Error('MathJax SVG viewBox is invalid');
  const widthEx=parseFloat(svg.getAttribute('width')||'');
  const factor=Math.max(0.5,Math.min(8,scale));
  const width=Number.isFinite(widthEx)&&widthEx>0?widthEx*8*factor:box[2]/1000*16*factor;
  const height=width*box[3]/box[2];
  svg.setAttribute('width',width+'px'); svg.setAttribute('height',height+'px');
  svg.setAttribute('xmlns',NS);
  svg.removeAttribute('style');
  const xml=new XMLSerializer().serializeToString(svg);
  const bytes=new TextEncoder().encode(xml);
  let binary='';for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return {mimeType:'image/svg+xml',fileId:fileid(),dataURL:'data:image/svg+xml;base64,'+btoa(binary),created:Date.now(),size:{width,height}};
}
