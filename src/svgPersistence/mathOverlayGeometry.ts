/** Screen-independent geometry for SVG-fork's formula labels. */
interface ArrowGeometry {
  type: string;
  points?: readonly (readonly number[])[];
  angle?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
export function arrowLabelCenter(arrow: ArrowGeometry): {x:number,y:number}|null {
  if (!arrow || !['arrow','line'].includes(arrow.type) || !Array.isArray(arrow.points) || arrow.points.length < 2) return null;
  const points = arrow.points.map((p: unknown) => {
    if(!Array.isArray(p) || p.length<2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1]))return null;
    return [p[0],p[1]] as [number,number];
  });
  if(points.some(p=>!p))return null;
  const path=points as [number,number][];
  let total=0;
  for(let i=1;i<path.length;i++)total+=Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]);
  if(total===0)return null;
  let distance=total/2,px=path[0][0],py=path[0][1];
  for(let i=1;i<path.length;i++) {
    const dx=path[i][0]-path[i-1][0],dy=path[i][1]-path[i-1][1],segment=Math.hypot(dx,dy);
    if(distance<=segment || i===path.length-1){const ratio=segment?Math.min(1,distance/segment):0;
      px=path[i-1][0]+ratio*dx;py=path[i-1][1]+ratio*dy;break;}
    distance-=segment;
  }
  // Excalidraw's points are local; rotate around the arrow bounds center.
  const angle=Number(arrow.angle)||0, x=Number(arrow.x)||0, y=Number(arrow.y)||0;
  const cx=(Number(arrow.width)||0)/2,cy=(Number(arrow.height)||0)/2;
  const cos=Math.cos(angle),sin=Math.sin(angle),rx=px-cx,ry=py-cy;
  return {x:x+cx+rx*cos-ry*sin,y:y+cy+rx*sin+ry*cos};
}
export function labelTopLeft(text:any,container:any):{x:number,y:number} {
  if(container && (container.type==='arrow'||container.type==='line')){
    const center=arrowLabelCenter(container);
    if(center)return {x:center.x-(Number(text.width)||0)/2,y:center.y-(Number(text.height)||0)/2};
  }
  return {x:Number(text.x)||0,y:Number(text.y)||0};
}
/** MathJax viewBox is in 1000 units per em. The scale matches SVG export. */
export function mathMetrics(box:number[],fontPx:number) {
  if(box.length!==4 || !box.every(Number.isFinite) || box[2]<=0 || box[3]<=0 || !(fontPx>0))return null;
  const factor=fontPx/1000;
  return {width:box[2]*factor,height:box[3]*factor,descent:Math.max(0,(box[1]+box[3])*factor)};
}
