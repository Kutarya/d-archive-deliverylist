export type ExportReturn = {groupId:string;view:'excel'|'pdf'|'image';docIndex:number};
const key='invoice-atelier-native-return-v1';
export function rememberNativeReturn(value:ExportReturn, storage:Pick<Storage,'setItem'>=localStorage) {
  try {storage.setItem(key,JSON.stringify({...value,time:Date.now()}));} catch {/* Archive data is saved separately. */}
}
export function clearNativeReturn(storage:Pick<Storage,'removeItem'>=localStorage) {try {storage.removeItem(key);} catch {}}
export function consumeNativeReturn(storage:Pick<Storage,'getItem'|'removeItem'>=localStorage):ExportReturn|null {
  try {
    const raw=storage.getItem(key);storage.removeItem(key);if(!raw)return null;
    const value=JSON.parse(raw),age=Date.now()-value.time;
    if(!value||typeof value.groupId!=='string'||!['excel','pdf','image'].includes(value.view)||!Number.isInteger(value.docIndex)||value.docIndex<0||!Number.isFinite(age)||age<0||age>15*60*1000)return null;
    return {groupId:value.groupId,view:value.view,docIndex:value.docIndex};
  } catch {return null;}
}
