import { prepareImage,processPhoto } from './platform';

export type SourcePage = { image: string; name: string; hash: string };
export async function* sourcePages(file: File): AsyncGenerator<SourcePage> {
  if (file.size > 35 * 1024 * 1024) throw new Error('The photo exceeds the 35 MB limit.');
  const {bytes,hash}=await processPhoto(async()=>{
    const bytes=await file.arrayBuffer();
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    return {bytes,hash};
  });
  if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
    yield { image: await prepareImage(file), name: file.name, hash };
    return;
  }
  const { getDocument } = await import('./pdf-runtime');
  const task = getDocument({ data: new Uint8Array(bytes) });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error('Select a PDF with up to 20 pages.');
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const initial = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2600 / Math.max(initial.width, initial.height)) });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      await processPhoto(()=>page.render({ canvas, viewport }).promise);
      yield { image: canvas.toDataURL('image/jpeg', 0.95), name: `${file.name} (${pageNumber}/${pdf.numPages})`, hash: `${hash}:${pageNumber}` };
      canvas.width = 0; canvas.height = 0; page.cleanup();
    }
  } finally { await task.destroy(); }
}
