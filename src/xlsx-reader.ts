import JSZip from 'jszip';
import { locales, translate, type Language } from './i18n';
export type SheetCells={name:string;state:string;cells:Map<number,Map<number,string|number|boolean>>;display:Map<number,Map<number,string>>;hidden:Set<number>;merges:{row:number;column:number;rowSpan:number;colSpan:number}[]};
const nodes=(root:Document|Element,name:string)=>Array.from(root.getElementsByTagNameNS('*',name));
const address=(ref:string)=>{const match=/^([A-Z]+)(\d+)$/i.exec(ref);let column=0;for(const char of match?.[1].toUpperCase()??'')column=column*26+char.charCodeAt(0)-64;return{row:Number(match?.[2]??0),column};};
export function formatExcelNumber(value:number,code:string,language:Language,date1904=false):string {
  const clean=code.replace(/"[^"]*"|\[[^\]]*\]|\\./g,'');
  if(/[dy]/i.test(clean))return new Date(Date.UTC(date1904?1904:1899,date1904?0:11,date1904?1:30)+value*86400000).toLocaleDateString(locales[language],{timeZone:'UTC'});
  if(!/[0#]/.test(clean))return String(value);
  const decimal=clean.split(';')[0].match(/\.([0#]+)/)?.[1]??'';
  const percent=clean.includes('%');
  const formatted=new Intl.NumberFormat(locales[language],{style:percent?'percent':'decimal',useGrouping:clean.includes(','),minimumFractionDigits:(decimal.match(/0/g)??[]).length,maximumFractionDigits:Math.min(15,decimal.length)}).format(value);
  const symbol=code.match(/\[\$([^\]-]+)(?:-[^\]]*)?\]/)?.[1]??code.match(/"([€£$₺]|CZK|TRY|EUR|USD|GBP)"/)?.[1]??code.match(/[€£$₺]/)?.[0];
  return symbol?`${formatted} ${symbol}`:formatted;
}
export async function readXlsxXml(data:ArrayBuffer,language:Language='en'):Promise<SheetCells[]> {
  const zip=await JSZip.loadAsync(data);
  const parse=async(path:string)=>{
    const file=zip.file(path);if(!file)throw new Error('A required part of the Excel workbook is missing.');
    const doc=new DOMParser().parseFromString(await file.async('string'),'application/xml');
    if(nodes(doc,'parsererror').length)throw new Error('Could not read the Excel XML content.');return doc;
  };
  const workbook=await parse('xl/workbook.xml'),rels=await parse('xl/_rels/workbook.xml.rels');
  const relations=new Map(nodes(rels,'Relationship').map(n=>[n.getAttribute('Id'),n.getAttribute('Target')!]));
  const shared:string[]=[];
  if(zip.file('xl/sharedStrings.xml'))for(const si of nodes(await parse('xl/sharedStrings.xml'),'si'))shared.push(nodes(si,'t').map(t=>t.textContent||'').join(''));
  const formats=new Map<number,string>();
  const date1904=nodes(workbook,'workbookPr')[0]?.getAttribute('date1904')==='1';
  if(zip.file('xl/styles.xml')) {
    const styles=await parse('xl/styles.xml');const custom=new Map(nodes(styles,'numFmt').map(n=>[Number(n.getAttribute('numFmtId')),n.getAttribute('formatCode') || '']));
    const builtins:Record<number,string>={0:'General',1:'0',2:'0.00',3:'#,##0',4:'#,##0.00',9:'0%',10:'0.00%',14:'dd/mm/yyyy',15:'dd-mmm-yy',16:'dd-mmm',17:'mmm-yy',22:'dd/mm/yyyy hh:mm'};
    const xfs=nodes(styles,'cellXfs')[0];if(xfs)Array.from(xfs.children).forEach((xf,index)=>{const id=Number(xf.getAttribute('numFmtId'));formats.set(index,custom.get(id)??builtins[id]??'General');});
  }
  const sheets:SheetCells[]=[];
  for(const sheet of nodes(workbook,'sheet')) {
    const rid=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id');
    const target=relations.get(rid);if(!target)continue;
    const path=target.startsWith('/')?target.slice(1):target.startsWith('xl/')?target:'xl/'+target.replace(/^\.\//,'');
    const xml=await parse(path);const cells:SheetCells['cells']=new Map(),display:SheetCells['display']=new Map(),hidden=new Set<number>();
    for(const col of nodes(xml,'col'))if(col.getAttribute('hidden')==='1')for(let n=Number(col.getAttribute('min'));n<=Math.min(16384,Number(col.getAttribute('max')));n++)hidden.add(n);
    const rowNodes=nodes(xml,'row');if(rowNodes.length>100000)throw new Error('Excel previews support up to 100,000 rows per sheet.');
    for(const row of rowNodes) {
      const rn=Number(row.getAttribute('r'));const values=new Map<number,string|number|boolean>(),labels=new Map<number,string>();
      for(const cell of Array.from(row.children).filter(n=>n.localName==='c')) {
        const address=cell.getAttribute('r')||'';let cn=0;for(const char of address.replace(/\d/g,''))cn=cn*26+char.charCodeAt(0)-64;
        const type=cell.getAttribute('t'),v=nodes(cell,'v')[0]?.textContent,f=nodes(cell,'f')[0]?.textContent;
        let value:string|number|boolean='';
        if(type==='s')value=shared[Number(v)]??'';
        else if(type==='inlineStr')value=nodes(cell,'t').map(t=>t.textContent||'').join('');
        else if(type==='b')value=v==='1';
        else if(type==='str'||type==='e'||type==='d')value=v||'';
        else if(v!==undefined&&v!==null&&v!=='')value=Number.isFinite(Number(v))?Number(v):v;
        else if(f)value='='+f;
        if(cn>0){values.set(cn,value);labels.set(cn,typeof value==='number'?formatExcelNumber(value,formats.get(Number(cell.getAttribute('s')))??'General',language,date1904):String(value));}
      }
      if(rn>0){cells.set(rn,values);display.set(rn,labels);}
    }
    const merges=nodes(xml,'mergeCell').flatMap(cell=>{const [start,end]=(cell.getAttribute('ref')??'').split(':').map(address);return start&&end?[{...start,rowSpan:end.row-start.row+1,colSpan:end.column-start.column+1}]:[];});
    sheets.push({name:sheet.getAttribute('name')||translate('Sheet',language),state:sheet.getAttribute('state')||'visible',cells,display,hidden,merges});
  }
  return sheets;
}
