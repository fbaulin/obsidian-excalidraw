// @ts-nocheck
/** SVG fork: convert a plain SVG into an Excalidraw scene containing one embedded SVG image.
 * Keep the original SVG artwork visible until the first edit/save. No file links.
 * The result is passed through the existing editableSvgCodec.ts serializer.
 */
const utf8b64 = s => {
  const b=new TextEncoder().encode(s);let binary='';
  for(let i=0;i<b.length;i+=16384)binary+=String.fromCharCode(...b.subarray(i,i+16384));
  return btoa(binary);
};
const svgTag = svg => {
  if(typeof svg!=='string'||!/<svg\b/i.test(svg))throw Error('Not an SVG document');
  const m=/<svg\b[^>]*>/i.exec(svg);
  if(!m)throw Error('Invalid SVG root');
  return m;
};
const numeric = (s) => {
  const m=String(s||'').trim().match(/^([\d.]+)(px|pt|pc|in|cm|mm)?$/i);
  if(!m)return null;
  const factor={px:1,pt:96/72,pc:16,in:96,cm:96/2.54,mm:96/25.4};
  const value=Number(m[1])*(factor[(m[2]||'px').toLowerCase()]||1);
  return Number.isFinite(value)&&value>0?value:null;
};
export function svgDimensions(markup){
  const m=svgTag(markup);const opening=m[0];
  const get = n => opening.match(new RegExp('\\b'+n+'\\s*=\\s*["\']([^"\']+)["\']','i'))?.[1];
  const view=(get('viewBox')||'').trim().split(/[\s,]+/).map(Number);
  const vw=view.length===4&&Number.isFinite(view[2])&&view[2]>0?view[2]:null;
  const vh=view.length===4&&Number.isFinite(view[3])&&view[3]>0?view[3]:null;
  let width=numeric(get('width')),height=numeric(get('height'));
  if(!width&&vw)width=height&&vh?height*vw/vh:vw;
  if(!height&&vh)height=width&&vw?width*vh/vw:vh;
  width=width||800;height=height||600;
  // Fit the image within a practical initial drawing size without changing its ratio.
  const scale=Math.min(1,2400/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function newId(){return 'svg'+Math.random().toString(36).slice(2,12);}
export function asEditableScene(markup){
  const {width,height}=svgDimensions(markup);
  const id=newId(),fileId=newId(),now=Date.now();
  const file={id:fileId,mimeType:'image/svg+xml',dataURL:`data:image/svg+xml;base64,${utf8b64(markup)}`,created:now};
  const element={id,type:'image',x:0,y:0,width,height,angle:0,strokeColor:'#1e1e1e',backgroundColor:'transparent',fillStyle:'solid',strokeWidth:1,strokeStyle:'solid',roughness:0,opacity:100,roundness:null,seed:12345,version:1,versionNonce:now%2147483647,updated:now,isDeleted:false,groupIds:[],boundElements:null,link:null,locked:false,frameId:null,fileId,scale:[1,1],crop:null,status:'saved'};
  const scene={type:'excalidraw',version:2,source:'obsidian-excalidraw-svg-fork',elements:[element],appState:{viewBackgroundColor:'#ffffff',theme:'light'},files:{[fileId]:file}};
  const markdown=`---\nexcalidraw-plugin: parsed\n---\n# Excalidraw Data\n\n## Drawing\n\`\`\`json\n${JSON.stringify(scene,null,2)}\n\`\`\`\n%%\n`;
  return {scene,markdown,element,file};
}
export function cleanSvgPreview(markup){
  const root=svgTag(markup);
  // Legacy draw.io content is not our scene: remove only that root attribute to avoid a
  // conflicting diagram in draw.io. The complete original markup is kept in the image data.
  const opening=root[0].replace(/\s+content\s*=\s*(?:"[^"]*"|'[^']*')/i,'');
  return markup.slice(0,root.index)+opening+markup.slice(root.index+root[0].length);
}
