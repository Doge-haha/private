---
name: user-memory-system-exploration
description: 用户正在为 OpenClaw 研究记忆系统，已分析 Claude Code、lossless-claw、memory-lancedb-pro
type: user
created: 2026-04-10T12:00:00Z
updated: 2026-04-10T13:00:00Z
---

## 内容

用户 huahaha 正在为 OpenClaw 研究增强记忆系统。

**研究范围：**
1. Claude Code Session Memory 源码分析
2. lossless-claw / LCM DAG 压缩方案
3. memory-lancedb-pro 向量检索方案

**决策：**
- 跳过 memory-lancedb-pro（曾导致 OpenClaw 崩溃）
- 采用 Claude Code 风格的 typed memory 方案
- 优先实现：4 类分类 + 双阈值触发 + Safe Point 检测

**用户画像：**
- 资深技术探索者，IT 主管
- 熟悉 OpenClaw 架构
- 追求极致的自动化和系统化

## Why

用户的目标是打造"全能型 OpenClaw Agent"，记忆系统是关键组件。

## How to apply

- 涉及记忆系统设计时，参考 Claude Code 的实现思路
- 优先实现稳定的功能（typed memory），避免高风险插件
- 保持 4 层架构：Native → Working → Session → Long-term
