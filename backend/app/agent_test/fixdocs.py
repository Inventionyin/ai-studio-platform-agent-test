"""Generate the markdown fix-experience documents and README index."""
from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ..config import settings

INVALID_FILENAME_CHARS = re.compile(r'[\\/:*?"<>|]')


def slugify(value: str) -> str:
    cleaned = INVALID_FILENAME_CHARS.sub("", value or "")
    cleaned = re.sub(r"\s+", "-", cleaned.strip())
    cleaned = re.sub(r"-{2,}", "-", cleaned)
    return (cleaned.strip("-") or "fix")[:60].strip("-") or "fix"


def document_filename(slug: str) -> str:
    return f"v1.0---{slugify(slug)}-fix经验积累.md"


def _text(value: Any) -> str:
    if value is None or value == "":
        return "-"
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return str(value)


def _verdict_summary(value: Any) -> str:
    """Render a verdict object as rule/llm/human summary instead of a Python dict dump."""
    if not isinstance(value, dict):
        return _text(value)
    parts = []
    for key in ("rule", "llm", "human"):
        item = value.get(key)
        if isinstance(item, dict) and item.get("verdict"):
            parts.append(f"{key}={item['verdict']}")
    final = value.get("verdict")
    if final:
        parts.append(f"final={final}")
    return ", ".join(parts) if parts else _text(value)


def _span_order(span: dict[str, Any]) -> tuple[int, int, str]:
    """Order multi-turn spans as command → SSE → inner trace → final."""
    name = str(span.get("name") or "")
    span_type = str(span.get("span_type") or "")
    match = re.search(r"第 (\d+) 轮", name)
    if span_type in {"final", "judge"}:
        turn = 999
    elif match:
        turn = int(match.group(1))
    else:
        turn = 100
    priorities = {
        "command": 0, "sse": 1, "agent": 2, "llm": 3,
        "tool": 4, "retrieval": 5, "final": 6, "judge": 7,
    }
    return turn, priorities.get(span_type, 8), name


def _render_sections(
    fix: dict[str, Any],
    run: dict[str, Any] | None,
    spans: list[dict[str, Any]],
    before_run: dict[str, Any] | None,
    after_run: dict[str, Any] | None,
    level: str,
) -> str:
    run = run or {}
    spans = sorted(spans, key=_span_order)
    lines = [
        f"{level} 基本信息",
        "",
        f"- 文档版本：v1.0",
        f"- 修复记录：{_text(fix.get('id'))}",
        f"- 关联用例：{_text(fix.get('case_id'))}",
        f"- 被测目标：{_text(fix.get('target_id'))}",
        f"- 严重级别：{_text(fix.get('severity'))}",
        f"- 问题分类：{_text(fix.get('category'))}",
        f"- 修复对象：{_text(fix.get('fix_target'))}",
        f"- 当前状态：{_text(fix.get('status'))}",
        f"- 创建人：{_text(fix.get('created_by'))}",
        f"- 创建时间：{_text(fix.get('created_at'))}",
        "",
        f"{level} 问题现象",
        "",
        str(fix.get("symptom") or "暂无"),
        "",
        f"{level} 复现方式",
        "",
        f"- 用例命令：`{_text((run.get('input') or {}).get('command'))}`",
        f"- 修复前运行：{_text(fix.get('before_run_id'))}",
        f"- 修复后运行：{_text(fix.get('after_run_id'))}",
        f"- Trace ID：{_text(run.get('trace_id'))}",
        "",
        f"{level} 链路追踪",
        "",
    ]
    if spans:
        lines.extend(["| 序号 | 类型 | 名称 | 状态 | 耗时(ms) |", "|---|---|---|---|---|"])
        for index, span in enumerate(spans, start=1):
            lines.append(
                f"| {index} | {_text(span.get('span_type'))} | {_text(span.get('name'))} "
                f"| {_text(span.get('status'))} | {_text(span.get('latency_ms'))} |"
            )
    else:
        lines.append("暂无 Trace Span 数据。")
    lines.extend([
        "",
        f"{level} 根因分析",
        "",
        str(fix.get("root_cause") or "待补充"),
        "",
        f"{level} 修复方案",
        "",
        str(fix.get("fix_action") or "待补充"),
        "",
        "变更文件：",
        "",
    ])
    changed_files = fix.get("changed_files") or []
    if changed_files:
        lines.extend(f"- {_text(item)}" for item in changed_files)
    else:
        lines.append("- 待补充")
    if fix.get("ai_suggestion"):
        lines.extend(["", "AI 修复建议：", "", str(fix.get("ai_suggestion"))])
    lines.extend([
        "",
        f"{level} 回归验证",
        "",
        f"- 修复前状态：{_text((before_run or {}).get('status'))}",
        f"- 修复后状态：{_text((after_run or {}).get('status'))}",
        f"- 修复前判定：{_verdict_summary((before_run or {}).get('verdict'))}",
        f"- 修复后判定：{_verdict_summary((after_run or {}).get('verdict'))}",
        f"- 回归结论：{'通过' if (after_run or {}).get('status') == 'pass' else '未通过或待验证'}",
        "",
        f"{level} 经验总结",
        "",
        (
            f"该问题属于 {_text(fix.get('category'))} 类，修复对象为 {_text(fix.get('fix_target'))}。"
            "建议在同类 Agent 用例中保留对应规则检查，并持续监控相同意图与工具调用路径。"
        ),
        "",
        f"{level} 附件",
        "",
        f"- Trace ID：{_text(run.get('trace_id'))}",
        f"- 运行 ID：{_text(run.get('id'))}",
        f"- 文档路径：{_text(fix.get('doc_path'))}",
        "",
    ])
    return "\n".join(lines)


def _update_readme(directory: Path) -> None:
    files = sorted(
        directory.glob("v1.0---*.md"),
        key=lambda path: path.name,
    )
    lines = [
        "# Agent 修复经验积累",
        "",
        "| 文档 | 标题 | 修复轮次 | 更新时间 |",
        "|---|---|---|---|",
    ]
    for path in files:
        content = path.read_text(encoding="utf-8")
        title = next(
            (line[2:].strip() for line in content.splitlines() if line.startswith("# ")),
            path.stem,
        )
        rounds = content.count("## 修复轮次") + 1
        updated = datetime.fromtimestamp(path.stat().st_mtime, UTC).strftime("%Y-%m-%d %H:%M")
        lines.append(f"| [{path.name}]({path.name}) | {title} | {rounds} | {updated} |")
    (directory / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def generate_fix_document(
    fix: dict[str, Any],
    run: dict[str, Any] | None,
    spans: list[dict[str, Any]],
    before_run: dict[str, Any] | None = None,
    after_run: dict[str, Any] | None = None,
) -> str:
    """Create or append a fix-experience markdown document, returning its path."""
    directory = Path(settings.fix_doc_dir)
    directory.mkdir(parents=True, exist_ok=True)
    slug = slugify(str(fix.get("slug") or fix.get("title") or "fix"))
    path = directory / document_filename(slug)
    render_fix = {**fix, "doc_path": str(path)}
    if path.exists():
        existing = path.read_text(encoding="utf-8").rstrip()
        round_no = existing.count("## 修复轮次") + 2
        body = _render_sections(render_fix, run, spans, before_run, after_run, "###")
        text = f"{existing}\n\n## 修复轮次 {round_no}\n\n{body}"
    else:
        title = str(fix.get("title") or "未命名问题")
        body = _render_sections(render_fix, run, spans, before_run, after_run, "##")
        text = f"# v1.0 {title} 修复经验积累\n\n{body}"
    path.write_text(text, encoding="utf-8")
    _update_readme(directory)
    return str(path)
