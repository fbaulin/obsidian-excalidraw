// @ts-nocheck
import {splitMath} from './mathSyntax';
export function hasMathText(scene:any):boolean {
  return Boolean(scene?.elements?.some((el:any)=>!el.isDeleted&&el.type==='text'&&
    splitMath(String(el.originalText??el.text??'')).some((part:any)=>part.type==='math')));
}
