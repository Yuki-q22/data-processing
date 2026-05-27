import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("../../outputs/fujian-segmentation-template/", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const headers = [
  "分数", "人数", "累计人数",
  "分数", "人数", "累计人数",
  "分数", "人数", "累计人数",
];

const sampleRows = [
  [688, 12, 58, 649, 100, 1921, 608, 296, 10196],
  [687, 5, 63, 648, 115, 2036, 607, 308, 10504],
  [686, 10, 73, 647, 123, 2159, 606, 339, 10843],
  [685, 17, 90, 646, 118, 2277, 605, 298, 11141],
  [684, 10, 100, 645, 135, 2412, 604, 320, 11461],
];

const verticalSampleRows = [
  [688, 12, 58],
  [687, 5, 63],
  [686, 10, 73],
  [685, 17, 90],
  [684, 10, 100],
  [683, 9, 109],
];

const workbook = Workbook.create();
const upload = workbook.worksheets.add("上传模板_福建三组");
const vertical = workbook.worksheets.add("备用模板_标准三列");
const example = workbook.worksheets.add("填写示例");
const notes = workbook.worksheets.add("使用说明");

upload.showGridLines = true;
upload.getRange("A1:I1").values = [headers];
upload.getRange("A1:I1").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
upload.getRange("A2:I160").format = {
  horizontalAlignment: "center",
  numberFormat: "0",
};
upload.getRange("A:I").format.columnWidthPx = 88;
upload.freezePanes.freezeRows(1);
upload.getRange("A1:I160").format.borders = {
  insideHorizontal: { style: "Continuous", color: "#D9E2F3" },
  insideVertical: { style: "Continuous", color: "#D9E2F3" },
  edgeTop: { style: "Continuous", color: "#9EADCC" },
  edgeBottom: { style: "Continuous", color: "#9EADCC" },
  edgeLeft: { style: "Continuous", color: "#9EADCC" },
  edgeRight: { style: "Continuous", color: "#9EADCC" },
};

vertical.getRange("A1:C1").values = [["分数", "人数", "累计人数"]];
vertical.getRange("A1:C1").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
vertical.getRange("A2:C500").format = {
  horizontalAlignment: "center",
  numberFormat: "0",
};
vertical.getRange("A:C").format.columnWidthPx = 96;
vertical.freezePanes.freezeRows(1);

example.getRange("A1:I1").values = [headers];
example.getRange("A2:I6").values = sampleRows;
example.getRange("A1:I1").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
};
example.getRange("A2:I6").format = {
  horizontalAlignment: "center",
  numberFormat: "0",
};
example.getRange("A:I").format.columnWidthPx = 88;
example.freezePanes.freezeRows(1);

vertical.getRange("E1:G1").values = [["标准三列示例", null, null]];
vertical.getRange("E2:G7").values = verticalSampleRows;
vertical.getRange("E1:G1").format = {
  fill: "#E2F0D9",
  font: { bold: true, color: "#375623" },
};
vertical.getRange("E:G").format.columnWidthPx = 96;

notes.getRange("A1:E1").values = [["福建一分一段录入方法", null, null, null, null]];
notes.getRange("A1:E1").merge();
notes.getRange("A1:E1").format = {
  fill: "#1F4E79",
  font: { bold: true, color: "#FFFFFF", size: 14 },
};
notes.getRange("A3:E12").values = [
  ["推荐方法", "使用第一张“上传模板_福建三组”。第一行保留三组表头：分数、人数、累计人数。", null, null, null],
  ["录入顺序", "按图片从左到右录三组数据；下一页继续接在上一页下面，不要插入页码、标题、空白说明。", null, null, null],
  ["空白处理", "某一页第三组行数较少时，后面空着即可；不要写“无”“略”等文字。", null, null, null],
  ["特殊分数", "“100分以下”录为“100分以下”；“100分及以下”录为“100分及以下”，工具会分别转为 0-99、0-100。", null, null, null],
  ["备用方法", "如果横向录入仍有问题，可复制为第二张“备用模板_标准三列”的格式：每行只放一个分数。", null, null, null],
  ["上传要求", "上传时保留需要处理的工作表为第一张；推荐直接上传 PDF，其次使用这个 Excel 模板。", null, null, null],
  [null, null, null, null, null],
  ["标准三列字段", "分数", "人数", "累计人数", null],
  ["横向三组字段", "分数/人数/累计人数", "分数/人数/累计人数", "分数/人数/累计人数", null],
  ["不要出现", "合并单元格、页码、截图标题、说明文字混在上传表第一张数据区域内。", null, null, null],
];
notes.getRange("A3:A12").format = {
  fill: "#E2F0D9",
  font: { bold: true, color: "#375623" },
};
notes.getRange("A:E").format.columnWidthPx = 130;
notes.getRange("B:B").format.columnWidthPx = 720;
notes.getRange("A3:E12").format.wrapText = true;

const inspect = await workbook.inspect({
  kind: "table",
  range: "上传模板_福建三组!A1:I8",
  include: "values",
  tableMaxRows: 8,
  tableMaxCols: 9,
});
console.log(inspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 50 },
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "上传模板_福建三组",
  range: "A1:I20",
  scale: 1,
  format: "png",
});
await fs.writeFile(new URL("preview.png", outputDir), new Uint8Array(await preview.arrayBuffer()));

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(fileURLToPath(new URL("福建一分一段录入模板.xlsx", outputDir)));
