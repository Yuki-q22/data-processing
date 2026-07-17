import * as XLSX from 'xlsx'

export type ExportableRemarkRule = {
  keyword: string
  outputType: string
  priority: number
}

export const REMARK_RULE_SHEET_NAME = '备注招生类型规则'

/**
 * 生成与规则中心导入格式完全一致的工作簿，导出的文件可直接再次导入。
 */
export function buildRemarkRuleWorkbook(rules: ExportableRemarkRule[]) {
  if (!rules.length) {
    throw new Error('当前没有可导出的备注招生类型规则')
  }

  const rows = [
    ['备注查找字段', '输出招生类型', '优先级'],
    ...rules.map((rule) => [rule.keyword, rule.outputType, rule.priority]),
  ]
  const worksheet = XLSX.utils.aoa_to_sheet(rows)

  worksheet['!cols'] = [{ wch: 32 }, { wch: 32 }, { wch: 10 }]
  worksheet['!autofilter'] = { ref: `A1:C${rows.length}` }

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, REMARK_RULE_SHEET_NAME)

  return workbook
}

export function buildRemarkRuleFileName(now = new Date()) {
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')

  return `备注招生类型规则_${date}.xlsx`
}

export function downloadRemarkRuleWorkbook(rules: ExportableRemarkRule[]) {
  XLSX.writeFile(buildRemarkRuleWorkbook(rules), buildRemarkRuleFileName(), {
    compression: true,
  })
}
