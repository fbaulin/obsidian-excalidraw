// @ts-nocheck
import {CaptureUpdateAction,getFontString,measureText} from '../constants/constants';
import {eligibleText} from './liveResizeCore';
import {TextWidthGrip} from './textWidthGrip';
export class LiveTextResize {
  private fitTimer=null;
  private working=false;
  private grip:TextWidthGrip;
  constructor(private view){this.grip=new TextWidthGrip(view);}
  onChange(){
    this.grip.sync();
    if(this.working||this.fitTimer!==null)return;
    const file=this.view.file;
    this.fitTimer=setTimeout(()=>{
      this.fitTimer=null;
      const api=this.view.excalidrawAPI;
      if(!file||file!==this.view.file||!api||this.view.semaphores?.viewunload)return;
      const state=api.getAppState();
      if(state.selectedElementsAreBeingDragged||state.editingTextElement||state.isResizing||state.isRotating)return;
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
  dispose(){if(this.fitTimer!==null)clearTimeout(this.fitTimer);this.fitTimer=null;this.grip.dispose();}
}
