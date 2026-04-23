import ExcelJS from 'exceljs'

type SegmentationProcessResult = {
  blob: Blob
  summary: {
    yearCheck: string
    insertedGapRows: number
    autoFilledCountRows: number
  }
}

function parseScoreNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).split('-')[0].trim()
  const n = Number(text)
  return Number.isNaN(n) ? null : n
}

function isEmpty(value: unknown) {
  return value === null || value === undefined || String(value).trim() === ''
}

export async function processSegmentationWorkbook(file: File): Promise<SegmentationProcessResult> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.worksheets[0]

  const yellowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFF00' },
  }

  worksheet.getCell('E7').value = '累计人数校验结果'
  worksheet.getCell('F7').value = '分数校验结果'
  worksheet.getCell('F2').value = '年份校验'

  const yearValue = worksheet.getCell('B2').value
  let yearCheck = '√'
  if (String(yearValue ?? '').trim() !== '2025') {
    yearCheck = `× 应为2025，当前为：${String(yearValue ?? '')}`
  }
  worksheet.getCell('G2').value = yearCheck

  const province = String(worksheet.getCell('B3').value ?? '').trim()
  let suffix = '-750'
  if (province === '上海') suffix = '-660'
  if (province === '海南') suffix = '-900'

  let insertedGapRows = 0
  let autoFilledCountRows = 0

  const firstScore = parseScoreNumber(worksheet.getCell('A8').value)
  if (firstScore !== null) {
    worksheet.getCell('A8').value = `${firstScore}${suffix}`
  }

  let row = 8
  while (row < worksheet.rowCount) {
    const currScore = parseScoreNumber(worksheet.getCell(`A${row}`).value)
    const nextScore = parseScoreNumber(worksheet.getCell(`A${row + 1}`).value)

    if (currScore !== null && nextScore !== null && currScore - nextScore > 1) {
      const missingScore = currScore - 1
      const currTotal = worksheet.getCell(`C${row}`).value

      worksheet.spliceRows(row + 1, 0, [missingScore, 0, currTotal, '', '补断点', '补断点'])
      ;['A', 'B', 'C', 'E', 'F'].forEach((col) => {
        worksheet.getCell(`${col}${row + 1}`).fill = yellowFill
      })

      insertedGapRows += 1
    } else {
      row += 1
    }
  }

  let correctTotal: number | null = null

  for (let r = 8; r <= worksheet.rowCount; r += 1) {
    const scoreCell = worksheet.getCell(`A${r}`)
    const countCell = worksheet.getCell(`B${r}`)
    const totalCell = worksheet.getCell(`C${r}`)
    const cumulativeCheckCell = worksheet.getCell(`E${r}`)
    const scoreCheckCell = worksheet.getCell(`F${r}`)

    const score = parseScoreNumber(scoreCell.value)
    const total = Number(totalCell.value)

    if (!isEmpty(totalCell.value) && isEmpty(countCell.value)) {
      if (r === 8) {
        countCell.value = totalCell.value
        autoFilledCountRows += 1
      } else {
        const prevTotalRaw = worksheet.getCell(`C${r - 1}`).value
        const prevTotal = Number(prevTotalRaw)
        if (!Number.isNaN(prevTotal) && !Number.isNaN(total)) {
          countCell.value = total - prevTotal
          autoFilledCountRows += 1
        }
      }
    }

    const currentCount = Number(countCell.value)
    const currentTotal = Number(totalCell.value)

    if (r === 8) {
      if (cumulativeCheckCell.value !== '补断点') {
        cumulativeCheckCell.value = '√'
      }
      correctTotal = Number.isNaN(currentTotal) ? null : currentTotal
    } else {
      if (
        correctTotal !== null &&
        !Number.isNaN(currentCount) &&
        !Number.isNaN(currentTotal)
      ) {
        const expectedTotal: number = correctTotal + currentCount
        if (expectedTotal === currentTotal) {
          if (cumulativeCheckCell.value !== '补断点') {
            cumulativeCheckCell.value = '√'
          }
          correctTotal = currentTotal
        } else {
          if (cumulativeCheckCell.value !== '补断点') {
            cumulativeCheckCell.value = `× 应为${expectedTotal}`
          }
          correctTotal = expectedTotal
        }
      }
    }

    if (r > 8) {
      const prevScore = parseScoreNumber(worksheet.getCell(`A${r - 1}`).value)
      if (prevScore !== null && score !== null) {
        const diff = prevScore - score
        if (scoreCheckCell.value !== '补断点') {
          scoreCheckCell.value = diff === 1 ? '√' : `× 差值为${diff}`
        }
      }
    } else {
      if (scoreCheckCell.value !== '补断点') {
        scoreCheckCell.value = '√'
      }
    }
  }

  const outBuffer = await workbook.xlsx.writeBuffer()
  return {
    blob: new Blob([outBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    summary: {
      yearCheck,
      insertedGapRows,
      autoFilledCountRows,
    },
  }
}