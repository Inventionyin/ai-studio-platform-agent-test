#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from io import BytesIO
from pathlib import Path

import httpx
from openpyxl import Workbook

API_BASE = os.environ.get("AST_API_BASE", "http://127.0.0.1:8000/api/v1")
ADMIN_EMAIL = os.environ.get("AST_ADMIN_EMAIL", "zhangwei@corp.com")
ADMIN_PASSWORD = os.environ.get("AST_ADMIN_PASSWORD", "Admin@12345")
PROJECT_NAME = "物业小程序"
KB_NAME = "物业小程序知识库"

TEST_CASES = [
    ("登录与初始化", "未同意隐私协议不能发起微信登录", "异常", "P0", "首次打开应用", ["打开登录页", "不勾选隐私协议", "点击微信登录"], "登录被阻止并提示先同意协议"),
    ("登录与初始化", "微信 code 换取身份成功", "正向", "P0", "已同意协议且微信可用", ["点击微信登录", "服务端用 code 换取 openid"], "返回 access token，客户端不接触 AppSecret"),
    ("登录与初始化", "新用户创建物业组织与小区", "正向", "P0", "新用户已登录", ["进入初始化页", "选择创建物业", "填写物业和小区名称"], "创建成功并绑定默认作用域"),
    ("登录与初始化", "通过 6 位邀请码加入物业", "正向", "P0", "存在有效邀请码", ["进入加入物业页", "输入 6 位邀请码", "提交"], "加入成功并绑定服务端返回作用域"),
    ("登录与初始化", "多小区用户切换当前小区", "正向", "P0", "用户属于多个小区", ["打开工作区入口", "选择另一个小区"], "业务页只展示新小区数据"),
    ("楼栋与户号", "楼栋最终预览与指纹创建", "正向", "P0", "负责人已绑定小区", ["新建楼栋", "配置每层户数", "请求服务端预览", "确认创建"], "创建成功且结构、单元、楼层、房号与预览一致"),
    ("楼栋与户号", "预览指纹变化后拒绝静默创建", "异常", "P0", "已获取预览指纹", ["修改楼层规则", "使用旧指纹提交创建"], "服务端拒绝创建并提示重新预览"),
    ("楼栋与户号", "重复提交创建请求保持幂等", "异常", "P0", "已提交一次创建", ["用相同幂等键再次提交"], "只创建一栋楼，返回同一结果"),
    ("楼栋与户号", "户号网格展示业主与费用状态", "正向", "P0", "楼栋已有户号", ["进入楼栋详情", "查看单元 Tab 与户号网格"], "两列网格展示户号、业主建档和物业费状态"),
    ("楼栋与户号", "存在账单时禁止物理删除楼栋", "异常", "P0", "楼栋存在已发布账单", ["点击删除楼栋", "确认删除"], "服务端拒绝删除并说明存在业务关系"),
    ("楼栋与户号", "户号居住特征区分未登记与确认没有", "边界", "P1", "户号已创建", ["打开居住特征", "分别选择未登记和确认没有", "保存"], "两种状态可区分并正确持久化"),
    ("物业费与水电", "年度物业费批量生成与发布", "正向", "P0", "楼栋面积和费率已配置", ["选择年度与楼栋", "预检", "生成草稿", "批量发布"], "账单生成并发布，金额与预览一致"),
    ("物业费与水电", "人工登记已缴需要填写原因", "异常", "P0", "存在待缴账单", ["打开账单", "标记已缴", "不填原因提交"], "提交被拒绝，要求填写原因"),
    ("物业费与水电", "撤销缴费写入审计", "正向", "P0", "账单已标记已缴", ["撤销缴费", "填写原因", "确认"], "状态回退并产生审计记录"),
    ("物业费与水电", "水电本期读数小于上期被拒绝", "边界", "P0", "存在上月读数", ["录入更小的本期读数", "保存"], "整批拒绝并逐行提示"),
    ("物业费与水电", "水电草稿批量计算与发布", "正向", "P0", "已录入本期读数", ["预检计算", "批量计算", "预检发布", "批量发布"], "状态按 draft→calculated→issued 迁移"),
    ("物业费与水电", "同资产同月份重复账单被阻止", "异常", "P0", "已存在有效水电账单", ["再次生成同月账单"], "服务端阻止重复账单"),
    ("商铺与车位", "商铺台账按楼栋和状态筛选", "正向", "P1", "已有商铺数据", ["进入商铺列表", "选择楼栋和经营状态"], "列表只返回符合条件商铺"),
    ("商铺与车位", "商铺生命周期启停与归档", "正向", "P1", "商铺已创建", ["启用商铺", "停用商铺", "归档"], "状态正确流转并写审计"),
    ("商铺与车位", "车位规则生成与预览编号", "正向", "P1", "车位台账未创建", ["选择楼层分区", "预览车位", "确认创建"], "车位编号唯一且与预览一致"),
    ("商铺与车位", "车位布局按楼层分区展示", "正向", "P1", "车位已登记", ["打开车位布局", "切换楼层分区"], "每行 5 个车位并显示已登记/空位/欠费"),
    ("商铺与车位", "车位费批量预检与原子发布", "正向", "P0", "车位已启用", ["选择台账和账期", "预检", "确认发布"], "只发布草稿账单，范围变化时拒绝陈旧确认"),
    ("主体与车辆", "自然人支持多电话并按权限脱敏", "正向", "P1", "已创建自然人主体", ["新增多个联系电话", "默认查询详情"], "默认返回脱敏电话，授权后才返回完整值"),
    ("主体与车辆", "企业主体使用统一社会信用代码", "正向", "P1", "新增企业主体", ["填写企业名称和信用代码", "保存"], "企业主体创建成功且不能伪装为自然人"),
    ("主体与车辆", "车牌规范化后同租户唯一", "异常", "P1", "已有车辆绑定", ["输入同车牌不同分隔符", "再次绑定"], "规范化后识别为重复并返回稳定冲突"),
    ("统计与导出", "统计首屏四项 KPI", "正向", "P1", "小区有账单和户号", ["打开统计 Tab"], "展示总户数、住宅使用率、收缴率和到期欠费"),
    ("统计与导出", "收缴率分母为 0 显示暂不计算", "边界", "P1", "当前筛选无应收金额", ["筛选无数据范围"], "收缴率显示暂不计算，不出现除零"),
    ("统计与导出", "居住特征下钻不返回备注", "异常", "P1", "已登记居住特征备注", ["下钻到户号列表"], "结果不包含备注正文"),
    ("统计与导出", "异步导出 CSV/XLSX 并记录发起人", "正向", "P1", "已选择导出范围", ["提交导出任务", "等待完成", "下载文件"], "文件按权限脱敏，历史记录包含发起人和条件"),
    ("权限与群组", "负责人创建群组邀请码", "正向", "P0", "负责人具备 member.manage", ["进入群组页", "创建邀请码"], "生成 6 位邀请码且同一群组仅一条有效码"),
    ("权限与群组", "普通成员不能创建邀请码", "异常", "P0", "普通成员已登录", ["进入群组页"], "看不到创建入口，服务端返回 403"),
    ("权限与群组", "成员禁用后下一次请求立即失效", "异常", "P0", "成员在线", ["负责人禁用成员", "成员发起请求"], "请求返回未授权并要求重新登录"),
    ("权限与群组", "只读角色不能执行治理写入", "异常", "P0", "只读角色已绑定小区", ["调用新增账单接口"], "服务端返回 403"),
    ("权限与群组", "自定义角色受套餐权益约束", "异常", "P1", "基础版租户", ["尝试创建自定义角色"], "服务端拒绝并提示升级套餐"),
    ("数据导入与知识库", "双 Excel 模板预检与错误报告", "正向", "P0", "已下载规则和逐户模板", ["导入含错误行文件", "查看预检结果"], "错误按工作表/行/列返回且不写库"),
    ("数据导入与知识库", "确认后原子导入楼栋户号", "正向", "P0", "预检通过", ["确认导入"], "单一事务写入，重复确认幂等"),
]


def login(client: httpx.Client) -> str:
    response = client.post("/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    response.raise_for_status()
    token = response.json()["data"]["accessToken"]
    return token


def ensure_project(client: httpx.Client, headers: dict[str, str]) -> dict:
    projects = client.get("/projects", headers=headers).json()["data"]
    for project in projects:
        if project["name"] == PROJECT_NAME:
            return project
    response = client.post("/projects", headers=headers, json={"name": PROJECT_NAME, "description": "物业楼栋车位缴费小程序（源自本地项目）"})
    response.raise_for_status()
    return response.json()["data"]


def parse_prd(source: Path) -> list[tuple[str, list[tuple[str, str, str]]]]:
    text = (source / "01-产品需求文档.md").read_text(encoding="utf-8")
    sections = []
    current_title = None
    current_rows: list[tuple[str, str, str]] = []
    for line in text.splitlines():
        heading = re.match(r"^### 8\.\d+\s+(.+)$", line)
        if heading:
            if current_title:
                sections.append((current_title, current_rows))
            current_title = heading.group(1).strip()
            current_rows = []
            continue
        if line.startswith("## ") and current_title:
            sections.append((current_title, current_rows))
            current_title = None
            current_rows = []
            continue
        row = re.match(r"^\|\s*(FR-[A-Z]+-\d+)\s*\|\s*(.+?)\s*\|\s*(P\d)\s*\|", line)
        if row and current_title:
            current_rows.append((row.group(1), row.group(2).strip(), row.group(3)))
    if current_title:
        sections.append((current_title, current_rows))
    return [(title, rows) for title, rows in sections if rows]


def import_requirements(client: httpx.Client, headers: dict[str, str], prd: list[tuple[str, list[tuple[str, str, str]]]]) -> None:
    existing = client.get("/requirements", headers=headers).json()["data"]
    if existing:
        print(f"[requirements] 已存在 {len(existing)} 条，跳过")
        return
    for title, rows in prd:
        main = client.post("/requirements", headers=headers, json={
            "title": title,
            "priority": "P0",
            "description": f"模块：{title}，共 {len(rows)} 条功能需求。",
            "owner": "张伟",
        }).json()["data"]
        children = [{
            "title": f"{fr_id} {text}"[:190],
            "description": text,
            "priority": priority,
            "points": [],
        } for fr_id, text, priority in rows]
        response = client.post(f"/requirements/{main['id']}/split/confirm", headers=headers, json={"children": children})
        response.raise_for_status()
        print(f"[requirements] {title}: 1 主 + {len(children)} 子")


def build_testcase_xlsx() -> BytesIO:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "测试用例"
    sheet.append(["ID", "模块", "标题", "类型", "优先级", "状态", "前置条件", "步骤", "预期"])
    for module, title, case_type, priority, precondition, steps, expected in TEST_CASES:
        sheet.append(["", module, title, case_type, priority, "待评审", precondition, "\n".join(steps), expected])
    buffer = BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    return buffer


def import_testcases(client: httpx.Client, headers: dict[str, str]) -> None:
    existing = client.get("/testcases", headers=headers).json()["data"]
    if existing:
        print(f"[testcases] 已存在 {len(existing)} 条，跳过")
        return
    buffer = build_testcase_xlsx()
    response = client.post(
        "/testcases/import.xlsx",
        headers=headers,
        files={"file": ("property-testcases.xlsx", buffer.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    response.raise_for_status()
    print(f"[testcases] 导入结果: {response.json()['data']}")


def feature_summary(source: Path) -> str:
    payload = json.loads((source / "knowledge_base/catalog/features.json").read_text(encoding="utf-8"))
    lines = ["# 物业小程序功能目录", "", "> 由 knowledge_base/catalog/features.json 生成。", ""]
    for feature in payload.get("features", []):
        lines.append(f"- [{feature.get('status')}] {feature.get('id')} {feature.get('title')}（{feature.get('area')} / {feature.get('priority')}）")
        if feature.get("summary"):
            lines.append(f"  - {feature['summary'][:160]}")
    return "\n".join(lines)


def ensure_kb(client: httpx.Client, headers: dict[str, str]) -> dict:
    for kb in client.get("/knowledge", headers=headers).json()["data"]:
        if kb["name"] == KB_NAME:
            return kb
    response = client.post("/knowledge", headers=headers, json={"name": KB_NAME, "description": "物业小程序需求、接口、数据模型与验收知识", "embedding": "lexical"})
    response.raise_for_status()
    return response.json()["data"]


def import_knowledge(client: httpx.Client, headers: dict[str, str], source: Path) -> None:
    kb = ensure_kb(client, headers)
    docs = [
        "README.md", "01-产品需求文档.md", "02-角色权限矩阵.md", "03-业务状态机.md",
        "05-后端接口设计.md", "06-数据模型.md", "07-验收标准.md", "08-当前进度与后续开发计划.md",
        "AGENTS.md", "knowledge_base/README.md", "knowledge_base/reports/CURRENT_STATUS.md",
    ]
    existing = {doc["filename"] for doc in client.get("/knowledge/docs", headers=headers).json()["data"]}
    uploads: list[tuple[str, bytes, str]] = []
    for relative in docs:
        path = source / relative
        if path.exists() and path.name not in existing:
            uploads.append((path.name, path.read_bytes(), "text/markdown"))
    summary = feature_summary(source)
    if "物业小程序功能清单.md" not in existing:
        uploads.append(("物业小程序功能清单.md", summary.encode("utf-8"), "text/markdown"))
    for filename, content, mime in uploads:
        response = client.post(
            "/knowledge/docs",
            headers=headers,
            data={"kbId": kb["id"]},
            files={"file": (filename, content, mime)},
            timeout=120,
        )
        response.raise_for_status()
        print(f"[knowledge] 已索引 {filename}: {response.json()['data']['chunks']} chunks")
    recall = client.post("/knowledge/recall", headers=headers, json={"query": "微信登录 隐私协议 邀请码", "topK": 3}).json()["data"]
    print(f"[knowledge] 召回验证: {[(hit['doc'], hit['score']) for hit in recall]}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Import 物业小程序 into the AI test platform")
    parser.add_argument("--source", default="/Users/imac/Desktop/物业小程序")
    args = parser.parse_args()
    source = Path(args.source)
    if not (source / "01-产品需求文档.md").exists():
        raise SystemExit(f"找不到项目文档: {source}")
    with httpx.Client(base_url=API_BASE, timeout=120) as client:
        token = login(client)
        headers = {"Authorization": f"Bearer {token}"}
        project = ensure_project(client, headers)
        headers["X-Project-Id"] = project["id"]
        print(f"[project] {project['name']} ({project['id']})")
        import_requirements(client, headers, parse_prd(source))
        import_testcases(client, headers)
        import_knowledge(client, headers, source)
        requirements = client.get("/requirements", headers=headers).json()["data"]
        cases = client.get("/testcases", headers=headers).json()["data"]
        kbs = client.get("/knowledge", headers=headers).json()["data"]
        print(f"[done] requirements={len(requirements)} testcases={len(cases)} kbs={[(kb['name'], kb['docs'], kb['chunks']) for kb in kbs]}")


if __name__ == "__main__":
    main()
