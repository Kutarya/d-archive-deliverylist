import fs from 'node:fs/promises';
import {createWorker,PSM} from 'tesseract.js';
import {parseInvoice} from '../src/ocr';
import type {OcrLine} from '../src/platform';
const version=JSON.parse(await fs.readFile('package.json','utf8')).version,folder=`artifacts/${version}/fixtures`;
const cases=process.env.QA_PHOTO?[{file:process.env.QA_PHOTO}]:JSON.parse(await fs.readFile(folder+'/expected.json','utf8'));
const worker=await createWorker(['tur','ces','eng'],1,{langPath:'public/ocr/lang'});
await worker.setParameters({tessedit_pageseg_mode:PSM.AUTO,preserve_interword_spaces:'1'});
const reports=[];
try{for(const sample of cases){
 const result=await worker.recognize((process.env.QA_PHOTO?sample.file:folder+'/'+sample.file),{}, {blocks:true});const tokens:OcrLine[]=[];
 result.data.blocks?.forEach(b=>b.paragraphs.forEach(p=>p.lines.forEach(l=>l.words.forEach(w=>tokens.push({text:w.text,x:w.bbox.x0,y:w.bbox.y0,width:w.bbox.x1-w.bbox.x0,height:w.bbox.y1-w.bbox.y0,confidence:w.confidence})))));
 const parsed=parseInvoice(result.data.text,tokens);reports.push({file:sample.file,text:result.data.text,tokens,parsed});console.log(JSON.stringify({file:sample.file,confidence:result.data.confidence,text:result.data.text,number:parsed.number,supplier:parsed.supplier,items:parsed.items,statedTotal:parsed.statedTotal}));
}}finally{await worker.terminate();}
await fs.writeFile(`artifacts/${version}/ocr-basic-diagnostics.json`,JSON.stringify(reports,null,2));
