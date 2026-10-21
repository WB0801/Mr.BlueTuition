import JSZip from 'jszip'
import { createExportWorkbook } from './exportWorkbook'
import type { ExportData } from './exportRules'

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

it('does not finish serialization when cancelled and does not mutate input records', async () => {
  const data: ExportData={range:'测试',dateScope:'全部',exportedAt:'测试',fileName:'example.xlsx',sheets:[{name:'学生名单',headers:['电话'],rows:[['012-0000000']]}]}
  const copy=structuredClone(data);const controller=new AbortController();controller.abort()
  await expect(createExportWorkbook(data,controller.signal)).rejects.toThrow()
  expect(data).toEqual(copy)
})
