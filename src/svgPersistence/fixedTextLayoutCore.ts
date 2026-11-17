// @ts-nocheck
/** v0.5: pure resize-transaction tracking and text reflow. No DOM or Excalidraw imports. */
const valid = n => Number.isFinite(n);
const changed = (a,b) => Math.abs(a-b)>0.25;
const hasGroup = el => (el.groupIds?.length||0)>0;
const sourceOf = el => typeof el.originalText==='string'?el.originalText:
  (typeof el.rawText==='string'?el.rawText:el.text);
const isText = el => el?.type==='text'&&!el.isDeleted&&!el.containerId&&!hasGroup(el);
const isMathImage = el => el?.type==='image'&&!el.isDeleted&&!hasGroup(el)&&
  Boolean(el.customData?.svgMathText?.source||el.customData?.latex);
const snapshot = elements => new Map(elements.filter(el=>!el.isDeleted).map(el=>[el.id,{
  type:el.type,x:el.x,y:el.y,width:el.width,height:el.height,angle:el.angle,
  fontSize:el.fontSize,source:sourceOf(el),version:el.version,
}]));
/** Tracks resize gesture; ignores normal moves, text edits and explicit font size commands. */
export class ResizeLayoutSession {
  constructor(){this.before=new Map();this.gesture=null;}
  reset(){this.before.clear();this.gesture=null;}
  observe(elements,state){
    if(state?.isLoading){this.reset();return [];}
    const resizing=Boolean(state?.isResizing);
    if(resizing&&!this.gesture){this.gesture=new Map(this.before);return [];}
    if(resizing)return [];
    const ended=this.gesture;
    this.gesture=null;
    this.before=snapshot(elements);
    if(!ended||state?.editingTextElement||state?.isRotating)return [];
    const out=[];
    for(const el of elements){
      const old=ended.get(el.id);
      if(!old||el.isDeleted||el.type!==old.type||!valid(el.width)||!valid(el.height))continue;
      if(!changed(el.width,old.width)&&!changed(el.height,old.height))continue;
      if(isText(el)&&valid(old.fontSize)&&old.fontSize>0&&typeof sourceOf(el)==='string'){
        out.push({kind:'text',id:el.id,version:el.version,old,source:sourceOf(el)});
      }else if(isMathImage(el)){
        out.push({kind:'math',id:el.id,version:el.version,old});
      }
    }
    return out;
  }
}
/** Excalidraw's actual text measuring functions are injected by the runtime wrapper. */
export function reflowText(el,operation,{getFontString,wrapText,measureText}){
  const size=operation.old.fontSize;
  const width=Math.max(24,el.width); // resizing controls width; never font size
  const font=getFontString({fontSize:size,fontFamily:el.fontFamily});
  const source=operation.source;
  const text=wrapText(source,font,width);
  const measured=measureText(text,font,el.lineHeight||1.25);
  if(!valid(measured.height)||measured.height<=0)return null;
  return {fontSize:size,autoResize:false,width,height:measured.height,
    text,originalText:source};
}
/** Latex remains an SVG image. Snap back from image scaling to avoid accidental font scaling.
 * Does not implement mathematical line breaking; that's a later text renderer change. */
export function keepMathScale(el,operation){
  const old=operation.old;
  if(!valid(old.width)||!valid(old.height)||old.width<=0||old.height<=0)return null;
  return {x:old.x,y:old.y,width:old.width,height:old.height};
}
