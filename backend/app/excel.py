from __future__ import annotations

from io import BytesIO
from typing import Any

from openpyxl import Workbook, load_workbook

HEADERS = ["ID", "模块", "标题", "类型", "优先级", "状态", "前置条件", "步骤", "预期"]


def export_testcases(cases: list[dict[str, Any]]) -> BytesIO:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "测试用例"
    sheet.append(HEADERS)
    for case in cases:
        sheet.append([
            case.get("id", ""),
            case.get("module", ""),
            case.get("title", ""),
            case.get("type", ""),
            case.get("priority", ""),
            case.get("status", ""),
            case.get("precondition", ""),
            "\n".join(case.get("steps", [])),
            case.get("expected", ""),
        ])
    for column, width in zip("ABCDEFGHI", [14, 14, 40, 10, 8, 10, 30, 40, 30]):
        sheet.column_dimensions[column].width = width
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer


def import_testcases(content: bytes) -> tuple[list[dict[str, Any]], list[str]]:
    try:
        workbook = load_workbook(BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:  # noqa: BLE001 - surfaced to the user as a validation error
        raise ValueError("无法读取 Excel 文件") from exc
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    if not rows:
        raise ValueError("Excel 为空")
    headers = [str(value).strip() if value is not None else "" for value in rows[0]]
    missing = [header for header in HEADERS if header not in headers]
    if missing:
        raise ValueError(f"缺少列：{', '.join(missing)}")
    index = {header: position for position, header in enumerate(headers) if header}
    items: list[dict[str, Any]] = []
    errors: list[str] = []
    for line_number, row in enumerate(rows[1:], start=2):
        if not any(value is not None and str(value).strip() for value in row):
            continue
        title = str(row[index["标题"]] or "").strip()
        if not title:
            errors.append(f"第 {line_number} 行缺少标题")
            continue
        priority = str(row[index["优先级"]] or "P1").strip()
        case_type = str(row[index["类型"]] or "正向").strip()
        status = str(row[index["状态"]] or "待评审").strip()
        items.append({
            "id": str(row[index["ID"]] or "").strip(),
            "module": str(row[index["模块"]] or "通用").strip(),
            "title": title,
            "type": case_type if case_type in {"正向", "边界", "异常", "安全"} else "正向",
            "priority": priority if priority in {"P0", "P1", "P2"} else "P1",
            "status": status,
            "precondition": str(row[index["前置条件"]] or "").strip(),
            "steps": [step.strip() for step in str(row[index["步骤"]] or "").splitlines() if step.strip()],
            "expected": str(row[index["预期"]] or "").strip(),
        })
    return items, errors
