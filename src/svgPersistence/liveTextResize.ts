// @ts-nocheck
import {CaptureUpdateAction,viewportCoordsToSceneCoords,sceneCoordsToViewportCoords,
  wrapText,getFontString,measureText} from '../constants/constants';
import {eligibleText,hitTextHandle,isHorizontalTextHandle,resizeGeometry,layoutLiveText,snapshotText}
  from './liveResizeCore';

/** Allows only left/right resizing of standalone unrotated text at fixed font size.
 * Consume the other six handles so they cannot fall through to native scaling.
 */
export class LiveTextResize {
  private root:HTMLElement|null=null;
  private listenDoc:Document|null=null;
  private doc:Document|null=null;
  private drag:any=null;
  private working=false;
  private cursorTarget:HTMLElement|null=null;
  private oldCursor='';
  private oldPriority='';
  private fitTimer:ReturnType<typeof setTimeout>|null=null;
  constructor(private view:any){}
  ensure(){
    const root=this.view.contentEl as HTMLElement;
    if(!root || (root===this.root && root.ownerDocument===this.listenDoc))return;
    this.dispose();this.root=root;
    // Document capture precedes React canvas handlers, avoiding aspect-locked native resize.
    this.listenDoc=root.ownerDocument;
    this.listenDoc.addEventListener('pointerdown',this.onDown,true);
    this.listenDoc.addEventListener('pointermove',this.onHover,true);
  }
  private clearCursor(){
    if(this.cursorTarget){
      this.cursorTarget.style.setProperty('cursor',this.oldCursor,this.oldPriority);
      this.cursorTarget=null;
    }
  }
  private onHover=(event:PointerEvent)=>{
    this.clearCursor();
    if(this.drag)return;
    const target=event.target as HTMLElement;
    const api=this.view.excalidrawAPI;
    if(!target?.style||!this.root?.contains(target)||!target.closest('.excalidraw')||!api)return;
    const state=api.getAppState();
    if(state.editingTextElement||state.activeTool?.type!=='selection')return;
    const selected=api.getSceneElements().filter(el=>!el.isDeleted&&state.selectedElementIds?.[el.id]);
    if(selected.length!==1||!eligibleText(selected[0]))return;
    const handle=hitTextHandle(selected[0],event.clientX,event.clientY,
      (x,y)=>sceneCoordsToViewportCoords({sceneX:x,sceneY:y},state),22);
    if(!handle)return;
    this.cursorTarget=target;
    this.oldCursor=target.style.getPropertyValue('cursor');
    this.oldPriority=target.style.getPropertyPriority('cursor');
    target.style.setProperty('cursor',isHorizontalTextHandle(handle)?'ew-resize':'default','important');
    event.stopImmediatePropagation();
  };
  onChange(){
    this.ensure();
    if(this.working||this.fitTimer!==null)return;
    const file=this.view.file;
    this.fitTimer=setTimeout(()=>{
      this.fitTimer=null;
      const api=this.view.excalidrawAPI;
      if(!file||file!==this.view.file||!api||this.drag||this.view.semaphores?.viewunload)return;
      const state=api.getAppState();
      if(state.editingTextElement||state.isResizing||state.isRotating)return;
      let changed=false;
      const elements=api.getSceneElements().map(el=>{
        if(!eligibleText(el))return el;
        const height=measureText(el.text,getFontString(el),el.lineHeight||1.25).height;
        if(!Number.isFinite(height)||height<=0||Math.abs(height-el.height)<0.01)return el;
        changed=true;
        return {...el,height,version:el.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
      });
      if(changed){
        this.working=true;
        try{this.view.updateScene({elements,captureUpdate:CaptureUpdateAction.NEVER});this.view.setDirty();}
        finally{this.working=false;}
      }
    },0);
  }
  private onDown=(event:PointerEvent)=>{
    const target=event.target as HTMLElement | null;
    if(this.drag || event.button!==0 || this.working || !this.view.file ||
      !event.isPrimary || !target || typeof target.closest!=='function' ||
      !this.root?.contains(target) || !target.closest('.excalidraw'))return;
    const api=this.view.excalidrawAPI;
    if(!api || api.isDestroyed)return;
    const state=api.getAppState();
    if(state.editingTextElement || state.isResizing || state.isRotating ||
       state.activeTool?.type!=='selection')return;
    const selected=api.getSceneElements().filter((el:any)=>!el.isDeleted &&
      state.selectedElementIds?.[el.id]);
    if(selected.length!==1 || !eligibleText(selected[0]))return;
    const element=selected[0];
    let handle=null,startingPoint=null;
    try {
      handle=hitTextHandle(element,event.clientX,event.clientY,(x:number,y:number)=>
        sceneCoordsToViewportCoords({sceneX:x,sceneY:y},state),22);
      startingPoint=viewportCoordsToSceneCoords({clientX:event.clientX,
        clientY:event.clientY},state);
    } catch(error){console.warn('SVG fork: resize coordinates unavailable',error);return;}
    if(!handle || !startingPoint)return;
    if(!isHorizontalTextHandle(handle)){
      this.consume(event);
      return;
    }
    const doc=this.view.contentEl.ownerDocument;
    this.doc=doc;
    this.drag={pointerId:event.pointerId,file:this.view.file,handle,
      start:snapshotText(element),startingPoint,last:null};
    doc.addEventListener('pointermove',this.onMove,true);
    doc.addEventListener('pointerup',this.onEnd,true);
    doc.addEventListener('pointercancel',this.onCancel,true);
    this.consume(event);
  };
  private onMove=(event:PointerEvent)=>{
    if(!this.drag || event.pointerId!==this.drag.pointerId)return;
    this.consume(event);
    const api=this.view.excalidrawAPI;
    if(!api || this.view.file!==this.drag.file){this.end(false);return;}
    const state=api.getAppState();
    let p;
    try{p=viewportCoordsToSceneCoords({clientX:event.clientX,clientY:event.clientY},state);}
    catch{this.end(false);return;}
    const {start,handle,startingPoint}=this.drag;
    const box=resizeGeometry(start,handle,p.x-startingPoint.x,p.y-startingPoint.y);
    if(this.drag.last && Object.keys(box).every(k=>Math.abs(box[k]-this.drag.last[k])<0.1))return;
    this.drag.last=box;
    const elements=api.getSceneElements();
    const target=elements.find((el:any)=>el.id===start.id);
    if(!target || target.isDeleted){this.end(false);return;}
    const changes=layoutLiveText(target,start,box,{getFontString,wrapText,measureText});
    const next={...target,...changes,version:target.version+1,
      versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
    try{
      this.working=true;
      this.view.updateScene({elements:elements.map((el:any)=>el.id===start.id?next:el),
        captureUpdate:CaptureUpdateAction.NEVER});
      this.view.setDirty();
    }catch(error){console.error('SVG fork: live text resize failed',error);this.end(false);}
    finally{this.working=false;}
  };
  private onEnd=(event:PointerEvent)=>{
    if(!this.drag || event.pointerId!==this.drag.pointerId)return;
    this.consume(event);this.end(true);
  };
  private onCancel=(event:PointerEvent)=>{
    if(!this.drag || event.pointerId!==this.drag.pointerId)return;
    this.consume(event);this.end(false);
  };
  private end(commit:boolean){
    if(!this.drag)return;
    const changed=!!this.drag.last;
    this.drag=null;
    this.doc?.removeEventListener('pointermove',this.onMove,true);
    this.doc?.removeEventListener('pointerup',this.onEnd,true);
    this.doc?.removeEventListener('pointercancel',this.onCancel,true);
    this.doc=null;
    if(changed && commit){
      const api=this.view.excalidrawAPI;
      if(api && this.view.file){
        // Emit the final state as a history checkpoint without rescaling its font.
        this.view.updateScene({elements:api.getSceneElements(),
          captureUpdate:CaptureUpdateAction.IMMEDIATELY});
        this.view.setDirty();
      }
    }
  }
  private consume(event:PointerEvent){event.preventDefault();event.stopPropagation();
    event.stopImmediatePropagation();}
  dispose(){
    if(this.fitTimer!==null){clearTimeout(this.fitTimer);this.fitTimer=null;}
    this.clearCursor();
    this.end(false);
    this.listenDoc?.removeEventListener('pointerdown',this.onDown,true);
    this.listenDoc?.removeEventListener('pointermove',this.onHover,true);
    this.listenDoc=null;
    this.root=null;
  }
}
