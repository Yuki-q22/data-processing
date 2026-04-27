# 数据处理工具平台

一个基于 **Vite + React + TypeScript** 的招生数据处理工具集。项目主要用于招生计划、专业分、院校分、学业桥数据、一分一段表、专业组代码、就业质量报告图片等数据的清洗、匹配、校验和导出。

当前项目为前端单页应用，Excel 解析、规则匹配、预览和导出主要在浏览器端完成；规则中心使用 Firebase Authentication + Realtime Database 做账号登录、管理员权限和规则云端同步。

---

## 主要功能

### 1. 规则中心

规则中心用于维护全局规则，供其他工具调用。

支持内容：

- 学校名称规则：用于校验、匹配学校名称。
- 专业名称规则：用于校验、匹配招生专业。
- 备注招生类型规则：根据备注关键词提取招生类型。
- 需要核查关键词：如“除了、不含、除外、没有、除”等，用于给备注提取结果打核查标记。
- Firebase 云端实时同步：登录后读取规则，管理员账号可新增、修改、删除、导入规则。

规则导入文件要求：

| 规则类型 | Excel 必需字段 |
|---|---|
| 学校名称规则 | `学校名称` |
| 专业名称规则 | `招生专业` |
| 备注招生类型规则 | `备注查找字段`、`输出招生类型`，可选 `优先级` |

管理员权限判断节点：

```text
admins/{uid} = true
```

其中 `{uid}` 是 Firebase Authentication 中对应用户的 UID。

---

### 2. 专业分模板智能填充

入口：左侧菜单 `专业分模板智能填充`。

处理流程分为 6 步：

1. **文件上传**
   - 上传原始专业分数据。
   - 上传招生计划数据。
   - 设置任务名称、招生年份、默认数据来源。
   - 如果原始专业分文件没有学校名称，可在“学校名称（选填）”里手动填写，后续会作为学校名称兜底值。
2. **字段映射**
   - 自动按字段别名匹配源字段和目标字段。
   - 支持手动调整字段映射。
   - 支持忽略不需要的字段。
   - 点击“应用当前映射”后重新生成处理结果。
3. **规则查看**
   - 查看省份标准化、科类标准化、批次标准化、现行批次表等规则。
4. **处理预览**
   - 展示匹配后的年份、学校、省份、科类、批次、招生类型、专业、分数、位次和匹配状态。
   - 统计总记录数、已匹配数、警告数、错误数。
5. **异常处理**
   - 展示未匹配、多候选、科类待确认、分数异常、批次异常等记录。
   - 对匹配到多条招生计划的记录，可人工指定招生计划。
6. **导出结果**
   - 仅导出通过校验的数据。
   - 有 `error` 级别问题的数据会被拦截，不进入导出文件。

核心匹配逻辑：

- 优先使用学校、省份、专业、科类、层次、招生类型、批次做精确匹配。
- 批次缺失时，会尝试忽略批次匹配，并结合省份现行批次表选择更合理的招生计划记录。
- 对学校、专业等字段存在空格、括号差异时，会尝试清洗后匹配。
- 专业名称中的括号内容会拆分到专业备注。
- 招生计划中的 `专业组选科要求` 和 `专业选科要求(新高考专业省份)` 会合并后转换为模板中的选科字段。
- 原始科类为 `物理类 / 历史类 / 文科 / 理科 / 综合` 等内容时，会自动推导招生科类和首选科目。

原始专业分上传页关键字段校验：

```text
学校名称、省份、招生科类、招生专业、最低分
```

招生计划上传页关键字段校验：

```text
年份、省份、学校、科类、批次、招生类型、专业、层次、方向、备注、招生人数、招生代码、专业代码、专业组代码、专业组选科要求、专业选科要求(新高考专业省份)、数据来源
```

说明：上传页的字段完整性检查用于提示风险；如果源表字段名称不标准，可以在“字段映射”步骤手动指定目标字段。

---

### 3. 院校分提取（普通类）

入口：左侧菜单 `院校分提取（普通类）`。

用途：从专业分模板中提取院校分模板数据。

处理规则：

- 从 `B2` 读取年份。
- 从第 3 行读取表头。
- 校验普通类专业分模板固定字段。
- 按学校、省份、科类、批次、招生类型、专业组代码、招生代码等字段分组。
- 组内取最低分代表行。
- 组内最高分取最大值。
- 招生人数、录取人数按组求和。
- 导出为院校分模板字段。

输出文件名：

```text
院校分提取结果_普通类.xlsx
```

---

### 4. 院校分提取（艺体类）

入口：左侧菜单 `院校分提取（艺体类）`。

用途：从艺体类专业分模板中提取院校分模板数据。

处理规则：

- 从 `B2` 读取年份。
- 从第 3 行读取表头。
- 校验艺体类模板固定字段。
- 按学校、省份、招生类别、招生批次、专业类别、招生代码、专业组、备注、是否校考等字段分组。
- 取分组内最低分代表行。
- 输出投档分、位次、专业组、是否校考等字段。

输出文件名：

```text
院校分提取结果_艺体类.xlsx
```

---

### 5. 学业桥专业分处理

入口：左侧菜单 `学业桥专业分处理`。

用途：将学业桥原始数据转换为专业分模板格式，并对学校名称、专业备注、科类、选科要求等字段做标准化。

输入文件必需字段：

```text
数据类型、年份、省份、批次、科类、院校名称、院校原始名称、招生代码、专业组编号、专业代码、招生类型、专业名称、报考要求、专业备注、招生计划人数、最低分、最低位次、最高分、平均分、录取人数
```

主要处理：

- 学校名称使用规则中心的学校规则做匹配校验。
- `物理 / 物理类` 转为 `物理类`，首选科目写入 `物`。
- `历史 / 历史类` 转为 `历史类`，首选科目写入 `历`。
- 根据批次和学校名称推导一级层次。
- 根据省份、招生代码、专业组编号生成专业组代码。
- 对报考要求解析为选科要求和次选科目。
- 对专业备注进行括号修复、错字修正、空括号删除、重复括号内容去重、标点压缩等处理。
- 输出“数据是否有问题”“问题列表”“修改后的备注”三个辅助检查字段。

---

### 6. 一分一段校验

入口：左侧菜单 `一分一段校验`。

用途：对一分一段 Excel 文件做基础校验和补断点处理。

处理规则：

- 校验 `B2` 年份是否为 `2025`。
- 根据省份给第一个分数补后缀：
  - 上海：`-660`
  - 海南：`-900`
  - 其他省份：`-750`
- 检查分数是否连续。
- 分数断档时自动插入补断点行，并用黄色标记。
- 自动补充人数列。
- 写入累计人数校验结果和分数校验结果。

输出文件名会在原文件名后追加：

```text
_校验结果.xlsx
```

---

### 7. 专业组代码匹配

入口：左侧菜单 `专业组代码匹配`。

用途：用招生计划模板为专业分导入模板补充专业组代码，并在需要时转换选科要求。

输入：

- 专业分导入模板。
- 招生计划模板。

读取规则：

- 专业分导入模板从第 3 行之后读取数据。
- 招生计划模板从第 1 行读取数据。
- 年份优先从专业分导入模板 `B2` 获取，也可在页面中调整。

处理状态：

| 状态 | 含义 |
|---|---|
| 原有代码 | 导入模板中已有专业组代码 |
| 自动匹配 | 找到唯一候选并自动补充 |
| 待手动补充 | 重复、候选缺失、候选异常，需要人工处理 |
| 已手动补充 | 已通过页面抽屉人工指定 |
| 未匹配到候选 | 招生计划中没有找到对应组合 |

支持功能：

- 按省份筛选。
- 只看待人工处理记录。
- 人工选择候选招生计划。
- 人工填写专业组代码、选科要求、次选科目。
- 导出补充后的专业分模板。

---

### 8. 招生计划数据比对

入口：左侧菜单 `招生计划数据比对`。

用途：检查招生计划中的记录是否已经存在于专业分文件或院校分文件中，并可导出缺失记录模板。

输入：

- 招生计划文件：必传。
- 专业分文件：可选。
- 院校分文件：可选。

比对结果：

- 招生计划 vs 专业分：生成专业分缺失记录。
- 招生计划 vs 院校分：生成院校分缺失记录。
- 支持按省份、匹配状态、招生代码缺失状态筛选。
- 可分别导出专业分模板和院校分模板。

---

### 9. 就业质量报告图片提取

入口：左侧菜单 `就业质量报告图片提取`。

用途：输入就业质量报告网页链接，提取页面中的静态图片，预览后合成为 PDF 下载。

说明：

- 仅提取 HTML 中静态 `<img src="...">` 图片。
- 浏览器端会受到跨域限制，部分网站可能无法抓取。
- 静态公开页面成功率更高。

输出文件名：

```text
就业质量报告.pdf
```

---

### 10. 备注招生类型提取

入口：左侧菜单 `备注招生类型提取`。

用途：按规则中心中的“备注招生类型规则”和“需要核查关键词”批量处理 Excel 中的备注列。

处理逻辑：

- 选择 Excel 文件和 Sheet。
- 选择备注字段。
- 按关键词和优先级提取招生类型。
- 备注中包含需要核查关键词时，标记 `需要核查 = 是`。
- 导出字段：`备注`、`招生类型`、`需要核查`。

输出文件名会在原文件名后追加：

```text
_备注提取结果.xlsx
```

---

## 技术栈

| 类型 | 技术 |
|---|---|
| 前端框架 | React 19 |
| 构建工具 | Vite 8 |
| 语言 | TypeScript 6 |
| UI 组件 | Ant Design 6 |
| 状态管理 | Zustand |
| Excel 读取 | xlsx |
| Excel 导出 | ExcelJS |
| PDF 生成 | jsPDF |
| 云端规则 | Firebase Authentication + Realtime Database |

---

## 项目结构

```text
data-processing/
├─ public/
│  ├─ favicon.svg
│  └─ icons.svg
├─ src/
│  ├─ App.tsx                         # 应用入口和左侧菜单
│  ├─ main.tsx                        # React 挂载入口
│  ├─ index.css                       # 全局样式
│  ├─ components/                     # 通用组件
│  │  ├─ FileUploadCard.tsx
│  │  └─ StatCards.tsx
│  ├─ constants/                      # 展示字段、目标模板字段
│  │  ├─ display.ts
│  │  └─ targetFields.ts
│  ├─ lib/
│  │  └─ firebase.ts                  # Firebase 初始化
│  ├─ modules/                        # 核心数据处理逻辑
│  │  ├─ collegeScoreNormal.ts
│  │  ├─ collegeScoreArt.ts
│  │  ├─ employmentReport.ts
│  │  ├─ groupCodeMatch.ts
│  │  ├─ match.ts
│  │  ├─ planCompare.ts
│  │  ├─ remarkTypeExtract.ts
│  │  ├─ segmentation.ts
│  │  ├─ standardize.ts
│  │  ├─ templateExport.ts
│  │  ├─ transform.ts
│  │  ├─ uploadValidation.ts
│  │  ├─ validate.ts
│  │  └─ xueyeqiao.ts
│  ├─ pages/                          # 页面组件
│  │  ├─ ProfessionalScorePlatform.tsx
│  │  ├─ RuleCenterPage.tsx
│  │  ├─ UploadStep.tsx
│  │  ├─ MappingStep.tsx
│  │  ├─ RuleStep.tsx
│  │  ├─ PreviewStep.tsx
│  │  ├─ ExceptionStep.tsx
│  │  ├─ ExportStep.tsx
│  │  └─ tools/
│  ├─ services/                       # Firebase 服务封装
│  ├─ stores/                         # Zustand 状态
│  ├─ types/                          # 类型定义
│  └─ utils/                          # Excel 和字段映射工具
├─ package.json
├─ vite.config.ts
└─ tsconfig.json
```

---

## 本地运行

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录新建 `.env.local`：

```env
VITE_FIREBASE_API_KEY=你的 Firebase API Key
VITE_FIREBASE_AUTH_DOMAIN=你的 Firebase Auth Domain
VITE_FIREBASE_DATABASE_URL=你的 Firebase Realtime Database URL
VITE_FIREBASE_PROJECT_ID=你的 Firebase Project ID
VITE_FIREBASE_APP_ID=你的 Firebase App ID
```

注意：`.env.local` 已被 `.gitignore` 忽略，不要提交到仓库。

### 3. 启动开发服务

```bash
npm run dev
```

启动后访问终端显示的本地地址，通常是：

```text
http://localhost:5173
```

---

## 构建和预览

### 构建生产包

```bash
npm run build
```

构建产物输出到：

```text
dist/
```

### 本地预览生产包

```bash
npm run preview
```

---

## 部署说明

这是一个静态前端项目，可以部署到 Cloudflare Pages、Vercel、Netlify 等静态托管平台。

### Cloudflare Pages 推荐配置

| 配置项 | 值 |
|---|---|
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | 项目根目录，通常为 `data-processing` |

需要在部署平台中配置与 `.env.local` 相同的环境变量：

```text
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

如果云端页面能打开但规则无法新增，优先检查：

1. Firebase 环境变量是否配置完整。
2. 当前账号是否已登录。
3. 当前账号 UID 是否在 Realtime Database 的 `admins/{uid}` 下配置为 `true`。
4. Firebase Realtime Database 安全规则是否允许管理员写入 `rule_center`。
5. Firebase 项目的 Authentication 是否启用了邮箱密码登录。

---

## Firebase 数据结构参考

项目中主要使用以下 Realtime Database 节点：

```text
admins/
  {uid}: true

rule_center/
  school_name/
    {ruleId}/
      rule_name
      source_text
      target_text
      enabled
      sort_order
      updated_at
      updated_by

  major_combo/
    {ruleId}/
      rule_name
      source_text
      target_text
      enabled
      sort_order
      updated_at
      updated_by

  remark_enrollment_type/
    {ruleId}/
      rule_name
      source_text
      target_text
      enabled
      sort_order
      updated_at
      updated_by

  exclusion_keywords/
    0: 除了
    1: 不含
    2: 除外

  meta/
    version
    updatedAt
```

示例安全规则可按实际权限再收紧：

```json
{
  "rules": {
    "admins": {
      ".read": "auth != null",
      ".write": false
    },
    "rule_center": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
    }
  }
}
```

添加管理员时，在 Firebase Realtime Database 中新增：

```json
{
  "admins": {
    "用户UID": true
  }
}
```

---

## 常用命令

```bash
# 启动开发环境
npm run dev

# 构建生产环境
npm run build

# 本地预览生产构建
npm run preview

# 代码检查
npm run lint
```

---

## 数据处理注意事项

1. **Excel 表头位置要符合对应工具要求**  
   不同工具读取表头的行不同，例如专业分智能填充默认读取第一行，院校分提取读取第 3 行，专业组代码匹配的专业分导入模板从第 3 行后读取数据。

2. **字段名不标准时优先去字段映射页调整**  
   专业分智能填充支持源字段和目标字段手动映射，不要求所有源文件字段名完全一致。

3. **学校名称缺失时使用手填兜底**  
   在专业分智能填充的上传页填写“学校名称（选填）”，可作为原始专业分和招生计划缺失学校字段时的补充值。

4. **导出前先处理异常记录**  
   `error` 级别问题不会导出；`warning` 级别问题建议人工确认后再导出。

5. **规则中心影响多个工具**  
   学校规则、备注招生类型规则、需要核查关键词会被多个页面复用。修改规则后，建议重新处理对应文件。

6. **浏览器端处理大文件可能较慢**  
   大体量 Excel 会占用较多内存，建议先拆分文件或只保留必要 Sheet。

---

## 已知限制

- 就业质量报告图片提取受浏览器跨域限制，无法保证所有网站都能抓取。
- 当前项目主要面向 Excel 模板化处理，不包含后端任务队列。
- 规则中心依赖 Firebase；如果 Firebase 配置缺失，页面仍可打开，但云端规则同步和管理员写入会失败。
- 上传的数据主要在浏览器内存中处理，刷新页面后需要重新上传文件。

---

## License

当前仓库未声明开源许可证。若需要对外发布，请补充 LICENSE 文件并明确使用范围。
