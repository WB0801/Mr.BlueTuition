import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { completeExportFilterNames } from './xlsxFilterCompatibility'

async function fixture() {
  const book=new ExcelJS.Workbook()
  book.addWorksheet('无筛选')
  const sheet=book.addWorksheet("中文 O'Brien & A")
  sheet.addRows([['姓名','金额'],['虚构 A',0],['虚构 B',25.5]])
  sheet.autoFilter='A1:B3'
  sheet.views=[{state:'frozen',ySplit:1}]
  sheet.getCell('A1').note='保留批注'
  sheet.pageSetup.printArea='A1:B3'
  book.definedNames.add("'无筛选'!$A$1",'KeepMe')
  return new Uint8Array(await book.xlsx.writeBuffer())
}

it('changes only workbook.xml, preserves existing names and every other package part, using physical sheet position', async () => {
  const a=await fixture(),za=await JSZip.loadAsync(a)
  const b=await completeExportFilterNames(a,[{name:"中文 O'Brien & A",ref:'A1:B3'}])
  const zb=await JSZip.loadAsync(b,{checkCRC32:true})
  expect(Object.keys(zb.files).sort()).toEqual(Object.keys(za.files).sort())
  for(const name of Object.keys(za.files).filter(n=>!za.files[n].dir&&n!=='xl/workbook.xml')) {
    expect(await zb.file(name)!.async('uint8array'),name).toEqual(await za.file(name)!.async('uint8array'))
  }
  const xmlA=await za.file('xl/workbook.xml')!.async('string'),xmlB=await zb.file('xl/workbook.xml')!.async('string')
  const doc=new DOMParser().parseFromString(xmlB,'application/xml')
  const names=Array.from(doc.getElementsByTagName('definedName'))
  expect(names.find(n=>n.getAttribute('name')==='KeepMe')?.textContent).toBe("'无筛选'!$A$1")
  expect(names.find(n=>n.getAttribute('name')==='_xlnm.Print_Area')?.getAttribute('localSheetId')).toBe('1')
  const filter=names.find(n=>n.getAttribute('name')==='_xlnm._FilterDatabase')
  expect(filter?.getAttribute('localSheetId')).toBe('1')
  expect(filter?.getAttribute('hidden')).toBe('1')
  expect(filter?.textContent).toBe("'中文 O''Brien & A'!$A$1:$B$3")
  expect(xmlB.replace(/<definedName\b[^>]*name="_xlnm\._FilterDatabase"[^>]*>[\s\S]*?<\/definedName>/g,'')).toBe(xmlA)
})

it('is idempotent and never adds a global or duplicate filter database name', async () => {
  const filters=[{name:"中文 O'Brien & A",ref:'A1:B3'}]
  const once=await completeExportFilterNames(await fixture(),filters)
  const twice=await completeExportFilterNames(once,filters)
  expect(twice).toEqual(once)
  const zip=await JSZip.loadAsync(twice)
  const doc=new DOMParser().parseFromString(await zip.file('xl/workbook.xml')!.async('string'),'application/xml')
  expect(Array.from(doc.getElementsByTagName('definedName')).filter(n=>n.getAttribute('name')==='_xlnm._FilterDatabase')).toHaveLength(1)
})

it('fails closed on mismatched scopes, invalid references or a conflicting existing filter name', async () => {
  const bytes=await fixture()
  await expect(completeExportFilterNames(bytes,[{name:'不存在',ref:'A1:B3'}])).rejects.toThrow()
  await expect(completeExportFilterNames(bytes,[{name:"中文 O'Brien & A",ref:'A0:B3'}])).rejects.toThrow()
  const once=await completeExportFilterNames(bytes,[{name:"中文 O'Brien & A",ref:'A1:B3'}])
  await expect(completeExportFilterNames(once,[{name:"中文 O'Brien & A",ref:'A1:B4'}])).rejects.toThrow()
})

it('does not touch the original buffer on cancellation, and leaves a no-filter workbook unchanged', async () => {
  const bytes=await fixture(),copy=bytes.slice(),controller=new AbortController()
  controller.abort()
  await expect(completeExportFilterNames(bytes,[{name:"中文 O'Brien & A",ref:'A1:B3'}],controller.signal)).rejects.toThrow()
  expect(bytes).toEqual(copy)
  expect(await completeExportFilterNames(bytes,[])).toBe(bytes)
})
