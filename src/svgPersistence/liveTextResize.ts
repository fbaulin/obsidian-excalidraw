// @ts-nocheck
import {CaptureUpdateAction,viewportCoordsToSceneCoords,sceneCoordsToViewportCoords,
  wrapText,getFontString} from '../constants/constants';
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
  constructor(private view:any){}
  ensure(){
    const root=this.view.contentEl as HTMLElement;
    if(!root || (root===this.root && root.ownerDocument===this.listenDoc))return;
    this.dispose();this.root=root;
    // Document capture precedes React canvas handlers, avoiding aspect-locked native resize.
    this.listenDoc=root.ownerDocument;
    this.listenDoc.addEventListener('pointerdown',this.onDown,true);
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
        sceneCoordsToViewportCoords({sceneX:x,sceneY:y},state),14);
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
    const changes=layoutLiveText(target,start,box,{getFontString,wrapText});
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
    this.end(false);
    this.listenDoc?.removeEventListener('pointerdown',this.onDown,true);
    this.listenDoc=null;
    this.root=null;
  }
}
