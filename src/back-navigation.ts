import {useEffect,useRef} from 'react';

type BackAction=()=>boolean;
export function createBackNavigation(){
  const actions=new Map<symbol,{priority:number;action:BackAction}>();
  return {
    register(priority:number,action:BackAction){const id=Symbol();actions.set(id,{priority,action});return()=>{actions.delete(id);};},
    dispatch(){for(const {action} of [...actions.values()].sort((a,b)=>b.priority-a.priority))if(action())return true;return false;}
  };
}
export const backNavigation=createBackNavigation();
export function useBackAction(priority:number,action:BackAction){
  const latest=useRef(action);latest.current=action;
  useEffect(()=>backNavigation.register(priority,()=>latest.current()),[priority]);
}
