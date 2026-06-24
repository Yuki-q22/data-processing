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

    def test_delimited_duplicate_is_removed(self) -> None:
        result = process_remark("不招色盲；不招色盲；详见招生章程")
        self.assertIn("重复内容：不招色盲", result["issues"])
        self.assertEqual(result["fixed"], "不招色盲；详见招生章程")

    def test_sentence_duplicate_keeps_one_terminal_mark(self) -> None:
        result = process_remark("不招色盲。不招色盲。")
        self.assertEqual(result["fixed"], "不招色盲。")

    def test_trailing_duplicate_does_not_leave_separator(self) -> None:
        result = process_remark("身体健康；不招色盲；不招色盲")
        self.assertEqual(result["fixed"], "身体健康；不招色盲")

    def test_continuous_duplicate_is_removed(self) -> None:
        result = process_remark("详见详见招生章程")
        self.assertIn("疑似连续重复：详见", result["issues"])
        self.assertEqual(result["fixed"], "详见招生章程")

    def test_adjacent_duplicate_bracket_content_is_labeled_and_removed(self) -> None:
        result = process_remark("（海曙校区）（海曙校区）")
        self.assertEqual(result["issues"], "重复括号内容：海曙校区")
        self.assertEqual(result["fixed"], "（海曙校区）")

    def test_non_adjacent_duplicate_bracket_content_is_only_labeled(self) -> None:
        result = process_remark("（海曙校区）（第一学年）（海曙校区）")
        self.assertEqual(result["issues"], "重复括号内容：海曙校区")
        self.assertEqual(result["fixed"], "")

    def test_format_cleanup_preserves_meaning(self) -> None:
        result = process_remark("不招 色盲;详见招生章程。。\n不招色弱；；")
        self.assertIn("存在多余空格", result["issues"])
        self.assertIn("英文标点已统一为中文标点", result["issues"])
        self.assertIn("存在连续标点", result["issues"])
        self.assertEqual(result["fixed"], "不招色盲；详见招生章程。不招色弱；")

    def test_uncertain_issues_are_not_force_fixed(self) -> None:
        bracket = process_remark("只招英语考生（口试成绩合格")
        self.assertEqual(bracket["issues"], "括号疑似不成对，请人工检查")
        self.assertEqual(bracket["fixed"], "")

        abnormal = process_remark("学费□元")
        self.assertEqual(abnormal["issues"], "存在疑似异常字符：□")
        self.assertEqual(abnormal["fixed"], "")

        question_marks = process_remark("学费？？")
        self.assertEqual(question_marks["issues"], "存在疑似异常字符：？")
        self.assertEqual(question_marks["fixed"], "")

    def test_empty_and_invalid_values_are_ignored(self) -> None:
        for value in (None, "", "nan", "None", "无", "暂无", "-", "/"):
            self.assertEqual(process_remark(value), {"issues": "", "fixed": ""})

    def test_whitelist_content_is_not_misreported(self) -> None:
        for value in ("中外合作办学", "只招英语语种考生", "色盲色弱不宜报考"):
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
