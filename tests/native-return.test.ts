import test from 'node:test';
import assert from 'node:assert/strict';
import {rememberNativeReturn,consumeNativeReturn,clearNativeReturn} from '../src/native-return';

function memory(){const data=new Map<string,string>();return {setItem:(key:string,value:string)=>data.set(key,value),getItem:(key:string)=>data.get(key)??null,removeItem:(key:string)=>data.delete(key)};}
test('Native export returns to the same document view once after renderer recreation',()=>{
  const storage=memory(),view={groupId:'existing-archive',view:'excel' as const,docIndex:2};rememberNativeReturn(view,storage);assert.deepEqual(consumeNativeReturn(storage),view);assert.equal(consumeNativeReturn(storage),null);
  rememberNativeReturn(view,storage);clearNativeReturn(storage);assert.equal(consumeNativeReturn(storage),null);
});
test('Stale, malformed and unavailable return storage never blocks opening an archive',()=>{
  for(const value of [null,{time:Date.now(),groupId:'id',view:'unknown',docIndex:0},{time:Date.now()-3600000,groupId:'id',view:'pdf',docIndex:0},{time:Date.now(),groupId:'id',view:'pdf',docIndex:-1}])assert.equal(consumeNativeReturn({getItem:()=>JSON.stringify(value),removeItem:()=>{}}),null);
  const storage={setItem:()=>{throw Error('storage unavailable');},removeItem:()=>{throw Error('storage unavailable');},getItem:()=>{throw Error('storage unavailable');}};
  assert.doesNotThrow(()=>rememberNativeReturn({groupId:'id',view:'pdf',docIndex:0},storage));assert.equal(consumeNativeReturn(storage),null);assert.doesNotThrow(()=>clearNativeReturn(storage));
});
