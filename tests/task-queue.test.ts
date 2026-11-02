import test from 'node:test';
import assert from 'node:assert/strict';
import {createTaskQueue} from '../src/task-queue';
import {abortable} from '../src/async-task';

test('Mobile jobs execute in request order with no overlap',async()=>{
  const queue=createTaskQueue(),events:string[]=[];let finish!:()=>void;
  const first=queue.run(async()=>{events.push('first:start');await new Promise<void>(resolve=>{finish=resolve;});events.push('first:end');});
  const second=queue.run(()=>{events.push('second');return 2;});const third=queue.run(()=>events.push('third'));
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['first:start']);finish();await first;assert.equal(await second,2);await third;assert.deepEqual(events,['first:start','first:end','second','third']);
});
test('A denied or failed mobile job releases the queue for the next operation',async()=>{
  const queue=createTaskQueue(),events:string[]=[];
  const failed=queue.run(()=>{throw new Error('Permission denied');});
  const next=queue.run(()=>events.push('next'));await assert.rejects(failed,/Permission denied/);await next;assert.deepEqual(events,['next']);
});
test('Cancelling the wait does not start another native operation before the original operation finishes',async()=>{
  const queue=createTaskQueue(),controller=new AbortController(),events:string[]=[];let finish!:()=>void;
  const native=queue.run(async()=>{events.push('native:start');await new Promise<void>(resolve=>{finish=resolve;});events.push('native:end');});
  const wait=abortable(native,controller.signal);await new Promise(resolve=>setImmediate(resolve));controller.abort();await assert.rejects(wait,{name:'AbortError'});
  const next=queue.run(()=>events.push('next'));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['native:start']);finish();await next;assert.deepEqual(events,['native:start','native:end','next']);
});
