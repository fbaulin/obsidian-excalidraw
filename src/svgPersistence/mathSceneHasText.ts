// @ts-nocheck
import {splitMath} from './mathSyntax';
export function hasMathText(scene:any):boolean {
  return Boolean(scene?.elements?.some((el:any)=>!el.isDeleted&&el.type==='text'&&
    [el.originalText,el.text].some(value=>splitMath(String(value??'')).some((part:any)=>part.type==='math'))));
}
