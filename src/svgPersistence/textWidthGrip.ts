import { CaptureUpdateAction, sceneCoordsToViewportCoords, getFontString, measureText, wrapText } from '../constants/constants';
import type ExcalidrawView from '../view/ExcalidrawView';
import { eligibleText, layoutLiveText, resizeGeometry, snapshotText } from './liveResizeCore';

/** The only pointer target we own is this button, outside the canvas. */
export class TextWidthGrip {
  private button?: HTMLButtonElement;
  private cancel?: () => void;
  constructor(private view: ExcalidrawView) {}

  private selected() {
    const api=this.view.excalidrawAPI;
    if (!api || !this.view.file) return;
    const state=api.getAppState();
    if (state.viewModeEnabled || state.editingTextElement || state.isRotating || state.isResizing ||
        state.selectedElementsAreBeingDragged || state.activeTool?.type!=='selection') return;
    const ids=Object.keys(state.selectedElementIds).filter(id=>state.selectedElementIds[id]);
    if(ids.length!==1)return;
    const el=api.getSceneElements().find(e=>e.id===ids[0]);
    if(el?.type==='text' && !el.locked && eligibleText(el)) return el;
  }

  sync() {
    const el=this.selected(), root=this.view.contentEl;
    if(!el || !root.isConnected){this.cancel?.();if(this.button)this.button.hidden=true;return;}
    if(!this.button){
      const button=root.ownerDocument.createElement('button');
      button.type='button';button.className='excalidraw-text-width-grip';
      button.title='Click to fit text; drag to set width; Alt-drag to resize from center';
      button.setAttribute('aria-label',button.title);
      button.onpointerdown=this.down;
      button.onclick=e=>{if(e.detail===0)this.fit();}; // keyboard activation
      root.appendChild(button);this.button=button;
    }
    const state=this.view.excalidrawAPI.getAppState();
    const p=sceneCoordsToViewportCoords({sceneX:el.x+el.width,sceneY:el.y+el.height/2},state);
    this.button.hidden=false;
    const parent=this.button.offsetParent as HTMLElement|null;
    if(!parent)return;
    const rect=parent.getBoundingClientRect();
    this.button.style.left=`${p.x-rect.left-parent.clientLeft+parent.scrollLeft+12}px`;
    this.button.style.top=`${p.y-rect.top-parent.clientTop+parent.scrollTop}px`;
  }

  private fit(){
    const el=this.selected();if(!el)return;
    const text=el.originalText??el.text;
    const {width,height}=measureText(text,getFontString(el),el.lineHeight);
    this.apply(el.id,{text,width,height,autoResize:true},true);
  }

  private apply(id:string, changes: Record<string,unknown>, commit:boolean){
    const elements=this.view.excalidrawAPI.getSceneElements();
    this.view.updateScene({elements:elements.map(el=>el.id!==id?el:{...el,...changes,
      version:el.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()}),
      captureUpdate:commit?CaptureUpdateAction.IMMEDIATELY:CaptureUpdateAction.NEVER});
    this.view.setDirty();
  }

  private down=(e:PointerEvent)=>{
    const el=this.selected(), button=this.button;
    if(!el||!button||this.cancel||e.button!==0||!e.isPrimary)return;
    const start=snapshotText(el), x=e.clientX, id=e.pointerId, file=this.view.file;
    const zoom=this.view.excalidrawAPI.getAppState().zoom.value;
    let dragged=false;
    const move=(ev:PointerEvent,commit=false)=>{
      if(ev.pointerId!==id || this.view.file!==file)return;
      const dx=ev.clientX-x;
      if(!dragged && Math.abs(dx)<3)return;
      dragged=true;
      const box=resizeGeometry(start,'e',dx/zoom,0,ev.altKey);
      this.apply(el.id,layoutLiveText(el,start,box,{getFontString,wrapText,measureText}),commit);
    };
    const win=button.ownerDocument.defaultView;
    const clean=()=>{
      this.cancel=undefined;
      button.onpointermove=null;button.onpointerup=null;button.onpointercancel=null;button.onlostpointercapture=null;
      win?.removeEventListener('blur',cancel);
      if(button.hasPointerCapture(id))button.releasePointerCapture(id);
    };
    const cancel=()=>{clean();if(dragged&&this.view.file===file&&this.view.excalidrawAPI){
      const {x,y,width,height,text,autoResize}=el;
      this.apply(el.id,{x,y,width,height,text,autoResize},false);
    }};
    button.setPointerCapture(id);this.cancel=cancel;
    button.onpointermove=ev=>move(ev);
    button.onpointerup=ev=>{if(ev.pointerId!==id)return;clean();if(file!==this.view.file)return;
      move(ev,true);if(!dragged)this.fit();};
    button.onpointercancel=button.onlostpointercapture=ev=>{if(ev.pointerId===id)cancel();};
    win?.addEventListener('blur',cancel);
  };
  dispose(){this.cancel?.();this.button?.remove();this.button=undefined;}
}