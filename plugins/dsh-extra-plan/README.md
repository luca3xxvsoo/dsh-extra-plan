# https://github.com/luca3xxvsoo/dsh-extra-plan

## 诊断日志：`logs/dsh-extra-plan/`

位于数据根下（Windows：`%USERPROFILE%\.dsh\logs\dsh-extra-plan\`）。
每行一个 JSON，均为追加写入，**仅供排查问题，可随时删除，不影响插件功能**。

| 文件 | 用途 |
|:--|:--|
| `extra-plan-anchored.jsonl` | F 段工具收窄与提示词装配诊断日志 |
| `extra-plan-request-errors.jsonl` | 模型请求级错误日志 |
| `extra-plan-agent-errors.jsonl` | agent 回合错误日志 |
| `extra-plan-usage-errors.jsonl` | 用量账本错误日志 |
| `extra-plan-usage-ledger.jsonl` | 用量账本归档：使用本插件会话各角色用量统计 |
