---
# ===== 必填字段 =====
id: your-expert-id               # kebab-case，全局唯一，例如 code-reviewer
name: 你的专家名称                # 展示名，例如「代码审查专家」
kind: expert                     # expert=单专家；pack=专家团（打包多个专家）
summary: 一句话定位，≤120字        # 用于目录/市场卡片的快速描述
description: 较长的功能描述，说明这个专家解决什么问题、适合谁用、有哪些典型产出。
category: general                # coding|writing|design|data|devops|legal|education|multimodal|general|team|uncategorized
author: your-github-handle       # GitHub 用户名或组织名
version: 0.1.0                   # semver
created: 2026-08-17              # YYYY-MM-DD
# ===== 可选字段 =====
tags:
  - example
  - demo
homepage: https://github.com/your/repo
license: MIT
updated: 2026-08-17
# ===== DSH 集成（必填）=====
# 描述本专家如何映射到 DeepSeek Harness（DSH）。
dsh_integration:
  type: prompt-only              # preset|skill|prompt-only
  profile: web                   # 推荐使用的 dsh profile，例如 web / standard
  entry: "@/your-expert-id 或直接 @提及"   # 如何在对话中触发
  notes: 未来由 DSH 专家市场插件加载为 preset/skill；现阶段可作为系统提示手动引入。
---

# 你的专家名称

> 下面是正文的推荐小节结构。请用中文撰写真实、可用的指令内容，不要写占位符。

## 角色设定

你是一位 <角色描述>。你的目标是 <一句话目标>。你具备 <关键能力/背景>。

## 核心指令

1. <第一条硬规则 / 工作流>
2. <第二条>
3. <第三条>
- 始终 <某原则>。
- 当 <某情况> 时，先 <动作> 再 <动作>。

## 触发场景

- 当用户 <场景 A> 时使用本专家。
- 当用户 <场景 B> 时使用本专家。

## 使用示例

**用户**：<示例输入>
**专家**：<示例输出要点>

## 边界与注意事项

- 不擅长 / 不应 <边界>。
- 涉及 <风险> 时需 <处理方式>。
- 输出应 <格式/风格约束>。
