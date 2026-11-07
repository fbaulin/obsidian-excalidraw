/** Embed a vault PNG/SVG directly as a data URL; no image attachment or link. */
import {TFile} from 'obsidian';
import type {App} from 'obsidian';
export async function inlineVaultImage(app:App, candidate:TFile|string):Promise<string|null>{
  if(typeof candidate === 'string' && /^(?:data:|[a-z]+:\/\/)/i.test(candidate)) return null;
  const file = candidate instanceof TFile ? candidate : app.vault.getAbstractFileByPath(candidate);
  if(!(file instanceof TFile))return null;
  const ext=file.extension.toLowerCase();
  if(ext!=='png'&&ext!=='svg')return null;
  const buf=await app.vault.readBinary(file);
  const b=new Uint8Array(buf);let binary='';
  for(let i=0;i<b.length;i+=16384)binary+=String.fromCharCode(...b.subarray(i,i+16384));
  return `data:${ext==='png'?'image/png':'image/svg+xml'};base64,${btoa(binary)}`;
}
