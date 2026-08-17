# 贡献指南（CONTRIBUTING）

感谢你为 **Awesome DSH Experts** 贡献专家！无论是一个帮你搞定代码审查的单专家，还是一个多角色协作的专家团，都欢迎。

## 两种方式

- **方式 A（推荐，进主仓库）**：直接在本仓库 `experts/` 下新增一个目录并提交 PR。适合希望被社区精选收录的专家。
- **方式 B（独立仓库，自动发现）**：在你的独立仓库里放 `expert.md`，打上 topic `dsh-expert`（专家团用 `dsh-expert-pack`）。扫描器会自动把你的仓库聚合进目录。

下面以方式 A 为例。

## 步骤

1. **Fork** 本仓库并新建分支。

2. **拷贝模板**：
   ```bash
   cp experts/_template/expert.md experts/<your-expert-id>/expert.md
   ```
   `<your-expert-id>` 必须是 kebab-case、全局唯一（如 `code-reviewer`）。

3. **填写 frontmatter + 正文**，遵循 [`schema/expert-manifest.md`](schema/expert-manifest.md)。速查：

   | 字段 | 必填 | 说明 |
   |------|------|------|
   | `id` | ✅ | kebab-case，唯一 |
   | `name` | ✅ | 展示名 |
   | `kind` | ✅ | `expert` 或 `pack` |
   | `summary` | ✅ | ≤120 字一句话定位 |
   | `description` | ✅ | 较长描述 |
   | `category` | ✅ | 见规范枚举 |
   | `author` | ✅ | 你的 GitHub handle |
   | `version` | ✅ | semver |
   | `created` | ✅ | `YYYY-MM-DD` |
   | `dsh_integration` | ✅ | `type` / `profile` / `entry` / `notes`；pack 还需 `members` + `orchestration` |

   正文建议包含：`## 角色设定` / `## 核心指令` / `## 触发场景` / `## 使用示例` / `## 边界与注意事项`。

4. **若是专家团（pack）**：设 `kind: pack`，在 `dsh_integration.members` 列出成员 `id`，在 `dsh_integration.orchestration` 说明协作方式。成员可放在 `experts/<id>/members/*.md`，各自也是完整 expert 条目。

5. **本地校验**（需 Node.js 18+）：
   ```bash
   node scripts/scan.mjs --local
   ```
   必须通过——不能有任何「missing required field」「id ... is not kebab-case」「pack must declare ...」之类错误。脚本会重新生成 `CATALOG.md` 与 `catalog.json`，请把它们一并提交。

6. **（方式 B）打 topic**：若走独立仓库，给仓库打 `dsh-expert` 或 `dsh-expert-pack`，扫描器即可自动发现。

7. **开 PR**，在描述里说明：你的专家解决什么问题、适合谁、有没有依赖或前置条件。

## 校验命令

```bash
node scripts/scan.mjs --local --out .
```

## 行为准则

- 真诚、可用：提示词要真的有用，不要占位符 / lorem ipsum。
- 尊重约定：若你的专家基于某框架 / 工具，请注明版本与前提。
- 安全边界：涉及执行命令、访问网络、处理敏感信息时，在「边界与注意事项」里写清。

再次感谢贡献！🚀
