import type {Store} from './model';

function restoreEntries<T extends {id:string}>(current:T[],before:T[],after:T[]):T[] {
  const previous=new Map(before.map(entry=>[entry.id,entry]));
  const proposed=new Map(after.map(entry=>[entry.id,entry]));
  const touched=new Set([...previous.keys(),...proposed.keys()].filter(id=>previous.get(id)!==proposed.get(id)));
  if(!touched.size)return current;
  let changed=false;
  const restored=current.flatMap(entry=>{
    if(!touched.has(entry.id)||entry!==proposed.get(entry.id))return [entry];
    changed=true;
    const original=previous.get(entry.id);return original?[original]:[];
  });
  const present=new Set(current.map(entry=>entry.id)),order=new Map(before.map((entry,index)=>[entry.id,index]));
  for(const [index,entry] of before.entries()){
    if(!touched.has(entry.id)||proposed.has(entry.id)||present.has(entry.id))continue;
    const position=restored.findIndex(candidate=>(order.get(candidate.id)??Infinity)>index);
    restored.splice(position<0?restored.length:position,0,entry);changed=true;
  }
  return changed?restored:current;
}

/** Undo only this rejected change. Later edits to a record take precedence. */
export function rollbackStoreChange(current:Store,before:Store,after:Store):Store {
  const collections=restoreEntries(current.collections,before.collections,after.collections);
  const draft=restoreEntries(current.draft,before.draft,after.draft);
  const settingsChanged=before.settings!==after.settings&&current.settings===after.settings;
  const defaultsChanged=before.businessDefaults!==after.businessDefaults&&current.businessDefaults===after.businessDefaults;
  if(collections===current.collections&&draft===current.draft&&!settingsChanged&&!defaultsChanged)return current;
  const result={...current,collections,draft};
  if(settingsChanged){if(before.settings)result.settings=before.settings;else delete result.settings;}
  if(defaultsChanged){if(before.businessDefaults)result.businessDefaults=before.businessDefaults;else delete result.businessDefaults;}
  return result;
}

/** Keep a failed explicit action retryable while retaining unrelated work. */
export async function commitStoreMutation(read:()=>Store,publish:(store:Store)=>void,save:(store:Store)=>Promise<void>,change:(store:Store)=>Store):Promise<Store> {
  const before=read(),after=change(before);
  if(before===after)return before;
  publish(after);
  try {await save(after);}
  catch(error){
    const restored=rollbackStoreChange(read(),before,after);publish(restored);
    // This write follows already queued snapshots, so an autosave captured
    // before the rejection cannot later resurrect the rejected action.
    try {await save(restored);} catch {/* Keep the original error and form. */}
    throw error;
  }
  return read();
}
