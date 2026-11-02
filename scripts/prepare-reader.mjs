import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const folder='public/reader',models=['PP-OCRv6_tiny_det','PP-OCRv6_small_rec','en_PP-OCRv5_mobile_rec'];
await fs.mkdir(folder+'/models',{recursive:true});await fs.mkdir(folder+'/ort',{recursive:true});
const manifest=[];
for(const name of models){
 const destination=folder+'/models/'+name+'.tar',cached='artifacts/handwriting-runtime/paddle-probe/public/models/'+name+'.tar';
 const url='https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/'+name+'_onnx_infer.tar';
 try{await fs.access(destination);}catch{try{await fs.copyFile(cached,destination);}catch{const response=await fetch(url);if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);await fs.writeFile(destination,new Uint8Array(await response.arrayBuffer()));}}
 const bytes=await fs.readFile(destination);manifest.push({name,file:'models/'+name+'.tar',url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
// The SDK's prebuilt worker embeds ORT 1.24.3; use the matching JSEP runtime.
for(const name of ['ort-wasm-simd-threaded.jsep.mjs','ort-wasm-simd-threaded.jsep.wasm'])await fs.copyFile(path.join('node_modules/onnxruntime-web/dist',name),folder+'/ort/'+name);
for(const name of ['ort-wasm-simd-threaded.mjs','ort-wasm-simd-threaded.wasm'])await fs.rm(folder+'/ort/'+name,{force:true});
await fs.writeFile(folder+'/manifest.json',JSON.stringify({sdk:'@paddleocr/paddleocr-js@0.4.2',models:manifest},null,2)+'\n');
await fs.writeFile(folder+'/NOTICE.txt','PaddleOCR.js and PP-OCR models: PaddlePaddle Authors, Apache-2.0.\nhttps://github.com/PaddlePaddle/PaddleOCR\n\nONNX Runtime Web: Microsoft, MIT.\nhttps://github.com/microsoft/onnxruntime\n\nOpenCV.js: OpenCV contributors, Apache-2.0.\nhttps://github.com/opencv/opencv\n\nAll OCR models and runtime files are bundled. Document photos are processed locally.\n');
console.log('Offline document reader assets prepared: '+models.join(', '));
