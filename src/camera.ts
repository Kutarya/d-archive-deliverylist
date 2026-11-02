// Capacitor's legacy camera flow uses this exact rejection when the user exits.
export function isCameraCancellation(error:unknown):boolean{
  return typeof error==='object'&&error!==null&&'message' in error&&error.message==='User cancelled photos app';
}

export function cameraErrorMessage(error:unknown):string{
  if(typeof error==='string')return error;
  return typeof error==='object'&&error!==null&&'message' in error&&typeof error.message==='string'?error.message:'';
}
export function isPhotoPermissionError(error:unknown):boolean{
  if(typeof error==='object'&&error!==null){
    if('code' in error&&error.code==='PHOTO_PERMISSION_DENIED')return true;
    if('name' in error&&(error.name==='NotAllowedError'||error.name==='SecurityError'))return true;
  }
  return /permission.*(?:denied|not granted)|denied.*(?:access|permission)|access.*denied|SecurityException/i.test(cameraErrorMessage(error));
}
