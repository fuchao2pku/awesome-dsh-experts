# Awesome DSH Experts

> 社区共建的 **DeepSeek Harness（DSH）专家 / 专家团**精选与贡献仓库。

DSH（DeepSeek Harness）是 DeepSeek 开源的 Agent 框架，理念「一切皆插件」，底层是 Cordis 微内核——模型、工具、UI、主循环全都是可拔插的插件。社区已经有繁荣的 `dsh-plugin` 生态与 awesome 清单（如 [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins)）。

**但 DSH 还没有「专家 / 专家团」这一层能力。** 参照 [WorkBuddy](https://www.workbuddy.cn) 的做法——左侧有「专家」入口、输入框能引入已安装的专家 / 专家团——我们希望把这套「可被引入的角色化智能」带到 DSH。这个仓库就是它的起点：

- 一份**社区可贡献**的专家注册表（你写的提示词，别人能装）；
- 一套**机器可加载**的 manifest 规范（未来的 DSH 插件直接读它）；
- 一个**自动扫描**目录生成器（类比 awesome-dsh-plugins 的扫描器）。

---

## 什么是 DSH 专家 / 专家团

一个 **专家（Expert）** 是一段结构化的角色设定 + 系统提示（prompt），解决某一类明确任务（如代码审查、技术写作）。它本质是「人写提示词」的规范化形态。

一个 **专家团（Expert Group / Pack）** 是多个专家的打包与编排：定义哪些成员、以及它们如何协作（例如「软件开发团队」：产品经理 → 架构师 → 工程师 → QA 顺序流转）。

两种形态都用同一种载体：**一个 `expert.md` 文件 = 人读的提示词正文 + 机器读的 YAML frontmatter（manifest）**。这让你既能用 PR 轻松贡献，也能让插件直接加载、预览、安装。

| 字段 | 说明 |
|------|------|
| `kind: expert` | 单专家 |
| `kind: pack` | 专家团（需声明 `members` 与 `orchestration`） |

完整字段见 [`schema/expert-manifest.md`](schema/expert-manifest.md)。

---

## 快速开始

1. **浏览目录**：直接看 [`CATALOG.md`](CATALOG.md)（由扫描器自动生成）。
2. **使用专家**：现阶段专家即「Markdown + manifest」。
   - 可手动把 `expert.md` 的正文作为系统提示 / 角色设定引入你的 DSH 会话；
   - 或等 **Phase 2 的 DSH 专家市场插件** 提供「一键安装到某个 profile」的体验。
3. **本地校验 / 生成目录**（需 Node.js 18+）：
   ```bash
   node scripts/scan.mjs --local
   ```
   会产出 `catalog.json` 与 `CATALOG.md`，并列出任何 manifest 校验问题。

---

## 分类目录

> 完整表格见 [`CATALOG.md`](CATALOG.md)。分类如下：

- **coding** — 编程 / 代码审查 / 架构 / 测试
- **writing** — 技术写作 / 文档 / 教程
- **design** — UI / 视觉 / 交互
- **data** — 数据分析 / 可视化 / ETL
- **devops** — 运维 / CI / 部署 / 监控
- **legal** — 法律 / 合规 / 合同
- **education** — 教学 / 讲解 / 出题
- **multimodal** — 图像 / 视频 / 语音理解
- **general** — 通用助手 / 产品经理等
- **team** — 专家团 / 多智能体协作
- **uncategorized** — 暂未分类

---

## 精选专家

| 专家 | 简介 | 作者 | 分类 |
|------|------|------|------|
| [代码审查专家](experts/code-reviewer/expert.md) | 严谨、可操作的代码评审，按优先级给修改建议 | awesome-dsh-experts | coding |
| [技术写作专家](experts/tech-writer/expert.md) | 把复杂技术内容改写成清晰、准确的文档 | awesome-dsh-experts | writing |
| [软件开发团队](experts/software-team/expert.md) | 多角色协作专家团：需求→架构→实现→测试 | awesome-dsh-experts | team |

---

## 贡献指南

欢迎来贡献你的专家！步骤见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。要点：

1. Fork 并拷贝 [`experts/_template/expert.md`](experts/_template/expert.md)；
2. 填写 frontmatter + 正文，遵循 [`schema/expert-manifest.md`](schema/expert-manifest.md)；
3. 本地跑 `node scripts/scan.mjs --local` 确保校验通过；
4. 给自己的仓库打 topic **`dsh-expert`**（专家团用 **`dsh-expert-pack`**），便于扫描器自动发现；
5. 开 PR。

---

## 仓库结构

```
awesome-dsh-experts/
├── README.md                 # 本文件（awesome 清单）
├── CONTRIBUTING.md           # 贡献指南
├── CATALOG.md                # 自动生成的目录
├── catalog.json              # 自动生成的机器可读目录
├── LICENSE                  # MIT
├── .gitignore
├── experts/
│   ├── _template/expert.md   # 拷贝即用的模板
│   ├── code-reviewer/        # 种子专家
│   ├── tech-writer/          # 种子专家
│   └── software-team/        # 种子专家团（+ members/）
├── schema/
│   └── expert-manifest.md    # manifest 规范 + JSON Schema
├── scripts/
│   └── scan.mjs              # 目录扫描器（无外部依赖）
└── .github/workflows/
    └── scan.yml              # 定时刷新目录
```

---

## 与 DSH 插件生态的关系

DSH 的「一切皆插件」意味着官方 Web UI 的能力（包括插件市场）本身也是插件。例如 [`dsh-plugin-marketplace`](https://github.com/w2112515/dsh-plugin-marketplace) 以 **bundle + client** 的形式挂载「插件市场」入口，**全程不改 `deepseek-harness` 源码**，靠 `dsh plugin --profile web add` 安装。

本仓库定义的专家，将来由 **DSH 专家市场插件（Phase 2）** 读取 `catalog.json` 与各地 `expert.md`，在 Web UI 内提供「专家 / 专家团」市场入口，并在输入框支持引入已安装的专家团——交互参照 WorkBuddy 的专家体验。我们**不 fork `deepseek-harness` 源码**。

---

## 路线图 / Phase 2：DSH 专家市场插件

- [ ] 以 DSH bundle + client 插件形式实现，挂载「专家 / 专家团」入口到 Web UI（设置页，类比插件市场）；
- [ ] 修改输入框，支持引入已安装的专家 / 专家团（参照 WorkBuddy 左侧专家入口 + 输入框引入）；
- [ ] 消费本仓库的 `catalog.json` 与 `expert.md`，提供浏览、审阅、一键安装到 `dsh` profile；
- [ ] 安装信任模型参照 marketplace（基于固定 commit 的证据、逐次人工批准）。

---

## License

[MIT](LICENSE) © Awesome DSH Experts contributors.

## 致谢

- [awesome-dsh-plugins](https://github.com/AdamPlatin123/awesome-dsh-plugins) — 自动扫描索引的 awesome 清单范式
- [dsh-plugin-marketplace](https://github.com/w2112515/dsh-plugin-marketplace) — 「一切皆插件」下不改源码挂载市场的范本
- [dsh-handbook](https://github.com/Electricitysheep/dsh-handbook) — DSH 深度手册与插件开发教程
- [WorkBuddy](https://www.workbuddy.cn) — 专家 / 专家团交互的参照设计
