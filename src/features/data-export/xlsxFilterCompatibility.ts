import JSZip from 'jszip'

export interface ExportWorksheetFilter { name: string; ref: string }

const mainNamespace='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const filterName='_xlnm._FilterDatabase'
const compatibilityError=()=>new Error('无法核对 Excel 筛选区域，未导出不完整文件。')
const escapeXml=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))

// ExcelJS 4.4.0 drops sheet scope in its public definedNames API and cannot write
// hidden names. Complete only workbook.xml after serialization; never patch its
// internal model/getters or rewrite worksheets, rich text, comments or styles.
export async function completeExportFilterNames(bytes: Uint8Array, filters: readonly ExportWorksheetFilter[], signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted()
  if(!filters.length)return bytes
  const zip=await JSZip.loadAsync(bytes)
  const part=zip.file('xl/workbook.xml')
  if(!part)throw compatibilityError()
  const xml=await part.async('string')
  signal?.throwIfAborted()
  const doc=new DOMParser().parseFromString(xml,'application/xml')
  if(doc.getElementsByTagName('parsererror').length||doc.documentElement.namespaceURI!==mainNamespace)throw compatibilityError()
  const sheets=Array.from(doc.getElementsByTagNameNS(mainNamespace,'sheet'))
  const names=Array.from(doc.getElementsByTagNameNS(mainNamespace,'definedName'))
  const scopes=new Set<number>(),additions:string[]=[]
  for(const filter of filters){
    signal?.throwIfAborted()
    // localSheetId is the zero-based workbook position, NOT worksheet.id.
    const scope=sheets.findIndex(s=>s.getAttribute('name')===filter.name)
    if(scope<0||scopes.has(scope)||!/^([A-Z]+[1-9]\d*):([A-Z]+[1-9]\d*)$/.test(filter.ref))throw compatibilityError()
    scopes.add(scope)
    const absolute=filter.ref.replace(/([A-Z]+)(\d+)/g,(_,column:string,row:string)=>`$${column}$${row}`)
    const reference=`'${filter.name.replace(/'/g,"''")}'!${absolute}`
    const existing=names.filter(n=>n.getAttribute('name')===filterName&&n.getAttribute('localSheetId')===String(scope))
    if(existing.length){
      // Never overwrite an existing name or silently change its meaning.
      if(existing.length!==1||existing[0].textContent!==reference||!['1','true'].includes(existing[0].getAttribute('hidden')??''))throw compatibilityError()
      continue
    }
    additions.push(`<definedName name="${filterName}" localSheetId="${scope}" hidden="1">${escapeXml(reference)}</definedName>`)
  }
  if(!additions.length)return bytes
  const content=additions.join('')
  // ExcelJS emits unprefixed elements. Keep every existing XML byte unchanged.
  let updated:string
  if(/<definedNames\s*\/>/.test(xml))updated=xml.replace(/<definedNames\s*\/>/,()=>`<definedNames>${content}</definedNames>`)
  else if(xml.includes('</definedNames>'))updated=xml.replace('</definedNames>',()=>content+'</definedNames>')
  else if(xml.includes('</sheets>'))updated=xml.replace('</sheets>',()=>'</sheets><definedNames>'+content+'</definedNames>')
  else throw compatibilityError()
  zip.file('xl/workbook.xml',updated)
  signal?.throwIfAborted()
  const result=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'})
  signal?.throwIfAborted()
  return result
}
