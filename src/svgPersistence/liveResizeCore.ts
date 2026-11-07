// @ts-nocheck
/** Independent, fixed-font box resize geometry for unrotated text. No host dependencies. */
const MIN_WIDTH=24, MIN_HEIGHT=12;
export const eligibleText = el => !!el && el.type==='text' && !el.isDeleted &&
  !el.containerId && !(el.groupIds?.length) && (!el.angle || Math.abs(el.angle)<1e-7);
export const boxHandles = el => ({
  nw:[el.x,el.y],n:[el.x+el.width/2,el.y],ne:[el.x+el.width,el.y],
  e:[el.x+el.width,el.y+el.height/2],se:[el.x+el.width,el.y+el.height],
  s:[el.x+el.width/2,el.y+el.height],sw:[el.x,el.y+el.height],
  w:[el.x,el.y+el.height/2],
});
/** Choose nearest eligible handle; viewport coords must be supplied by the host's scene->viewport helper. */
export function hitTextHandle(el,px,py,sceneToViewport,tolerance=13) {
  if (!eligibleText(el)) return null;
  const handles=boxHandles(el);let selected=null,best=tolerance*tolerance;
  for(const [name,[x,y]] of Object.entries(handles)){
    const p=sceneToViewport(x,y);const dx=px-p.x,dy=py-p.y;
    const dist=dx*dx+dy*dy;
    if(dist<best){best=dist;selected=name;}
  }
  return selected;
}
/** Coordinate formula uses pointer delta from pointerdown, never iterative element geometry. */
export function resizeGeometry(start,handle,dx,dy){
  let x=start.x,y=start.y,w=start.width,h=start.height;
  if(handle.includes('e')) w=Math.max(MIN_WIDTH,start.width+dx);
  if(handle.includes('w')){w=Math.max(MIN_WIDTH,start.width-dx);x=start.x+start.width-w;}
  if(handle.includes('s')) h=Math.max(MIN_HEIGHT,start.height+dy);
  if(handle.includes('n')){h=Math.max(MIN_HEIGHT,start.height-dy);y=start.y+start.height-h;}
  return {x,y,width:w,height:h};
}
export function layoutLiveText(el,start,box,{getFontString,wrapText}){
  const font=getFontString({fontSize:start.fontSize,fontFamily:start.fontFamily});
  const source=start.originalText;
  const text=wrapText(source,font,box.width);
  return {...box,fontSize:start.fontSize,autoResize:false,text,originalText:source};
}
export const snapshotText = el => ({id:el.id,x:el.x,y:el.y,width:el.width,
  height:el.height,fontSize:el.fontSize,fontFamily:el.fontFamily,
  originalText:typeof el.originalText==='string'?el.originalText:el.text,
  fileId:el.fileId,angle:el.angle});
