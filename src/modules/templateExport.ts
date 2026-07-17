/**
 * 文件名称：通用专业分模板导出逻辑
 *
 * 文件作用：
 * - 统一生成专业分模板 Excel
 * - 控制模板表头、行高、字体、合并单元格、A2/B2/C2/D2 等内容
 *
 * 常改位置：
 * - A1:U1 合并单元格
 * - A2 招生年份
 * - B2 年份值
 * - C2/D2 是否清空
 * - 表头字段
 * - 行高
 * - 红色字体
 * - 单元格边框 / 对齐方式
 *
 * 注意：
 * - 如果多个功能导出的专业分模板样式同时不对，优先检查本文件
 * - 如果只有某一个工具导出不对，检查该工具自己的 modules 文件
 */

import ExcelJS from 'exceljs'
import { writeXlsxBufferWithUniformFormatting } from '../utils/excelExport'
import type { ProcessedRecord, ValidationIssue } from '../types/record'
import { validateSchoolAndMajorComboDetailed } from './ruleCenterValidation'

const NOTE_TEXT = `备注：请删除示例后再填写；
1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、
体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”
3.批次：（以下为19年使用批次）
河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、
本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；
黑龙江、湖南、青海限定本科提前批、本科一批、本科二批、本科三批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；
山西限定本科一批A段、本科一批B段、本科二批A段、本科二批B段、本科二批C段、专科批、国家专项计划本科批、地方专项计划本科批；
浙江限定普通类提前批、平行录取一段、平行录取二段、平行录取三段
4.招生人数：仅能填写数字
5.最高分、最低分、平均分：仅能填写数字，保留小数后两位，且三者顺序不能改变，最低分为必填项，其中艺术类和体育类分数为文化课分数
6.一级层次：限定“本科、专科（高职）”，该部分为招生专业对应的专业层次
7.最低分位次：仅能填写数字;
8.数据来源：必须限定——官方考试院、大红本数据、学校官网、销售、抓取、圣达信、优志愿、学业桥
9.选科要求：不限科目专业组;多门选考;单科、多科均需选考
10.选科科目必须是科目的简写（物、化、生、历、地、政、技）
                    
11.2020北京、海南，17-19上海仅限制本科专业组代码必填
12.新八省首选科目必须选择（物理或历史）
13.分数区间仅限北京`

const HEADERS = [
  '学校名称',
  '省份',
  '招生专业',
  '专业方向（选填）',
  '专业备注（选填）',
  '一级层次',
  '招生科类',
  '招生批次',
  '招生类型（选填）',
  '最高分',
  '最低分',
  '平均分',
  '最低分位次（选填）',
  '招生人数（选填）',
  '数据来源',
  '专业组代码',
  '首选科目',
  '选科要求',
  '次选科目',
  '专业代码',
  '招生代码',
  '最低分数区间低',
  '最低分数区间高',
  '最低分数区间位次低',
  '最低分数区间位次高',
  '录取人数（选填）',
  '学校名称校验结果',
  '专业名称校验结果',
]

function downloadBuffer(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function isBlockingExportIssue(issue: ValidationIssue) {
  // 分数顺序逻辑错误只标注，不拦截导出。
  if (issue.code === 'score_order_invalid') return false
  return issue.level === 'error'
}

export function getExportableRecords(records: ProcessedRecord[]) {
  return records.filter((record) => !record.issues.some(isBlockingExportIssue))
}

export async function exportProfessionalScoreTemplate(
  year: string,
  records: ProcessedRecord[],
  ruleCenterOptions: {
    validSchoolNames?: string[]
    validMajorCombos?: string[]
  } = {}
) {
  const exportable = getExportableRecords(records)

  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Worksheet')

  worksheet.mergeCells('A1:U1')
  const noteCell = worksheet.getCell('A1')
  noteCell.value = NOTE_TEXT
  noteCell.font = {
    color: { argb: 'FFFF0000' },
    size: 11,
  }
  noteCell.alignment = {
    wrapText: true,
    vertical: 'top',
    horizontal: 'left',
  }

  worksheet.getCell('A2').value = '招生年份'
  worksheet.getCell('B2').value = Number(year)
  worksheet.getCell('C2').value = null
  worksheet.getCell('D2').value = null

  HEADERS.forEach((header, index) => {
    const cell = worksheet.getCell(3, index + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false }
  })

  const widths = [20, 12, 22, 18, 18, 14, 14, 16, 16, 10, 10, 10, 14, 12, 14, 14, 10, 18, 10, 12, 12, 14, 14, 16, 16, 12, 18, 18]
  widths.forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width
  })

  worksheet.getRow(1).height = 206
  worksheet.getRow(3).height = 14

  exportable.forEach((record, idx) => {
    const rowIndex = idx + 4
    const r = record.result

    const rowValues = [
      r.schoolName ?? '',
      r.province ?? '',
      r.majorName ?? '',
      r.majorDirection ?? '',
      r.majorRemark ?? '',
      r.level1 ?? '',
      r.subjectCategory ?? '',
      // 浙江的导出批次按业务要求固定留空，不影响前面的批次匹配流程。
      r.province === '浙江' ? '' : r.batch ?? '',
      r.enrollmentType ?? '',
      r.highestScore ?? '',
      r.lowestScore ?? '',
      r.averageScore ?? '',
      r.lowestRank ?? '',
      '',
      r.dataSource ?? '',
      r.groupCode ?? '',
      r.firstSubject ?? '',
      r.subjectRequirementMode ?? '',
      r.secondSubject ?? '',
      r.majorCode ?? '',
      r.enrollmentCode ?? '',
      r.scoreRangeLow ?? '',
      r.scoreRangeHigh ?? '',
      r.scoreRangeRankLow ?? '',
      r.scoreRangeRankHigh ?? '',
      r.admittedCount ?? '',
      validateSchoolAndMajorComboDetailed({
        validSchoolNames: ruleCenterOptions.validSchoolNames,
        schoolName: r.schoolName,
      }).schoolResult,
      validateSchoolAndMajorComboDetailed({
        validMajorCombos: ruleCenterOptions.validMajorCombos,
        majorName: r.majorName,
        level: r.level1,
      }).majorResult,
    ]

    rowValues.forEach((value, colIdx) => {
      const cell = worksheet.getCell(rowIndex, colIdx + 1)

      if ([16, 17, 18, 19, 20, 21].includes(colIdx + 1)) {
        cell.numFmt = '@'
        cell.value = value === '' ? '' : String(value)
      } else {
        cell.value = value as string | number
      }
    })
  })

  const buffer = await writeXlsxBufferWithUniformFormatting(workbook)
  downloadBuffer(buffer as ArrayBuffer, `专业分批量导入模板_${year}.xlsx`)
}
