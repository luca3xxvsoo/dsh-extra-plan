#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agent_extra_plan_export.py
打包本机 extra_plan（按需规划模式）专属文件为 agent_extra_plan.zip（与本脚本同目录）。

打包内容（zip 内为相对 DSH_HOME 的路径，正斜杠）：
  .agent-presets/extra-plan/preset.yml
  .agent-presets/extra-plan/agent.cordis.yml
  profiles/<profile>/node_modules/@local/dsh-extra-plan/index.js
  profiles/<profile>/node_modules/@local/dsh-extra-plan/package.json
  profiles/<profile>/node_modules/@local/dsh-executor-spawn/index.js
  profiles/<profile>/node_modules/@local/dsh-executor-spawn/package.json

不打包：宿主 @deepseek-ai 依赖包（目标环境已装 harness 自带）、运行时产物
（usage 账本/会话日志/请求诊断文件）、工作区文档与测试资产。

用法：python agent_extra_plan_export.py
DSH_HOME 解析：环境变量 DSH_HOME；未设置则用 ~/.dsh。
"""
import glob
import os
import sys
import zipfile
from pathlib import Path

ZIP_NAME = "agent_extra_plan.zip"

# 相对 DSH_HOME 的固定预设清单（存在才打包）
FIXED_REL = [
    ".agent-presets/extra-plan/preset.yml",
    ".agent-presets/extra-plan/agent.cordis.yml",
]
# 按 profile 扫描的本地插件文件（相对 DSH_HOME；dsh-extra-plan 与 dsh-executor-spawn）
PLUGIN_GLOBS = [
    "profiles/*/node_modules/@local/dsh-extra-plan/index.js",
    "profiles/*/node_modules/@local/dsh-extra-plan/package.json",
    "profiles/*/node_modules/@local/dsh-executor-spawn/index.js",
    "profiles/*/node_modules/@local/dsh-executor-spawn/package.json",
]


def resolve_dsh_home() -> Path:
    env = os.environ.get("DSH_HOME", "").strip()
    if env:
        return Path(env)
    return Path.home() / ".dsh"


def collect_files(dsh_home: Path):
    """返回 (found: list[Path], missing: list[str])。found 含固定清单与插件 glob 命中。"""
    found, missing = [], []
    for rel in FIXED_REL:
        p = dsh_home / rel
        if p.is_file():
            found.append(p)
        else:
            missing.append(str(p))
    for pattern in PLUGIN_GLOBS:
        for hit in sorted(glob.glob(str(dsh_home / pattern))):
            found.append(Path(hit))
    return found, missing


def main() -> int:
    dsh_home = resolve_dsh_home()
    print(f"[export] DSH_HOME = {dsh_home}")
    if not dsh_home.is_dir():
        print(f"[export] 错误：DSH_HOME 目录不存在：{dsh_home}", file=sys.stderr)
        return 1

    found, missing = collect_files(dsh_home)
    for m in missing:
        print(f"[export] 警告：预设文件缺失（跳过）：{m}")
    if not found:
        print("[export] 错误：没有找到任何可打包的 extra_plan 文件", file=sys.stderr)
        return 1

    out_zip = Path(__file__).resolve().parent / ZIP_NAME
    count = 0
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in found:
            rel = p.relative_to(dsh_home).as_posix()  # zip 内统一正斜杠
            zf.write(p, rel)
            print(f"[export] 打包：{rel}")
            count += 1
    print(f"[export] 完成：共 {count} 个文件 → {out_zip}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
