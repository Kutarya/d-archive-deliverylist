import { Capacitor, registerPlugin } from '@capacitor/core';
import { openDB } from 'idb';
import { emptyStore, settingsFor, validateStore, type Store } from './model';
import type { Language } from './i18n';
import {mobileActivities,mobileProcessing} from './task-queue';
export type OcrLine = { text: string; x: number; y: number; width: number; height: number; confidence?: number };
type NativeApi = { recognize(o: {image: string;rotation?:number;enhance?:boolean}): Promise<{text: string; lines: OcrLine[];confidence?:number;suggestedRotation?:number}>; loadStore(): Promise<{data: string}>; saveStore(o: {data: string}): Promise<void>; saveFile(o: {name: string; mime: string; base64: string; language?: Language}): Promise<{cancelled?: boolean; path?: string}> };
export const NativeDocuments = registerPlugin<NativeApi>('NativeDocuments');
export const isAndroid = Capacitor.getPlatform() === 'android';
export async function processPhoto<T>(action:()=>Promise<T>|T):Promise<T>{return isAndroid?mobileProcessing.run(action):action();}
declare global { interface Window { desktop?: { loadStore(): Promise<string>; saveStore(data: string): Promise<void>; onBeforeClose(callback:()=>Promise<void>):()=>void; saveFile(o: {name: string; mime: string; base64: string; language?: Language}): Promise<{cancelled?: boolean; path?: string}> }; } }
const db = () => openDB('fatura-atolyesi', 1, { upgrade(db) { db.createObjectStore('data'); } });
export async function loadStore(): Promise<Store> {
  let raw: string | undefined;
  if (window.desktop) raw = await window.desktop.loadStore();
  else if (isAndroid) raw = (await NativeDocuments.loadStore()).data;
  else raw = await (await db()).get('data', 'store');
  if (!raw) return emptyStore();
  const store = JSON.parse(raw); validateStore(store); return {...store,settings:settingsFor(store)};
}
let tail: Promise<unknown> = Promise.resolve();
export function persist(store: Store): Promise<void> {
  const data = JSON.stringify(store);
  const save = tail.catch(() => {}).then(async () => {
    if (window.desktop) await window.desktop.saveStore(data);
    else if (isAndroid) await NativeDocuments.saveStore({data});
    else await (await db()).put('data', data, 'store');
  });
  tail = save; return save;
}
export async function dataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve,reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('Could not read the file.')); r.readAsDataURL(blob); });
}
export function safeFileName(name:string):string {
  const clean=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().replace(/[. ]+$/g,'');
  const extension=clean.match(/\.[a-z0-9]{1,10}$/i)?.[0]??'';
  let base=clean.slice(0,clean.length-extension.length)||'_';
  if(/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base))base='_'+base;
  return base.slice(0,160-extension.length).replace(/[. ]+$/g,'')+extension;
}
export async function saveBlob(blob: Blob, name: string, language: Language = 'en'): Promise<boolean> {
  const cleanName = safeFileName(name);
  if (window.desktop || isAndroid) {
    const base64 = (await dataUrl(blob)).split(',')[1];
    const result = await (window.desktop ? window.desktop.saveFile({name: cleanName, mime: blob.type, base64, language}) : mobileActivities.run(()=>NativeDocuments.saveFile({name: cleanName, mime: blob.type, base64, language})));
    return !result.cancelled;
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = cleanName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500); return true;
}
export async function prepareImage(file: File | Blob): Promise<string> {
  return processPhoto(async()=>{
  if (file.size > 35*1024*1024) throw new Error('The photo exceeds the 35 MB limit.');
  const url = await dataUrl(file);
  const img = new Image(); img.src = url;
  await img.decode().catch(() => { throw new Error('Could not open this image. Use JPG, PNG or WebP.'); });
  const ratio = Math.min(1, 2600/Math.max(img.width,img.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(img.width*ratio); canvas.height = Math.round(img.height*ratio);
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.93);
  });
}
export async function rotateImage(image: string): Promise<string> {
  return processPhoto(async()=>{
  const img = new Image(); img.src = image; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.height; canvas.height = img.width;
  const ctx = canvas.getContext('2d')!; ctx.translate(canvas.width,0); ctx.rotate(Math.PI/2); ctx.drawImage(img,0,0);
  return canvas.toDataURL('image/jpeg',0.95);
  });
}
