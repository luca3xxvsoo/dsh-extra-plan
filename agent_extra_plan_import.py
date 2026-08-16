#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
agent_extra_plan_import.py
将与本脚本同目录的 agent_extra_plan.zip 解压到目标环境 DSH_HOME 的对应路径。

前置条件：目标环境已安装 deepseek harness（自带宿主 @deepseek-ai 依赖），
但缺少 extra_plan 专属文件（本包只含预设与本地插件，不涉及宿主包）。

行为：
  - zip 条目为相对 DSH_HOME 的路径（.agent-presets/... 与 profiles/<profile>/...）；
  - profiles/<profile> 若在目标环境不存在：自动扫描 profiles/* 中已存在的目录
    作为替代（打印映射，同 profile 只映射一次）；若一个都没有则按原名创建并
    提示核对 harness 的 profile 结构；
  - 同名文件直接覆盖（先打印提示）；
  - 解压后逐文件按大小校验。

用法：python agent_extra_plan_import.py
生效提醒：导入后需重启 web 进程使插件生效；预设改动在新会话生效。
"""
import os
import sys
import zipfile
from pathlib import Path

ZIP_NAME = "agent_extra_plan.zip"


def resolve_dsh_home() -> Path:
    env = os.environ.get("DSH_HOME", "").strip()
    if env:
        return Path(env)
    return Path.home() / ".dsh"


def build_profile_mapper(dsh_home: Path):
    """返回 (profile, 已存在 profiles 目录列表) 闭包：同 profile 只映射一次。"""
    cache = {}

    def map_profile(src_profile: str) -> str:
        if src_profile in cache:
            return cache[src_profile]
        target = dsh_home / "profiles" / src_profile
        if target.is_dir():
            cache[src_profile] = src_profile
            return src_profile
        existing = sorted(
            p.name
            for p in (dsh_home / "profiles").glob("*")
            if p.is_dir() and not p.name.startswith(".")
        )
        if existing:
            print(f"[import] 提示：profiles/{src_profile} 不存在，改用 profiles/{existing[0]}")
            cache[src_profile] = existing[0]
            return existing[0]
        print(
            f"[import] 警告：目标环境无任何 profiles 目录，将按原名创建 "
            f"profiles/{src_profile}（请核对 harness 的 profile 结构）"
        )
        cache[src_profile] = src_profile
        return src_profile

    return map_profile


def main() -> int:
    zip_path = Path(__file__).resolve().parent / ZIP_NAME
    if not zip_path.is_file():
        print(f"[import] 错误：找不到压缩包：{zip_path}", file=sys.stderr)
        return 1

    dsh_home = resolve_dsh_home()
    print(f"[import] DSH_HOME = {dsh_home}")
    dsh_home.mkdir(parents=True, exist_ok=True)
    map_profile = build_profile_mapper(dsh_home)

    count = 0
    with zipfile.ZipFile(zip_path, "r") as zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            rel = info.filename.replace("\\", "/")
            parts = rel.split("/")
            # 映射 profiles/<profile> 前缀
            if len(parts) >= 2 and parts[0] == "profiles":
                parts[1] = map_profile(parts[1])
                rel = "/".join(parts)
            dst = dsh_home / rel
            if dst.exists():
                print(f"[import] 覆盖：{rel}（已存在）")
            else:
                print(f"[import] 写入：{rel}")
            dst.parent.mkdir(parents=True, exist_ok=True)
            with zf.open(info) as src, open(dst, "wb") as out:
                out.write(src.read())
            if dst.stat().st_size != info.file_size:
                print(f"[import] 错误：大小校验失败：{rel}", file=sys.stderr)
                return 1
            count += 1

    print(f"[import] 完成：共 {count} 个文件解压到 {dsh_home}")
    print("[import] 提醒：重启 web 进程使插件生效；新会话中即可选择「按需规划模式」预设。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
