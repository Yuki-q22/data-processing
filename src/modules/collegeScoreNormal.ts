import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { resolveControlLine } from "./controlLine";
import { validateSchoolAndMajorComboDetailed } from "./ruleCenterValidation";

export type NormalCollegeScoreInputTemplateType =
  | "rawMajorScore"
  | "libraryMajorScore";

export const NORMAL_COLLEGE_SCORE_TEMPLATE_LABELS: Record<
  NormalCollegeScoreInputTemplateType,
  string
> = {
  rawMajorScore: "专业分批量导入模板",
  libraryMajorScore: "专业分库中导出模板",
};

export type NormalCollegeScoreOutputRow = {
  学校名称: string;
  省份: string;
  招生类别: string;
  招生批次: string;
  招生类型: string;
  选测等级: string;
  最高分: number | null;
  最低分: number | null;
  平均分: number | null;
  最高位次: number | null;
  最低位次: number | null;
  平均位次: number | null;
  录取人数: number | null;
  招生人数: number | null;
  数据来源: string;
  省控线科类: string;
  省控线批次: string;
  省控线备注: string;
  专业组代码: string;
  首选科目: string;
  院校招生代码: string;
  层次: string;
  数据是否有问题: string;
  问题列表: string;
  学校名称校验结果: string;
  专业名称校验结果: string;
};

export type NormalCollegeScoreProcessResult = {
  templateType: NormalCollegeScoreInputTemplateType;
  templateName: string;
  year: string;
  inputRowCount: number;
  outputRowCount: number;
  rows: NormalCollegeScoreOutputRow[];
  missingColumns: string[];
  detectedHeaders: string[];
};

export type NormalCollegeScoreRowsInput = {
  rows: Record<string, unknown>[];
  detectedHeaders: string[];
  yearFromB2?: string;
  templateType: NormalCollegeScoreInputTemplateType;
  ruleCenterOptions?: {
    validSchoolNames?: string[];
    validMajorCombos?: string[];
  };
};

const RAW_MAJOR_SCORE_EXPECTED_COLUMNS = [
  "学校名称",
  "省份",
  "招生专业",
  "专业方向（选填）",
  "专业备注（选填）",
  "一级层次",
  "招生科类",
  "招生批次",
  "招生类型（选填）",
  "最高分",
  "最低分",
  "平均分",
  "最低分位次（选填）",
  "招生人数（选填）",
  "数据来源",
  "专业组代码",
  "首选科目",
  "选科要求",
  "次选科目",
  "专业代码",
  "招生代码",
  "最低分数区间低",
  "最低分数区间高",
  "最低分数区间位次低",
  "最低分数区间位次高",
  "录取人数（选填）",
];

const LIBRARY_MAJOR_SCORE_EXPECTED_COLUMNS = [
  "年份",
  "省份",
  "学校",
  "学校所在省份",
  "是否是985",
  "是否是211",
  "是否是双一流",
  "办学类型",
  "办学性质",
  "科类",
  "批次",
  "招生类型",
  "专业",
  "层次",
  "门类",
  "大类",
  "方向",
  "备注",
  "最高分",
  "平均分",
  "最低分",
  "最低分位次",
  "招生人数",
  "录取人数",
  "专业组代码",
  "专业组名",
  "专业组选科要求",
  "专业选科要求(新高考专业省份)",
  "招生代码",
  "专业代码",
  "数据来源",
];

const OUTPUT_HEADERS = [
  "学校名称",
  "省份",
  "招生类别",
  "招生批次",
  "招生类型",
  "选测等级",
  "最高分",
  "最低分",
  "平均分",
  "最高位次",
  "最低位次",
  "平均位次",
  "录取人数",
  "招生人数",
  "数据来源",
  "省控线科类",
  "省控线批次",
  "省控线备注",
  "专业组代码",
  "首选科目",
  "院校招生代码",
  "层次",
  "数据是否有问题",
  "问题列表",
  "学校名称校验结果",
  "专业名称校验结果",
] as const;

const TEMPLATE_NOTE = `备注：请删除示例后再填写；

1.省份：必须填写各省份简称，例如：北京、内蒙古，不能带有市、省、自治区、空格、特殊字符等

2.科类：浙江、上海限定“综合、艺术类、体育类”，内蒙古限定“文科、理科、蒙授文科、蒙授理科、艺术类、艺术文、艺术理、体育类、体育文、体育理、蒙授艺术、蒙授体育”，其他省份限定“文科、理科、艺术类、艺术文、艺术理、体育类、体育文、体育理”

3.批次：（以下为19年使用批次）

    北京、天津、辽宁、上海、山东、广东、海南限定本科提前批、本科批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

    河北、内蒙古、吉林、江苏、安徽、福建、江西、河南、湖北、广西、重庆、四川、贵州、云南、西藏、陕西、甘肃、宁夏、新疆限定本科提前批、本科一批、本科二批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

    黑龙江、湖南、青海限定本科提前批、本科一批、本科二批、本科三批、专科提前批、专科批、国家专项计划本科批、地方专项计划本科批；

    山西限定本科一批A段、本科一批B段、本科二批A段、本科二批B段、本科二批C段、专科批、国家专项计划本科批、地方专项计划本科批；

    浙江限定普通类提前批、平行录取一段、平行录取二段、平行录取三段

4.最高分、最低分、平均分：仅能填写数字（最多保留2位小数），且三者顺序不能改变，最低分为必填项，其中艺术类和体育类分数为文化课分数

5.最低分位次：仅能填写数字

6.录取人数：仅能填写数字

7.首选科目：新八省必填，只能填写（历史或物理）`;

type InputRow = Record<string, unknown> & {
  __templateType: NormalCollegeScoreInputTemplateType;
  __rowNo: number;
  __highestScore: number | null;
  __lowestScore: number | null;
  __avgScore: number | null;
  __lowestRank: number | null;
  __enrollCount: number | null;
  __admitCount: number | null;
  __normalizedFirstSubject: string;
};

function t(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function cleanTextCode(value: unknown): string {
  return t(value).replace(/[\^＾]/g, "");
}

function isTibetProvince(value: unknown): boolean {
  const text = t(value);
  return text === "西藏" || text === "西藏自治区";
}

function toNumber(value: unknown): number | null {
  const text = t(value).replace(/,/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isNaN(n) ? null : n;
}

function pickText(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = t(row[key]);
    if (value) return value;
  }
  return "";
}

function pickNumber(
  row: Record<string, unknown>,
  keys: string[],
): number | null {
  for (const key of keys) {
    const value = toNumber(row[key]);
    if (value !== null) return value;
  }
  return null;
}

function normalizeFirstSubject(value: unknown): string {
  const text = t(value);
  if (text === "物") return "物理";
  if (text === "历") return "历史";
  if (text === "物理") return "物理";
  if (text === "历史") return "历史";
  return text;
}

function normalizeFirstSubjectFromCategory(value: unknown): string {
  const text = t(value);
  if (text === "物理类") return "物理";
  if (text === "历史类") return "历史";
  return "";
}

function getCellText(sheet: XLSX.WorkSheet, address: string): string {
  const cell = sheet[address];
  if (!cell) return "";
  if ("w" in cell && cell.w) return String(cell.w).trim();
  return t(cell.v);
}

function readHeaders(sheet: XLSX.WorkSheet, headerRowIndex: number): string[] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const headerRow = aoa[headerRowIndex] || [];
  return headerRow.map((item) => t(item)).filter(Boolean);
}

function buildGroupKey(row: InputRow): string {
  const isLibrary = row.__templateType === "libraryMajorScore";

  const schoolName = isLibrary ? t(row["学校"]) : t(row["学校名称"]);
  const province = t(row["省份"]);
  const level = isLibrary ? t(row["层次"]) : t(row["一级层次"]);
  const category = isLibrary ? t(row["科类"]) : t(row["招生科类"]);
  const batch = isLibrary ? t(row["批次"]) : t(row["招生批次"]);
  const enrollmentType = isLibrary
    ? t(row["招生类型"])
    : t(row["招生类型（选填）"]);
  const groupCode = cleanTextCode(row["专业组代码"]);
  const recruitCode = cleanTextCode(row["招生代码"]);

  return [
    schoolName,
    province,
    level,
    category,
    batch,
    enrollmentType,
    groupCode,
    recruitCode,
  ].join("||");
}

function maxNullable(values: Array<number | null>): number | null {
  const valid = values.filter((item): item is number => item !== null);
  if (!valid.length) return null;
  return Math.max(...valid);
}

function sumNullable(values: Array<number | null>): number | null {
  const valid = values.filter((item): item is number => item !== null);
  if (!valid.length) return null;
  return valid.reduce((sum, item) => sum + item, 0);
}

function processRows(
  rows: Record<string, unknown>[],
  templateType: NormalCollegeScoreInputTemplateType,
  yearValue?: string | number,
  ruleCenterOptions: {
    validSchoolNames?: string[];
    validMajorCombos?: string[];
  } = {},
): NormalCollegeScoreOutputRow[] {
  const normalizedRows: InputRow[] = rows
    .map((row, rowNo) => {
      const isLibrary = templateType === "libraryMajorScore";

      return {
        ...row,
        __templateType: templateType,
        __rowNo: rowNo,
        __highestScore: pickNumber(row, ["最高分"]),
        __lowestScore: pickNumber(row, ["最低分"]),
        __avgScore: null,
        __lowestRank: pickNumber(
          row,
          isLibrary ? ["最低分位次"] : ["最低分位次（选填）"],
        ),
        __enrollCount: pickNumber(
          row,
          isLibrary ? ["招生人数"] : ["招生人数（选填）"],
        ),
        __admitCount: pickNumber(
          row,
          isLibrary ? ["录取人数"] : ["录取人数（选填）"],
        ),
        __normalizedFirstSubject: isLibrary
          ? normalizeFirstSubjectFromCategory(row["科类"])
          : normalizeFirstSubjectFromCategory(row["招生科类"]) ||
          normalizeFirstSubject(row["首选科目"]),
      };
    })
    .filter((row) => row.__lowestScore !== null);

  const grouped = new Map<string, InputRow[]>();

  normalizedRows.forEach((row) => {
    const key = buildGroupKey(row);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(row);
  });

  const output: Array<NormalCollegeScoreOutputRow & { __sortNo: number }> = [];

  for (const [, groupRows] of grouped) {
    const sorted = [...groupRows].sort((a, b) => {
      const aScore = a.__lowestScore ?? Number.POSITIVE_INFINITY;
      const bScore = b.__lowestScore ?? Number.POSITIVE_INFINITY;
      if (aScore !== bScore) return aScore - bScore;
      return a.__rowNo - b.__rowNo;
    });

    const representative = sorted[0];
    const isLibrary = representative.__templateType === "libraryMajorScore";

    const year = t(
      representative["年份"] ||
        representative["招生年"] ||
        representative["招生年份"] ||
        yearValue,
    );

    const province = t(representative["省份"]);

    const schoolName = isLibrary
      ? t(representative["学校"])
      : t(representative["学校名称"]);

    const level = isLibrary
      ? t(representative["层次"])
      : t(representative["一级层次"]);

    const enrollmentCategory = isLibrary
      ? t(representative["科类"])
      : t(
          representative["招生类别"] ||
            representative["招生科类"] ||
            representative["科类"],
        );

    const enrollmentBatch = isLibrary
      ? t(representative["批次"])
      : t(representative["招生批次"] || representative["批次"]);

    const enrollmentType = isLibrary
      ? t(representative["招生类型"])
      : t(representative["招生类型（选填）"]);

    const dataSource = t(representative["数据来源"]);
    const groupCode = isLibrary
      ? cleanTextCode(representative["专业组代码"])
      : t(representative["专业组代码"]);
    const recruitCode = isLibrary
      ? cleanTextCode(representative["招生代码"])
      : t(representative["招生代码"]);

    const controlLine = resolveControlLine(
      province,
      enrollmentCategory,
      enrollmentBatch,
      year,
    );

    const isTibet = isTibetProvince(province);
    const schoolValidation = validateSchoolAndMajorComboDetailed({
      validSchoolNames: ruleCenterOptions.validSchoolNames,
      schoolName,
    });
    const majorValidations = groupRows.map((item) =>
      validateSchoolAndMajorComboDetailed({
        validMajorCombos: ruleCenterOptions.validMajorCombos,
        majorName:
          item.__templateType === "libraryMajorScore"
            ? item["专业"]
            : item["招生专业"],
        level:
          item.__templateType === "libraryMajorScore"
            ? item["层次"]
            : item["一级层次"],
      }),
    );
    const majorResult =
      (ruleCenterOptions.validMajorCombos || []).length === 0
        ? "未启用专业规则"
        : majorValidations.some((item) => item.majorResult !== "匹配")
          ? "未匹配"
          : "匹配";
    const ruleCenterIssues = Array.from(
      new Set([
        ...schoolValidation.issues,
        ...majorValidations.flatMap((item) => item.issues),
      ]),
    );

    output.push({
      学校名称: schoolName,
      省份: province,
      招生类别: enrollmentCategory,
      招生批次: enrollmentBatch,
      招生类型: enrollmentType,
      选测等级: "",
      最高分: maxNullable(groupRows.map((row) => row.__highestScore)),
      最低分: representative.__lowestScore,
      平均分: null,
      最高位次: null,
      最低位次: representative.__lowestRank,
      平均位次: null,
      录取人数: sumNullable(groupRows.map((row) => row.__admitCount)),
      招生人数: sumNullable(groupRows.map((row) => row.__enrollCount)),
      数据来源: dataSource,
      省控线科类: isTibet ? "" : controlLine.category,
      省控线批次: isTibet ? "" : controlLine.batch,
      省控线备注: "",
      专业组代码: groupCode,
      首选科目: representative.__normalizedFirstSubject,
      院校招生代码: recruitCode,
      层次: level,
      数据是否有问题: ruleCenterIssues.length ? "有问题" : "无问题",
      问题列表: ruleCenterIssues.length
        ? ruleCenterIssues.join("；")
        : "无问题",
      学校名称校验结果: schoolValidation.schoolResult,
      专业名称校验结果: majorResult,
      __sortNo: representative.__rowNo,
    });
  }

  return output
    .sort((a, b) => a.__sortNo - b.__sortNo)
    .map((item) => {
      const { __sortNo, ...rest } = item;
      void __sortNo;
      return rest;
    });
}

export function processNormalCollegeScoreRows({
  rows,
  detectedHeaders,
  yearFromB2 = "",
  templateType,
  ruleCenterOptions = {},
}: NormalCollegeScoreRowsInput): NormalCollegeScoreProcessResult {
  const isLibrary = templateType === "libraryMajorScore";
  const expectedColumns = isLibrary
    ? LIBRARY_MAJOR_SCORE_EXPECTED_COLUMNS
    : RAW_MAJOR_SCORE_EXPECTED_COLUMNS;
  const missingColumns = expectedColumns.filter(
    (col) => !detectedHeaders.includes(col),
  );

  if (missingColumns.length > 0) {
    return {
      templateType,
      templateName: NORMAL_COLLEGE_SCORE_TEMPLATE_LABELS[templateType],
      year: yearFromB2,
      inputRowCount: 0,
      outputRowCount: 0,
      rows: [],
      missingColumns,
      detectedHeaders,
    };
  }

  const year = isLibrary ? pickText(rows[0] || {}, ["年份"]) : yearFromB2;
  const outputRows = processRows(rows, templateType, year, ruleCenterOptions);

  return {
    templateType,
    templateName: NORMAL_COLLEGE_SCORE_TEMPLATE_LABELS[templateType],
    year,
    inputRowCount: rows.length,
    outputRowCount: outputRows.length,
    rows: outputRows,
    missingColumns,
    detectedHeaders,
  };
}

export function processNormalCollegeScoreWorkbook(
  workbook: XLSX.WorkBook,
  sheetName: string,
  templateType: NormalCollegeScoreInputTemplateType,
  ruleCenterOptions: {
    validSchoolNames?: string[];
    validMajorCombos?: string[];
  } = {},
): NormalCollegeScoreProcessResult {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("未找到所选 Sheet");
  }

  const isLibrary = templateType === "libraryMajorScore";
  const headerRowIndex = isLibrary ? 0 : 2;
  const dataRange = isLibrary ? 0 : 2;

  const detectedHeaders = readHeaders(sheet, headerRowIndex);
  const yearFromB2 = getCellText(sheet, "B2");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    range: dataRange,
    raw: false,
    defval: "",
  });

  return processNormalCollegeScoreRows({
    rows,
    detectedHeaders,
    yearFromB2,
    templateType,
    ruleCenterOptions,
  });
}

export async function exportNormalCollegeScoreWorkbook(
  result: NormalCollegeScoreProcessResult,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("院校分提取结果");

  ws.mergeCells("A1:U1");
  const noteCell = ws.getCell("A1");
  noteCell.value = TEMPLATE_NOTE;
  noteCell.font = { color: { argb: "FFFF0000" }, size: 11 };
  noteCell.alignment = {
    wrapText: true,
    vertical: "top",
    horizontal: "left",
  };
  ws.getRow(1).height = 350;

  ws.getCell("A2").value = "招生年";
  ws.getCell("B2").value = result.year;
  ws.getCell("C2").value = 1;
  ws.getCell("D2").value = "模板类型（模板标识不要更改）";

  OUTPUT_HEADERS.forEach((header, headerNo) => {
    const cell = ws.getCell(3, headerNo + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
    };
  });

  result.rows.forEach((row, rowNo) => {
    OUTPUT_HEADERS.forEach((header, colNo) => {
      const cell = ws.getCell(rowNo + 4, colNo + 1);
      const value = row[header];

      if (header === "专业组代码" || header === "院校招生代码") {
        cell.numFmt = "@";
        cell.value = String(value ?? "");
      } else {
        cell.value = value as string | number | null;
      }

      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
      };
    });
  });

  const widths: Record<string, number> = {
    A: 18,
    B: 10,
    C: 12,
    D: 14,
    E: 14,
    F: 10,
    G: 10,
    H: 10,
    I: 10,
    J: 10,
    K: 10,
    L: 10,
    M: 10,
    N: 10,
    O: 12,
    P: 12,
    Q: 12,
    R: 12,
    S: 14,
    T: 10,
    U: 14,
    V: 10,
    W: 16,
    X: 26,
    Y: 18,
    Z: 18,
  };

  Object.entries(widths).forEach(([col, width]) => {
    ws.getColumn(col).width = width;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
