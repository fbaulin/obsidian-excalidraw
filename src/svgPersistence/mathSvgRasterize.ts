// @ts-nocheck
/** Rasterize the already MathJax-expanded SVG (including selected-only scenes).
 * The standard Excalidraw PNG pipeline loses our HTML canvas math overlay.
 */
export async function rasterizeMathSvg(svg: SVGSVGElement, scale=1): Promise<Blob> {
  const vb=(svg.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const toNum=(s: string)=>Number.parseFloat(String(s||''));
  let width=toNum(svg.getAttribute('width')),height=toNum(svg.getAttribute('height'));
  if((!(width>0&&height>0)||/[a-z%]/i.test(svg.getAttribute('width')||'')||/[a-z%]/i.test(svg.getAttribute('height')||''))&&vb.length===4&&vb.every(Number.isFinite)){
    width=vb[2];height=vb[3];
  }
  if(!(width>0&&height>0))throw new Error('SVG export has invalid dimensions');
  const s=Math.max(.25,Math.min(8,Number(scale)||1));
  const w=Math.max(1,Math.ceil(width*s)),h=Math.max(1,Math.ceil(height*s));
  if(w*h>64000000)throw new Error('PNG export is too large');
  const clone=svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  const body=new XMLSerializer().serializeToString(clone);
  const blob=new Blob([body],{type:'image/svg+xml;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  try {
    const img=new Image();
    await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('SVG could not be loaded for PNG export'));img.src=url;});
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas 2D unavailable');
    ctx.drawImage(img,0,0,w,h);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG rasterization failed')),'image/png'));
  } finally {URL.revokeObjectURL(url);}
}
