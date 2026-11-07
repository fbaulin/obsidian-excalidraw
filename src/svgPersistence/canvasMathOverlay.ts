// @ts-nocheck
// SVG_MATH_OVERLAY_V10: transparent MathJax overlay with native raw-text suppression.
import {splitMath} from './mathSyntax';
import {texToSvg} from './mathjaxRenderer';
import {sceneCoordsToViewportCoords} from '../constants/constants';
import {labelTopLeft,mathMetrics} from './mathOverlayGeometry';

/** Display-only formulas: no scene mutations, no changes to SVG export or undo history.
 * Native raw text is hidden via Excalidraw's ephemeral rendering API, when available.
 */
export class CanvasMathOverlay {
  private view:any;
  private host:HTMLDivElement|null=null;
  private root:HTMLElement|null=null;
  private doc:Document|null=null;
  private nodes=new Map<string,HTMLElement>();
  private mathCache=new Map<string,SVGSVGElement>();
  private pending=false;
  private hiddenKey='';
  private overlayApi:any=null;
  private warned=false;
  constructor(view:any){this.view=view;}
  onChange(_elements:any[],_state:any){
    if(!this.view.file||this.view.semaphores?.viewunload){this.clear();return;}
    this.ensure();this.schedule();
  }
  private ensure(){
    const root=this.view.contentEl as HTMLElement;
    if(!root)return;
    if(this.root===root&&this.host)return;
    this.clear();this.root=root;this.doc=root.ownerDocument;
    const host=this.doc.createElement('div');host.className='svg-fork-math-overlay';
    Object.assign(host.style,{position:'absolute',inset:'0',pointerEvents:'none',
      overflow:'hidden',zIndex:'4',userSelect:'none',background:'transparent'});
    if(this.doc.defaultView?.getComputedStyle(root).position==='static')root.style.position='relative';
    root.appendChild(host);this.host=host;
    for(const event of ['wheel','pointermove','pointerup','dblclick','scroll','keyup','focusin'])
      root.addEventListener(event,this.onInteraction,true);
    this.doc.defaultView?.addEventListener('resize',this.onInteraction);
  }
  private onInteraction=()=>this.schedule();
  private schedule(){
    if(this.pending||!this.root||!this.host)return;
    this.pending=true;
    const w=this.doc?.defaultView;
    if(w?.requestAnimationFrame)w.requestAnimationFrame(()=>{this.pending=false;this.render();});
    else {this.pending=false;this.render();}
  }
  private formula(latex:string,display:boolean){
    const key=(display?'D:':'I:')+latex;
    const cached=this.mathCache.get(key);
    if(cached)return cached.cloneNode(true) as SVGSVGElement;
    const markup=texToSvg(latex,display);
    const Parser=this.doc.defaultView?.DOMParser||DOMParser;
    const parsed=new Parser().parseFromString(markup,'text/html');
    const svg=parsed.querySelector('svg');
    if(!svg)throw new Error('MathJax SVG missing');
    this.mathCache.set(key,svg.cloneNode(true) as SVGSVGElement);
    if(this.mathCache.size>300)this.mathCache.delete(this.mathCache.keys().next().value);
    return this.doc.importNode(svg,true) as SVGSVGElement;
  }
  private font(id:number){
    return ({1:'Virgil, cursive',2:'Helvetica, Arial, sans-serif',
      3:'Cascadia, monospace',5:'Excalifont, cursive',6:'Nunito, sans-serif',
      7:'Arial, sans-serif'} as any)[id]||'Arial, sans-serif';
  }
  private setHidden(ids:Set<string>,api:any){
    // Do not modify the scene to hide text. Excalidraw's transient override is
    // specifically designed for visual-only changes without history/export impact.
    if(typeof api?.setElementRenderOverrides!=='function'){
      if(!this.warned){console.warn('SVG fork: rendering overrides unavailable; using legacy opaque overlay');this.warned=true;}
      if(this.overlayApi && this.hiddenKey){this.overlayApi?.setElementRenderOverrides?.(null);}
      this.hiddenKey='';this.overlayApi=null;
      return false;
    }
    if(this.overlayApi && this.overlayApi!==api && this.hiddenKey){
      this.overlayApi?.setElementRenderOverrides?.(null);this.hiddenKey='';
    }
    this.overlayApi=api;
    const key=[...ids].sort().join('\u0000');
    if(key===this.hiddenKey)return true;
    this.hiddenKey=key;
    api.setElementRenderOverrides(ids.size?new Map([...ids].map(id=>[id,{opacity:0}])):null);
    return true;
  }
  private render(){
    const root=this.root,host=this.host,api=this.view.excalidrawAPI;
    if(!root||!host||!api||api.isDestroyed||!root.isConnected||!this.view.file){this.setHidden(new Set(),api);return;}
    const state=api.getAppState(),zoom=typeof state.zoom==='number'?state.zoom:Number(state.zoom?.value)||1;
    const rect=root.getBoundingClientRect(),elements=api.getSceneElements(),lookup=new Map(elements.map(el=>[el.id,el]));
    const editingId=state.editingTextElement?.id, active=new Set<string>(),ready=new Set<string>();
    for(const el of elements){
      if(el.isDeleted||el.type!=='text'||el.id===editingId)continue;
      const source=String(el.originalText??el.text??'');
      const parts=splitMath(source);
      if(!parts.some(p=>p.type==='math'))continue;
      let node=this.nodes.get(el.id);
      if(!node){node=this.doc.createElement('div');node.className='svg-fork-math-text';
        Object.assign(node.style,{position:'absolute',pointerEvents:'none',boxSizing:'border-box',
          background:'transparent',margin:'0',padding:'0',whiteSpace:'pre-wrap',overflowWrap:'anywhere',
          left:'0',top:'0'});
        host.appendChild(node);this.nodes.set(el.id,node);}
      const font=Math.max(1,(Number(el.fontSize)||20)*zoom);
      const width=Math.max(2,(Number(el.width)||2)*zoom),height=Math.max(1,(Number(el.height)||1)*zoom);
      const color=el.strokeColor||'#1e1e1e';
      const signature=[source,font,width,height,color,el.textAlign,el.fontFamily,el.lineHeight].join('|');
      if(node.dataset.sig!==signature){
        // Build before replacing existing DOM; failure must leave raw text visible.
        const frag=this.doc.createDocumentFragment();let valid=true;
        for(const part of parts){
          if(part.type==='text'){frag.appendChild(this.doc.createTextNode(part.value));continue;}
          try{
            const svg=this.formula(part.value,part.display);
            const vb=(svg.getAttribute('viewBox')||'').trim().split(/[ ,]+/).map(Number);
            const metrics=mathMetrics(vb,font);
            if(!metrics)throw new Error('Invalid MathJax viewBox');
            svg.setAttribute('width',String(metrics.width));svg.setAttribute('height',String(metrics.height));
            Object.assign(svg.style,{width:metrics.width+'px',height:metrics.height+'px',
              verticalAlign:-metrics.descent+'px',color,overflow:'visible'});
            if(part.display){const line=this.doc.createElement('div');line.style.display='block';line.appendChild(svg);frag.appendChild(line);}
            else frag.appendChild(svg);
          }catch(error){console.warn('SVG fork MathJax:',error);valid=false;break;}
        }
        if(!valid){node.remove();this.nodes.delete(el.id);continue;}
        node.replaceChildren(frag);
        node.dataset.sig=signature;
        Object.assign(node.style,{fontSize:font+'px',fontFamily:this.font(el.fontFamily),
          lineHeight:String(el.lineHeight||1.25),textAlign:el.textAlign||'left',
          color,width:width+'px',minHeight:height+'px'});
      }
      const parent=el.containerId?lookup.get(el.containerId):null;
      const position=labelTopLeft(el,parent);
      let coords;
      try{coords=sceneCoordsToViewportCoords({sceneX:position.x,sceneY:position.y},state);}
      catch{continue;}
      const x=coords.x-rect.left,y=coords.y-rect.top;
      const transform=`translate(${x}px,${y}px) rotate(${el.angle||0}rad)`;
      if(node.style.transform!==transform)node.style.transform=transform;
      node.style.transformOrigin='center center';
      active.add(el.id);ready.add(el.id);
    }
    for(const [id,node] of this.nodes)if(!active.has(id)){node.remove();this.nodes.delete(id);}
    const overridden=this.setHidden(ready,api);
    if(!overridden){
      // Fallback for older Excalidraw: preserve previous masked behavior so
      // equations do not overlap raw text, but warn that translucency is unavailable.
      for(const [id,node] of this.nodes){const el=lookup.get(id),container=el?.containerId?lookup.get(el.containerId):null;
        const fill=container?.fillStyle==='solid'&&container.backgroundColor!=='transparent'
          ?container.backgroundColor:(state.viewBackgroundColor||'#fff');
        node.style.background=fill;
      }
    }else for(const node of this.nodes.values())node.style.background='transparent';
  }
  clear(){
    if(this.overlayApi&&this.hiddenKey){try{this.overlayApi.setElementRenderOverrides?.(null);}catch{}}
    this.overlayApi=null;this.hiddenKey='';
    if(this.root)for(const event of ['wheel','pointermove','pointerup','dblclick','scroll','keyup','focusin'])
      this.root.removeEventListener(event,this.onInteraction,true);
    this.doc?.defaultView?.removeEventListener('resize',this.onInteraction);
    this.host?.remove();this.root=null;this.doc=null;this.host=null;this.nodes.clear();
  }
}
