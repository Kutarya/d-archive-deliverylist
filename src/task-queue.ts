export function createTaskQueue(){
  let tail:Promise<unknown>=Promise.resolve();
  return {run<T>(action:()=>Promise<T>|T):Promise<T>{
    const task=tail.catch(()=>{}).then(action);tail=task;return task;
  }};
}

// Keep Android activities and heavy processing in separate FIFO queues. A processing
// job releases its slot before it asks for a system dialog, avoiding nested waits.
export const mobileActivities=createTaskQueue();
export const mobileProcessing=createTaskQueue();
// A selected batch keeps its order without holding Android's activity slot
// while its photos are decoded, recognized and saved.
export const mobileImports=createTaskQueue();
