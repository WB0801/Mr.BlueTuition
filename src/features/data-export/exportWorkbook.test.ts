import JSZip from 'jszip'
import { createExportWorkbook } from './exportWorkbook'
import type { ExportData } from './exportRules'

it('serializes a hidden sheet-local filter database for every real filter, including an empty detail', async () => {
  const data: ExportData={range:'虚构',dateScope:'全部',exportedAt:'测试',fileName:'test.xlsx',sheets:[
    {name:'学生名单',headers:['班级','姓名','电话','学校班级'],rows:[['虚构班','同名甲','012-0000000',null],['虚构班','同名甲','+60 12-000-0000','高一']]},
    {name:'小考成绩',headers:['分数','满分','百分比'],rows:[[0,20,'0%']]},
    {name:'空明细',headers:['金额'],rows:[]},
  ]}
  const zip=await JSZip.loadAsync(await createExportWorkbook(data))
  const doc=new DOMParser().parseFromString(await zip.file('xl/workbook.xml')!.async('string'),'application/xml')
  const names=Array.from(doc.getElementsByTagName('definedName')).filter(n=>n.getAttribute('name')==='_xlnm._FilterDatabase')
  expect(names.map(n=>({scope:n.getAttribute('localSheetId'),hidden:n.getAttribute('hidden'),ref:n.textContent}))).toEqual([
    {scope:'0',hidden:'1',ref:"'学生名单'!$A$1:$D$3"},
    {scope:'1',hidden:'1',ref:"'小考成绩'!$A$1:$C$2"},
    {scope:'2',hidden:'1',ref:"'空明细'!$A$1:$A$1"},
  ])
}, 30000)

it('quotes Chinese, spaces, apostrophes and XML characters without mixing sheet scopes or wide ranges', async () => {
  const data: ExportData={range:'虚构',dateScope:'全部',exportedAt:'测试',fileName:'test.xlsx',sheets:[
    {name:"中文 O'Brien & A",headers:['姓名','电话'],rows:[['虚构','012-0000000']]},
    {name:'Empty 明细',headers:Array.from({length:28},(_,i)=>`栏${i+1}`),rows:[]},
  ]}
  const zip=await JSZip.loadAsync(await createExportWorkbook(data))
  const doc=new DOMParser().parseFromString(await zip.file('xl/workbook.xml')!.async('string'),'application/xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  const names=Array.from(doc.getElementsByTagName('definedName'))
  expect(names.map(n=>[n.getAttribute('localSheetId'),n.textContent])).toEqual([
    ['0',"'中文 O''Brien & A'!$A$1:$B$2"],['1',"'Empty 明细'!$A$1:$AB$1"],
  ])
  expect(await zip.file('xl/worksheets/sheet2.xml')!.async('string')).toContain('autoFilter ref="A1:AB1"')
})

it('writes an actual workbook with exact roster headers, typed numbers and safe original strings, freeze and filters', async () => {
  const data: ExportData={range:'所选班级',dateScope:'全部已存记录',exportedAt:'2026/10/21 12:00',fileName:'example.xlsx',sheets:[
    {name:'学生名单',headers:['补习班班级','学生姓名','学校班级','电话'],rows:[['=1+1','中文Name','@SUM(A1)','012-3456789'],['同名班','+姓名',null,'+60 (12) 000-0000']]},
    {name:'小考成绩',headers:['分数','满分','百分比'],rows:[[1,3,'33.3%'],[0,20,'0%'],[null,null,null]]},
    {name:'学费记录',headers:['金额'],rows:[]},
  ]}
  const result=await createExportWorkbook(data)
  const zip=await JSZip.loadAsync(result)
  const workbook=await zip.file('xl/workbook.xml')!.async('string')
  expect(workbook).toContain('name="学生名单"');expect(workbook).toContain('name="学费记录"')
  const first=await zip.file('xl/worksheets/sheet1.xml')!.async('string')
  expect(first).toContain('state="frozen"');expect(first).toContain('ySplit="1"');expect(first).toContain('autoFilter ref="A1:D3"')
  expect(first).not.toContain('<f>');expect(first).not.toContain('<hyperlink')
  expect(first).toMatch(/r="D2"[^>]*t="s"/)
  const shared=await zip.file('xl/sharedStrings.xml')!.async('string')
  expect(shared).toContain('012-3456789');expect(shared).toContain('+60 (12) 000-0000');expect(shared).toContain('=1+1')
  expect(shared).toContain('楷体');expect(shared).toContain('Times New Roman')
  const second=await zip.file('xl/worksheets/sheet2.xml')!.async('string')
  expect(second).toMatch(/r="A2"[^>]*><v>1<\/v>/);expect(second).toMatch(/r="A3"[^>]*><v>0<\/v>/)
  const empty=await zip.file('xl/worksheets/sheet3.xml')!.async('string')
  expect(empty).toContain('0笔');expect(empty).not.toContain('r="A2"')
}, 30000)

it('keeps dollar replacement syntax literal in an otherwise valid sheet name', async () => {
  const data:ExportData={range:'虚构',dateScope:'全部',exportedAt:'测试',fileName:'test.xlsx',sheets:[
    {name:"中文 $& O'Brien",headers:['姓名'],rows:[['虚构']]},
  ]}
  const zip=await JSZip.loadAsync(await createExportWorkbook(data))
  const doc=new DOMParser().parseFromString(await zip.file('xl/workbook.xml')!.async('string'),'application/xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  expect(doc.getElementsByTagName('definedName')[0]?.textContent).toBe("'中文 $& O''Brien'!$A$1:$A$2")
})

it('does not finish serialization when cancelled and does not mutate input records', async () => {
  const data: ExportData={range:'测试',dateScope:'全部',exportedAt:'测试',fileName:'example.xlsx',sheets:[{name:'学生名单',headers:['电话'],rows:[['012-0000000']]}]}
  const copy=structuredClone(data);const controller=new AbortController();controller.abort()
  await expect(createExportWorkbook(data,controller.signal)).rejects.toThrow()
  expect(data).toEqual(copy)
})
