# Codex 配置备份

本仓库用于恢复 Codex 到可用状态，而不是保存会话、日志或本机认证信息。

## 已备份

- `config.toml`：模型、权限及工作区配置。
- `AGENTS.md`、`rules/`：全局工作规则。
- `skills/`、`vendor_imports/`：已安装或导入的技能。
- `plugins/cache/`：已缓存的插件包。
- `version.json`：备份时的 Codex 版本信息。

## 不备份

- `auth.json`、`.env`、`cap_sid` 和 `.sandbox-secrets/`：认证凭据或敏感数据。
- SQLite、会话、记忆、附件、日志、临时文件和可执行缓存：运行时数据，体积大且不影响重新可用。

## 恢复步骤

1. 在新电脑安装并启动 Codex 一次，然后关闭应用。
2. 将本仓库克隆到临时目录。
3. 将仓库内已跟踪的文件复制到新电脑的 `C:\\Users\\<用户名>\\.codex`，不要覆盖其 `.git` 目录。
4. 启动 Codex，并按提示重新登录；认证信息不会从本仓库恢复。
5. 如插件未被自动识别，在 Codex 中重新安装对应插件。

建议在修改配置、规则、技能或插件后执行 `git add -A && git commit && git push`。
