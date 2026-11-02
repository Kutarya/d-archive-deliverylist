import test from 'node:test';
import assert from 'node:assert/strict';
import {createBackNavigation} from '../src/back-navigation';
import {cameraErrorMessage,isCameraCancellation,isPhotoPermissionError} from '../src/camera';

test('Back closes the photo before its editor and leaves page navigation for the next press',()=>{
  const back=createBackNavigation(),closed:string[]=[];let photo=true,editor=true;
  back.register(0,()=>{closed.push('page');return true;});
  back.register(20,()=>{if(!editor)return false;editor=false;closed.push('editor');return true;});
  back.register(30,()=>{if(!photo)return false;photo=false;closed.push('photo');return true;});
  for(let n=0;n<3;n++)assert.equal(back.dispatch(),true);
  assert.deepEqual(closed,['photo','editor','page']);
});
test('Unmounted back actions do not intercept a later press and root navigation can fall through',()=>{
  const back=createBackNavigation();const unregister=back.register(20,()=>true);assert.equal(back.dispatch(),true);unregister();assert.equal(back.dispatch(),false);
  back.register(0,()=>false);assert.equal(back.dispatch(),false);
});
test('Camera cancellation is quiet but permission, decoding and storage errors remain errors',()=>{
  assert.equal(isCameraCancellation(new Error('User cancelled photos app')),true);assert.equal(isCameraCancellation({message:'User cancelled photos app'}),true);
  for(const error of [new Error('User denied access to camera'),new Error('No camera activity found'),new Error('Unable to process bitmap'),new Error('Could not save the image'),null,undefined])assert.equal(isCameraCancellation(error),false);
});

test('Native and browser permission denials are actionable, without treating cancellation or broken images as denied permission',()=>{
  for(const error of [new Error('User denied access to camera'),{code:'PHOTO_PERMISSION_DENIED',message:'Access denied'},{message:'SecurityException'},{name:'NotAllowedError'},{name:'SecurityError'},new Error('Camera permission not granted')])assert.equal(isPhotoPermissionError(error),true);
  for(const error of [new Error('User cancelled photos app'),new Error('Could not decode the photo.'),{code:'PHOTO_PICKER_UNAVAILABLE',message:'No photo or file picker is available on this device.'},null,undefined])assert.equal(isPhotoPermissionError(error),false);
  assert.equal(cameraErrorMessage({message:'Access denied'}),'Access denied');assert.equal(cameraErrorMessage(null),'');
});
