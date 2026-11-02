import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyInvoice,emptyStore,type Collection,type Store} from '../src/model';
import {emptyBusinessDefaults} from '../src/business-defaults';
import {commitStoreMutation,rollbackStoreChange} from '../src/store-transaction';

const photo=(number:string)=>({...emptyInvoice(),number,image:'data:image/jpeg;base64,'+number,sourceName:number+'.jpg',sourceHash:number});
const group=(id:string):Collection=>({id,name:id,createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z',invoices:[photo(id)]});

test('A rejected approval restores the pending order and keeps later unrelated photos and archive edits',()=>{
  const a=photo('A'),b=photo('B'),c=photo('C'),later=photo('NEW'),existing=group('existing');
  const before={...emptyStore(),draft:[a,b,c],collections:[existing]},original=structuredClone(before);
  const added={...group('new-archive'),invoices:[a,c]},after={...before,draft:[b],collections:[existing,added]};
  const revised={...existing,name:'Renamed while saving'},current={...after,draft:[b,later],collections:[revised,added]};
  const restored=rollbackStoreChange(current,before,after);
  assert.deepEqual(restored.draft,[a,b,c,later]);assert.deepEqual(restored.collections,[revised]);assert.deepEqual(before,original);
});
test('A failed archive append restores only its archive and keeps newer draft data',()=>{
  const document=photo('PENDING'),before={...emptyStore(),collections:[group('one')],draft:[document]};
  const edited={...before.collections[0],updatedAt:'2026-10-21T01:00:00Z',invoices:[...before.collections[0].invoices,document]};
  const after={...before,collections:[edited],draft:[]},later=photo('LATER');
  const restored=rollbackStoreChange({...after,draft:[later]},before,after);
  assert.equal(restored.collections[0],before.collections[0]);assert.deepEqual(restored.draft,[document,later]);
});
test('Rollback does not overwrite a newer version of the same record or language preferences',()=>{
  const before={...emptyStore(),collections:[group('one')],businessDefaults:emptyBusinessDefaults()};
  const after={...before,collections:[{...before.collections[0],name:'Proposed'}],businessDefaults:{...before.businessDefaults,supplier:'Proposed'}};
  const newer={...after,collections:[{...after.collections[0],name:'Newer change'}],businessDefaults:{...after.businessDefaults,supplier:'Newer company'},settings:{interfaceLanguage:'cs',outputLanguage:'tr'} as const};
  assert.equal(rollbackStoreChange(newer,before,after),newer);
});
test('Failed deletion restores original positions and rolls back optional settings without mutating snapshots',()=>{
  const before={...emptyStore(),collections:[group('one'),group('two'),group('three')]},original=structuredClone(before);
  const after={...before,collections:[before.collections[1]],businessDefaults:{...emptyBusinessDefaults(),supplier:'Temporary'}};
  const result=rollbackStoreChange({...after,collections:[...after.collections,group('new')]},before,after);
  assert.deepEqual(result.collections.map(entry=>entry.id),['one','two','three','new']);assert.ok(!('businessDefaults' in result));assert.deepEqual(before,original);
});
test('A failed save writes a rollback after queued snapshots and keeps work added while awaiting storage',async()=>{
  const before={...emptyStore(),draft:[photo('ORIGINAL')]};let current:Store=before,release!:(reason:Error)=>void;
  const writes:Store[]=[],failure=new Error('Disk write rejected');
  const action=commitStoreMutation(()=>current,value=>{current=value;},async value=>{writes.push(value);if(writes.length===1)await new Promise<never>((_,reject)=>{release=reject;});},value=>({...value,businessDefaults:{...emptyBusinessDefaults(),supplier:'Pending settings'}}));
  const later=photo('BACKGROUND');current={...current,draft:[...current.draft,later]};release(failure);
  await assert.rejects(action,error=>error===failure);assert.equal(writes.length,2);assert.deepEqual(current.draft,[...before.draft,later]);assert.ok(!current.businessDefaults);assert.equal(writes[1],current);
});
test('An unavailable rollback write preserves the original failure and the retryable in-memory state',async()=>{
  const before={...emptyStore(),draft:[photo('SOURCE')]};let current:Store=before,calls=0;const failure=new Error('First failure');
  await assert.rejects(commitStoreMutation(()=>current,value=>{current=value;},async()=>{calls++;throw calls===1?failure:new Error('Still unavailable');},value=>({...value,draft:[]})),error=>error===failure);
  assert.equal(calls,2);assert.deepEqual(current,before);
});
test('Successful commits preserve concurrent state and invalid mutations never publish or save',async()=>{
  let current:Store=emptyStore(),writes=0,published=0;
  const result=await commitStoreMutation(()=>current,value=>{current=value;published++;},async()=>{writes++;current={...current,draft:[photo('CONCURRENT')]};},value=>({...value,businessDefaults:emptyBusinessDefaults()}));
  assert.equal(result,current);assert.equal(current.draft.length,1);assert.equal(writes,1);
  await assert.rejects(commitStoreMutation(()=>current,()=>{published++;},async()=>{writes++;},()=>{throw new Error('Invalid archive');}),/Invalid archive/);
  assert.equal(published,1);assert.equal(writes,1);
});
