// @ts-nocheck
import {wrapText,measureText,getFontString,CaptureUpdateAction} from '../constants/constants';
import {ResizeLayoutSession,reflowText,keepMathScale} from './fixedTextLayoutCore';
/** Keeps font size independent of text-box geometry; intercepts *completed* resizes.
 * Does not touch font-size commands, text editing, moving or scene loading. */
export class FixedTextLayout {
  private session=new ResizeLayoutSession();
  private updating=false;
  constructor(private view:any){}
  onChange(elements:any[],state:any){
    if(this.updating)return;
    // Reset baseline when switching files/views; a different scene must not inherit geometry.
    if(!this.view.file||this.view.semaphores?.justLoaded){this.session.reset();return;}
    const tasks=this.session.observe(elements,state);
    if(tasks.length)window.setTimeout(()=>this.commit(tasks),0);
  }
  private commit(tasks:any[]){
    const view=this.view,api=view.excalidrawAPI;
    if(this.updating||!view.file||!api||view.semaphores?.viewunload)return;
    const state=api.getAppState();
    if(state.isResizing||state.editingTextElement||state.isRotating||state.isLoading)return;
    const ops=new Map(tasks.map(t=>[t.id,t]));
    let corrected=false;
    const elements=api.getSceneElements().map((el:any)=>{
      const op=ops.get(el.id);
      if(!op||el.isDeleted||el.version!==op.version)return el; // stale asynchronous edit
      let update=null;
      try {
        update=op.kind==='text'?reflowText(el,op,{getFontString,wrapText,measureText}):
          op.kind==='math'?keepMathScale(el,op):null;
      }catch(error){console.warn('SVG fork fixed-text reflow skipped',error);return el;}
      if(!update)return el;
      corrected=true;
      return {...el,...update,version:el.version+1,
        versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
    });
    if(!corrected)return;
    try{
      this.updating=true;
      view.updateScene({elements,captureUpdate:CaptureUpdateAction.NEVER});
      view.setDirty();
      // Synchronize snapshots to corrected geometry; do not let the next drag start from stale size.
      this.session.observe(elements,{isResizing:false});
    }finally{this.updating=false;}
  }
}
