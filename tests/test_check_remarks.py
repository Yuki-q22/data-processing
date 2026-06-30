from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from openpyxl import Workbook, load_workbook

from check_remarks import process_excel, process_remark


class ProcessRemarkTests(unittest.TestCase):
    def test_typo_is_labeled_and_fixed(self) -> None:
        result = process_remark("详见院校招生张程")
        self.assertIn("疑似错字：详见院校招生张程 → 详见院校招生章程", result["issues"])
        self.assertEqual(result["fixed"], "详见院校招生章程")

    def test_ocr_typos_are_labeled_and_fixed(self) -> None:
        result = process_remark("不招色育，项目选拔进人，详贝院校招生章程")
        self.assertIn("疑似错字：色育 → 色盲", result["issues"])
        self.assertIn("疑似错字：进人 → 进入", result["issues"])
        self.assertIn("疑似错字：详贝院校招生章程 → 详见院校招生章程", result["issues"])
        self.assertEqual(result["fixed"], "不招色盲，项目选拔进入，详见院校招生章程")

    def test_more_ocr_typos_are_labeled_and_fixed(self) -> None:
        result = process_remark(
            "只召英语语仲考牛，身体建康，成绩台格，国家专顷计划，学贵310000元"
        )
        self.assertIn("疑似错字：只召 → 只招", result["issues"])
        self.assertIn("疑似错字：语仲 → 语种", result["issues"])
        self.assertIn("疑似错字：考牛 → 考生", result["issues"])
        self.assertIn("疑似错字：身体建康 → 身体健康", result["issues"])
        self.assertIn("疑似错字：成绩台格 → 成绩合格", result["issues"])
        self.assertIn("疑似错字：国家专顷计划 → 国家专项计划", result["issues"])
        self.assertIn("疑似错字：学贵 → 学费", result["issues"])
        self.assertIn("学费金额疑似异常：310000元超过30万元", result["issues"])
        self.assertEqual(
            result["fixed"],
            "只招英语语种考生，身体健康，成绩合格，国家专项计划，学费310000元",
        )

    def test_low_confidence_ocr_typos_are_only_labeled(self) -> None:
        result = process_remark("只招英语老生，慎填")
        self.assertIn("疑似 OCR 错字：老生 可能为 考生，请人工检查", result["issues"])
        self.assertIn("疑似 OCR 错字：慎填 可能为 慎报，请人工检查", result["issues"])
        self.assertEqual(result["fixed"], "")

    def test_delimited_duplicate_is_removed(self) -> None:
        result = process_remark("不招色盲；不招色盲；详见招生章程")
        self.assertIn("重复内容：不招色盲", result["issues"])
        self.assertEqual(result["fixed"], "不招色盲；详见招生章程")

    def test_sentence_duplicate_keeps_one_terminal_mark(self) -> None:
        result = process_remark("不招色盲。不招色盲。")
        self.assertEqual(result["fixed"], "不招色盲。")

    def test_continuous_duplicate_is_removed(self) -> None:
        result = process_remark("详见详见招生章程")
        self.assertIn("疑似连续重复：详见", result["issues"])
        self.assertEqual(result["fixed"], "详见招生章程")

    def test_adjacent_duplicate_bracket_content_is_labeled_and_removed(self) -> None:
        result = process_remark("（师范类）（师范类）")
        self.assertEqual(result["issues"], "重复括号内容：师范类")
        self.assertEqual(result["fixed"], "（师范类）")

    def test_non_adjacent_duplicate_bracket_content_is_only_labeled(self) -> None:
        result = process_remark("（海曙校区）（第一学年）（海曙校区）")
        self.assertEqual(result["issues"], "重复括号内容：海曙校区")
        self.assertEqual(result["fixed"], "")

    def test_empty_nested_and_short_brackets_are_checked(self) -> None:
        empty = process_remark("（）详见招生章程")
        self.assertEqual(empty["issues"], "存在空括号")
        self.assertEqual(empty["fixed"], "详见招生章程")

        nested = process_remark("（（师范类））")
        self.assertEqual(nested["issues"], "存在嵌套括号：已去除重复外层括号")
        self.assertEqual(nested["fixed"], "（师范类）")

        short = process_remark("（男）只招")
        self.assertEqual(short["issues"], "括号内容过短：男，请人工检查")
        self.assertEqual(short["fixed"], "")

    def test_major_list_parentheses_are_not_marked_as_duplicate_or_nested(self) -> None:
        normal = process_remark(
            "（只承认教育部规定的全国性加分政策）（包含专业：教育学、融合教育（非公费师范）、特殊教育（非公费师范））"
        )
        self.assertEqual(normal["issues"], "")
        self.assertEqual(normal["fixed"], "")

        ai = process_remark(
            "（管理与经济方向）（认同并执行四川省少数民族地区加分项目和分值）（包含专业：工商管理（含数字创新管理方向）、工商管理（含AI双学位）、经济学、国际经济与贸易、经济学（含AI双学位））"
        )
        self.assertEqual(ai["issues"], "")
        self.assertEqual(ai["fixed"], "")

    def test_height_and_weight_abnormal_values_are_only_labeled(self) -> None:
        result = process_remark("身高不低于80cm，体重不超过500kg")
        self.assertIn("身高数值疑似异常：80cm", result["issues"])
        self.assertIn("体重数值疑似异常：500kg", result["issues"])
        self.assertEqual(result["fixed"], "")

        unit = process_remark("身高不低于170kg，体重不超过170cm")
        self.assertIn("身高单位疑似错误：170kg", unit["issues"])
        self.assertIn("体重单位疑似错误：170cm", unit["issues"])
        self.assertEqual(unit["fixed"], "")

    def test_tuition_abnormal_values_are_only_labeled(self) -> None:
        normal = process_remark("学费300000元")
        self.assertEqual(normal["issues"], "")
        self.assertEqual(normal["fixed"], "")

        yuan = process_remark("学费300001元")
        self.assertEqual(yuan["issues"], "学费金额疑似异常：300001元超过30万元")
        self.assertEqual(yuan["fixed"], "")

        ten_thousand = process_remark("学费31万元")
        self.assertEqual(ten_thousand["issues"], "学费金额疑似异常：31万元超过30万元")
        self.assertEqual(ten_thousand["fixed"], "")

    def test_format_cleanup_preserves_meaning(self) -> None:
        result = process_remark("不招 色盲;详见招生章程。。\n不招色弱；；")
        self.assertIn("存在多余空格", result["issues"])
        self.assertIn("英文标点已统一为中文标点", result["issues"])
        self.assertIn("存在连续标点", result["issues"])
        self.assertIn("存在多余标点符号", result["issues"])
        self.assertEqual(result["fixed"], "不招色盲；详见招生章程。不招色弱")

    def test_uncertain_issues_are_not_force_fixed(self) -> None:
        bracket = process_remark("只招英语考生（口试成绩合格")
        self.assertEqual(bracket["issues"], "括号疑似不成对，请人工检查")
        self.assertEqual(bracket["fixed"], "")

        abnormal = process_remark("学费□元")
        self.assertEqual(abnormal["issues"], "存在疑似异常字符：□")
        self.assertEqual(abnormal["fixed"], "")

    def test_empty_and_invalid_values_are_ignored(self) -> None:
        for value in (None, "", "nan", "None", "无", "暂无", "-", "/"):
            self.assertEqual(process_remark(value), {"issues": "", "fixed": ""})


class ProcessExcelTests(unittest.TestCase):
    def test_workbook_is_copied_and_result_cells_are_highlighted(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            input_path = Path(temp_dir) / "招生计划.xlsx"
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "计划"
            sheet.append(["专业", "备注"])
            sheet.append(["计算机", "不招色盲。不招色盲。"])
            sheet.append(["英语", "只招英语语种考生"])
            workbook.create_sheet("说明")["A1"] = "原工作表应保留"
            workbook.save(input_path)

            output_path = process_excel(input_path)
            self.assertTrue(input_path.exists())
            self.assertTrue(output_path.exists())
            self.assertNotEqual(input_path, output_path)

            result_book = load_workbook(output_path)
            self.assertEqual(result_book.sheetnames, ["计划", "说明"])
            result_sheet = result_book["计划"]
            self.assertEqual(result_sheet["C1"].value, "备注问题标注")
            self.assertEqual(result_sheet["D1"].value, "修改后备注")
            self.assertEqual(result_sheet["D2"].value, "不招色盲。")
            self.assertEqual(result_sheet["C2"].fill.fgColor.rgb, "00FFF2CC")
            self.assertIsNone(result_sheet["C3"].value)
            self.assertIsNone(result_sheet["D3"].value)


if __name__ == "__main__":
    unittest.main()
