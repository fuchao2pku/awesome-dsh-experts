# DSH 专家 Manifest 规范（expert-manifest）

本规范定义「Awesome DSH Experts」中每个专家条目的 **Markdown + YAML frontmatter** 格式。一个条目 = 一个 `expert.md` 文件，文件开头的 `---` 代码块为 frontmatter（机器可读），其后的 Markdown 为正文（人读的系统提示 / 角色设定）。

这种「人写提示词、机器读 manifest」的双形态，使专家既能通过 PR 被人轻松贡献，又能被未来的 **DSH 专家市场插件（Phase 2）** 直接加载、预览、一键安装进某个 `dsh` profile。

---

## 1. 文件布局

- 单专家：`experts/<id>/expert.md`
- 专家团（pack）：`experts/<id>/expert.md` + 可选 `experts/<id>/members/*.md`（团内成员各自也是一个 expert 条目）
- 模板：`experts/_template/expert.md`（拷贝即用，扫描器会跳过 `_` 开头的目录）

## 2. Frontmatter 字段

| 字段 | 类型 | 必填 | 约束 / 取值 | 说明 |
|------|------|------|-------------|------|
| `id` | string | ✅ | kebab-case，全局唯一 | 条目标识，用于 `@提及` 与依赖引用 |
| `name` | string | ✅ | — | 展示名 |
| `kind` | enum | ✅ | `expert` \| `pack` | 单专家 / 专家团 |
| `summary` | string | ✅ | ≤120 字 | 目录与市场卡片的一句话描述 |
| `description` | string | ✅ | — | 较长功能描述 |
| `category` | enum | ✅ | 见下表 | 分类 |
| `tags` | string[] | ⬜ | — | 检索标签 |
| `author` | string | ✅ | GitHub handle / org | 作者 |
| `homepage` | url | ⬜ | — | 仓库 / 主页 |
| `license` | string | ⬜ | 默认 `MIT` | 许可 |
| `version` | semver | ✅ | 如 `0.1.0` | 版本 |
| `created` | date | ✅ | `YYYY-MM-DD` | 创建日期 |
| `updated` | date | ⬜ | `YYYY-MM-DD` | 更新日期 |
| `dsh_integration` | object | ✅ | 见 §3 | DSH 集成方式 |

### category 取值
`coding` · `writing` · `design` · `data` · `devops` · `legal` · `education` · `multimodal` · `general` · `team` · `uncategorized`

## 3. `dsh_integration` 对象

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | enum | ✅ | `preset` \| `skill` \| `prompt-only` |
| `profile` | string | ⬜ | 推荐使用的 dsh profile（如 `web`） |
| `entry` | string | ⬜ | 触发方式：`@id` / 斜杠命令 / 手动引入 |
| `notes` | string | ⬜ | 自由说明 |
| `members` | string[] | ⚠️ pack 必填 | 专家团打包的成员 `id` 列表（非空） |
| `orchestration` | string | ⚠️ pack 必填 | 成员如何协作的简短说明 |

- `type: preset` → 未来插件把它渲染为一个 DSH **preset**（组合层补丁）。
- `type: skill` → 未来插件把它封装为一个 DSH **skill** 插件（单点能力，可热更新）。
- `type: prompt-only` → 仅作为系统提示 / 角色设定引入，不改 dsh 配置。

## 4. 校验

`scripts/scan.mjs --local` 会按本规范校验：必填字段存在、枚举取值合法、`id` 为 kebab-case、`pack` 必须声明 `members` 与 `orchestration`。校验失败会列在 CATALOG.md 的「校验问题」一节。

## 5. JSON Schema（draft-07，用于程序化校验）

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DSH Expert Manifest",
  "type": "object",
  "required": ["id", "name", "kind", "summary", "description", "category", "author", "version", "created", "dsh_integration"],
  "properties": {
    "id": { "type": "string", "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
    "name": { "type": "string" },
    "kind": { "type": "string", "enum": ["expert", "pack"] },
    "summary": { "type": "string", "maxLength": 120 },
    "description": { "type": "string" },
    "category": { "type": "string", "enum": ["coding","writing","design","data","devops","legal","education","multimodal","general","team","uncategorized"] },
    "tags": { "type": "array", "items": { "type": "string" } },
    "author": { "type": "string" },
    "homepage": { "type": "string", "format": "uri" },
    "license": { "type": "string" },
    "version": { "type": "string" },
    "created": { "type": "string", "format": "date" },
    "updated": { "type": "string", "format": "date" },
    "dsh_integration": {
      "type": "object",
      "required": ["type"],
      "properties": {
        "type": { "type": "string", "enum": ["preset", "skill", "prompt-only"] },
        "profile": { "type": "string" },
        "entry": { "type": "string" },
        "notes": { "type": "string" },
        "members": { "type": "array", "items": { "type": "string" } },
        "orchestration": { "type": "string" }
      },
      "if": { "properties": { "kind": { "const": "pack" } } },
      "then": { "required": ["members", "orchestration"] }
    }
  }
}
```

> 注：JSON Schema 的 `if/then` 跨字段约束依赖 `kind`，校验器需支持 draft-07 的 `if`；`scan.mjs` 用内置规则实现等价校验，不依赖外部库。

## 6. 自动发现（GitHub topic 约定）

- 单专家仓库打 topic：**`dsh-expert`**
- 专家团仓库打 topic：**`dsh-expert-pack`**

`scan.mjs --remote` 通过 GitHub Search API 扫描这两个 topic，类比社区对 `dsh-plugin` / `dsh-plugin-pack` 的扫描方式，把社区贡献的专家聚合进目录。

## 7. 与 DSH 插件生态的关系

DSH「一切皆插件」，官方 Web UI 的能力（包括插件市场）本身也是插件（`dsh-plugin-marketplace` 以 bundle+client 挂载，不改 dsh 源码）。本仓库定义的专家，将来由 **DSH 专家市场插件（Phase 2）** 读取 `catalog.json` 与各地 `expert.md`，在 Web UI 内提供「专家 / 专家团」市场入口，并在输入框支持引入已安装的专家团——交互参照 WorkBuddy 的专家体验。我们不 fork `deepseek-harness` 源码。
