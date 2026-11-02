import fs from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
await fs.mkdir('public/ocr/core',{recursive:true});
await fs.copyFile('node_modules/tesseract.js/dist/worker.min.js','public/ocr/worker.min.js');
for(const name of await fs.readdir('node_modules/tesseract.js-core'))if(/^tesseract-core.*\.wasm(?:\.js)?$/.test(name))await fs.copyFile('node_modules/tesseract.js-core/'+name,'public/ocr/core/'+name);
const jobs=[
  ...['tur','ces','eng'].map(lang=>({url:`https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/${lang}.traineddata`,path:`public/ocr/lang/${lang}.traineddata.gz`,gzip:true})),
  ...['Regular','Bold'].map(style=>({url:`https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-${style}.ttf`,path:`public/fonts/NotoSans-${style}.ttf`})),
  {url:'https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE',path:'public/fonts/LICENSE.txt'}
];
await Promise.all(jobs.map(async job=>{
  try{await fs.access(job.path);return;}catch{}
  const r=await fetch(job.url);if(!r.ok)throw new Error(`${r.status} ${job.url}`);
  let bytes=Buffer.from(await r.arrayBuffer());if(job.gzip)bytes=gzipSync(bytes);
  await fs.mkdir(job.path.slice(0,job.path.lastIndexOf('/')),{recursive:true});await fs.writeFile(job.path,bytes);console.log(`${job.path}: ${bytes.length}`);
}));
