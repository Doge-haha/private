---
name: github-repo
description: 主人的 GitHub 仓库指针
type: reference
created: 2026-04-14T12:18:00Z
updated: 2026-04-14T12:18:00Z
---

## GitHub

- **仓库**: https://github.com/Doge-haha/private.git
- **本地路径**: `/Users/huahaha/.openclaw/workspace`（workspace 就是 repo root）
- **用户名**: haha0425
- **认证方式**: HTTPS（未配 gh CLI，未配 SSH key）

## 自动 Push 规则
- **频率**: 每天中午 12:00 自动 push
- **命令**: `cd /Users/huahaha/.openclaw/workspace && git add -A && git commit -m "daily sync" && git push`
- **Owner**: 主人明确要求每天定时 push
