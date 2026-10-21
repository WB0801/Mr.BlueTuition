import type { ExportData } from './exportRules'
import { completeExportFilterNames, type ExportWorksheetFilter } from './xlsxFilterCompatibility'

export async function createExportWorkbook(data: ExportData, signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted()
  const { default: ExcelJS } = await import('exceljs')
  signal?.throwIfAborted()
  const book = new ExcelJS.Workbook()
  const filters:ExportWorksheetFilter[]=[]
  book.creator='蓝老师补习班'
  book.subject=data.range
  book.description=`范围：${data.range}\n明细：${data.dateScope}\n导出时间（马来西亚）：${data.exportedAt}\n出席按实际课程日期；成绩按考试日期；月费按相交收费月份；临时班费用按上课日期。仅已存可核实记录。`
  for (const sheet of data.sheets) {
    signal?.throwIfAborted()
    const ws=book.addWorksheet(sheet.name,{views:[{state:'frozen',ySplit:1}],properties:{defaultRowHeight:24}})
    ws.columns=sheet.headers.map(h=>({width:h==='关联课程'?48:h==='电话'?25:h.includes('班级')||h.includes('名称')?28:20}))
    ws.addRow(sheet.headers)
    for (let index=0;index<sheet.rows.length;index++) {
      if (index%200===0) { await new Promise(resolve=>setTimeout(resolve,0));signal?.throwIfAborted() }
      ws.addRow(sheet.rows[index])
    }
    ws.autoFilter={from:{row:1,column:1},to:{row:sheet.rows.length+1,column:sheet.headers.length}}
    filters.push({name:ws.name,ref:`A1:${ws.getCell(sheet.rows.length+1,sheet.headers.length).address}`})
    ws.getCell('A1').note=`${book.description}\n${sheet.name}：${sheet.rows.length}笔`
    ws.headerFooter={oddFooter:`&L${sheet.rows.length}笔&C${data.exportedAt}（马来西亚）&R第&P页`}
    ws.eachRow((row,rowNumber)=> {
      let lines=1
      row.eachCell({includeEmpty:true},cell=>{
        cell.font={name:'Times New Roman',size:12,color:{argb:'FF000000'},bold:rowNumber===1}
        cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:rowNumber===1?'FFE8E8E8':'FFFFFFFF'}}
        cell.alignment={vertical:'middle',wrapText:true}
        if (typeof cell.value==='string') {
          // A string (even starting =,+,-,@ or https://) is never a formula or hyperlink.
          const text=Array.from(cell.value).map(c=>c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c)?'�':c).join('')
          if(text.length>32767) throw new Error('单元格文字超过 Excel 限制，未导出截断文件。')
          const width=ws.getColumn(cell.col).width??20
          lines=Math.max(lines,text.split('\n').reduce((total,line)=>total+Math.max(1,Math.ceil(Array.from(line).reduce((n,c)=>n+(/[\u2e80-\uffff]/u.test(c)?2:1),0)/(width-2))),0))
          cell.value={richText:(text.match(/[\u2e80-\uffff]+|[^\u2e80-\uffff]+/gu)??['']).map(part=>({text:part,font:{name:/[\u2e80-\uffff]/u.test(part)?'楷体':'Times New Roman',size:12,color:{argb:'FF000000'},bold:rowNumber===1}}))}
          cell.numFmt='@'
        } else cell.numFmt='0.###############'
      })
      row.height=Math.min(409,Math.max(26,lines*18+8))
    })
  }
  signal?.throwIfAborted()
  const bytes=await book.xlsx.writeBuffer()
  signal?.throwIfAborted()
  return completeExportFilterNames(new Uint8Array(bytes),filters,signal)
}

export function downloadExportWorkbook(bytes: Uint8Array, fileName: string) {
  const url=URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
  const link=document.createElement('a');link.href=url;link.download=fileName
  try { document.body.append(link);link.click() }
  finally { link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000) }
}
