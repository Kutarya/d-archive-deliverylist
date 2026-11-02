// OCR runs exclusively in PaddleOCR's prebuilt worker, which already includes
// OpenCV. Importing a second copy into the WebView delays timers and navigation.
// An accidental attempt to use the main-thread pipeline must fail explicitly.
const workerOnlyOpenCv=new Proxy({}, {get(){throw new Error('Document recognition requires its background worker.');}});
export default workerOnlyOpenCv;
