#!/usr/bin/env node
/**
 * build-site.mjs — 零依赖站点生成器
 *
 * 读取 catalog.json（结构化的专家/专家团元数据）与 experts/*.md（正文），
 * 生成静态 GitHub Pages 站点到 site/：
 *   - site/index.html        专家列表（按分类分组 + 搜索/筛选）
 *   - site/<id>.html         专家/专家团详情
 *   - site/assets/site.css   设计系统（taste 风格，明暗双主题）
 *   - site/assets/site.js    主题切换 + 搜索 + 分类筛选
 *
 * 所有页面使用相对路径，兼容 GitHub Pages 子路径（/awesome-dsh-experts/）。
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = join(ROOT, "site");
const ASSETS = join(OUT, "assets");

const CAT_LABELS = {
  coding: "编程", writing: "写作", design: "设计", data: "数据",
  devops: "运维", legal: "法务", education: "教育", multimodal: "多模态",
  general: "通用", team: "专家团", uncategorized: "未分类",
};
// 优先展示专家团，再按常见度排序
const CAT_ORDER = ["team", "coding", "writing", "design", "data", "devops",
  "legal", "education", "multimodal", "general", "uncategorized"];

const GITHUB = "https://github.com/fuchao2pku/awesome-dsh-experts";
const PLUGIN = "https://github.com/fuchao2pku/dsh-experts";

/* ---------------- 工具 ---------------- */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function initial(name) {
  const n = String(name || "").trim();
  return n ? n[0] : "?";
}
function kindLabel(kind) {
  return kind === "pack" ? "专家团" : "单专家";
}

/* ---------------- 极简 Markdown 渲染 ---------------- */
function stripFrontmatter(text) {
  const m = text.match(/^---[^\n]*\n([\s\S]*?)\n---\s*\n?/);
  return m ? text.slice(m[0].length) : text;
}
function inline(s) {
  let o = esc(s);
  o = o.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  o = o.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  o = o.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  o = o.replace(/_([^_]+)_/g, "<em>$1</em>");
  o = o.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, t, u) => `<a href="${u}" target="_blank" rel="noopener">${t}</a>`);
  return o;
}
function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let html = "";
  let i = 0;
  let para = [];
  const flush = () => {
    if (para.length) { html += `<p>${inline(para.join(" "))}</p>\n`; para = []; }
  };
  while (i < lines.length) {
    const line = lines[i];
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      flush();
      const buf = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      html += `<pre><code>${esc(buf.join("\n"))}</code></pre>\n`;
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) { flush(); const l = h[1].length; html += `<h${l}>${inline(h[2])}</h${l}>\n`; i++; continue; }
    if (/^(---+|\*\*\*+)\s*$/.test(line)) { flush(); html += "<hr>\n"; i++; continue; }
    if (/^>\s?/.test(line)) {
      flush();
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      html += `<blockquote>${inline(buf.join(" "))}</blockquote>\n`;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      flush(); html += "<ul>\n";
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^[-*]\s+/, ""))}</li>\n`; i++; }
      html += "</ul>\n"; continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      flush(); html += "<ol>\n";
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { html += `<li>${inline(lines[i].replace(/^\d+\.\s+/, ""))}</li>\n`; i++; }
      html += "</ol>\n"; continue;
    }
    if (/^\s*$/.test(line)) { flush(); i++; continue; }
    para.push(line.trim()); i++;
  }
  flush();
  return html;
}

/* ---------------- 布局 ---------------- */
function layout({ title, description, body, hasToolbar }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Awesome DSH Experts</title>
<meta name="description" content="${esc(description)}">
<link rel="stylesheet" href="assets/site.css">
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="index.html"><span class="logo">DSH</span><span>Awesome DSH Experts</span></a>
    <span class="header-spacer"></span>
    <a class="github-link" href="${GITHUB}" target="_blank" rel="noopener">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
      <span>GitHub</span>
    </a>
    <button class="theme-toggle" id="theme-toggle" aria-label="切换主题" title="切换明暗主题">🌓</button>
  </div>
</header>
<main class="wrap">
${body}
</main>
<footer class="footer">
  <div class="wrap">
    <span>awesome-dsh-experts · 社区专家目录</span>
    <span>在 DSH 设置页安装 <a href="${PLUGIN}" target="_blank" rel="noopener">dsh-experts</a> 插件即可一键使用</span>
  </div>
</footer>
<script src="assets/site.js"></script>
</body>
</html>`;
}

/* ---------------- 卡片 ---------------- */
function cardHtml(e) {
  const cat = e.category;
  const isPack = e.kind === "pack";
  const tags = (e.tags || []).slice(0, 3)
    .map((t) => `<span class="badge tag">${esc(t)}</span>`).join("");
  return `        <a class="card" href="${esc(e.id)}.html" data-name="${esc(e.name)}" data-summary="${esc(e.summary)}" data-tags="${esc((e.tags || []).join(" "))}" data-cat="${esc(cat)}" data-kind="${esc(e.kind)}">
          <div class="card-top">
            <div class="avatar${isPack ? " pack" : ""}">${esc(initial(e.name))}</div>
            <div>
              <h3>${esc(e.name)}</h3>
              <div class="kind">${kindLabel(e.kind)}</div>
            </div>
          </div>
          <p class="summary">${esc(e.summary)}</p>
          <div class="card-foot">
            <div class="tags">${tags}</div>
            <span class="badge">${esc(CAT_LABELS[cat] || cat)}</span>
          </div>
        </a>`;
}

/* ---------------- 主流程 ---------------- */
function main() {
  mkdirSync(OUT, { recursive: true });
  const catalog = JSON.parse(readFileSync(join(ROOT, "catalog.json"), "utf8"));

  // 扁平化条目
  const entries = [];
  const byId = {};
  for (const cat of CAT_ORDER) {
    const list = catalog.categories?.[cat] || [];
    for (const e of list) {
      const item = { ...e, category: cat };
      entries.push(item);
      byId[e.id] = item;
    }
  }
  // 兜底：收集未预见分类
  for (const cat of Object.keys(catalog.categories || {})) {
    if (CAT_ORDER.includes(cat)) continue;
    for (const e of catalog.categories[cat]) {
      const item = { ...e, category: cat };
      entries.push(item);
      byId[e.id] = item;
    }
  }

  const catCount = {};
  for (const e of entries) catCount[e.category] = (catCount[e.category] || 0) + 1;

  const packs = entries.filter((e) => e.kind === "pack").length;
  const usedCats = CAT_ORDER.filter((c) => catCount[c]);

  /* ----- 索引页 ----- */
  const hero = `      <section class="hero wrap">
        <span class="eyebrow">● DSH · DeepSeek Harness 社区</span>
        <h1>发现并安装 <span class="grad">DSH 专家与专家团</span></h1>
        <p class="lead">一份持续维护的社区专家目录。浏览专家 / 专家团、查看能力说明，并在 DSH 设置页的「专家市场」中一键安装。</p>
        <div class="stats">
          <div class="stat"><div class="num">${entries.length}</div><div class="label">专家 / 专家团</div></div>
          <div class="stat"><div class="num">${packs}</div><div class="label">专家团</div></div>
          <div class="stat"><div class="num">${usedCats.length}</div><div class="label">分类</div></div>
        </div>
      </section>`;

  const toolbar = `      <div class="toolbar wrap">
        <div class="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path></svg>
          <input id="search" type="search" placeholder="搜索专家、标签或能力…" autocomplete="off">
        </div>
        <div class="chips">
          <button class="chip active" data-cat="all">全部</button>
${usedCats.map((c) => `          <button class="chip" data-cat="${c}">${esc(CAT_LABELS[c] || c)}</button>`).join("\n")}
        </div>
      </div>`;

  const sections = usedCats.map((cat) => {
    const list = entries.filter((e) => e.category === cat);
    return `      <section class="section">
        <div class="section-head" data-cat="${cat}">
          <h2>${esc(CAT_LABELS[cat] || cat)}</h2>
          <span class="count">${list.length}</span>
          <span class="bar"></span>
        </div>
        <div class="grid">
${list.map(cardHtml).join("\n")}
        </div>
      </section>`;
  }).join("\n");

  const indexBody = `${hero}
${toolbar}
${sections}
      <div class="empty" id="empty" style="display:none">没有匹配的专家，换个关键词或分类试试。</div>`;

  const indexHtml = layout({
    title: "社区专家目录",
    description: "Awesome DSH Experts — 持续维护的 DSH 社区专家与专家团目录，支持在 DSH 设置页一键安装。",
    body: indexBody,
  });

  /* ----- 详情页 ----- */
  for (const e of entries) {
    const cat = e.category;
    const isPack = e.kind === "pack";
    const di = e.dsh_integration || {};
    const tags = (e.tags || []).map((t) => `<span class="badge tag">${esc(t)}</span>`).join("");

    let bodyHtml = "";
    const mdPath = e._path ? join(ROOT, e._path) : null;
    if (mdPath && existsSync(mdPath)) {
      bodyHtml = mdToHtml(stripFrontmatter(readFileSync(mdPath, "utf8")));
    }

    const membersHtml = (di.members || [])
      .map((m) => {
        const me = byId[m];
        const nm = me ? me.name : m;
        return `<a class="member-pill" href="${esc(m)}.html"><span class="dot">${esc(initial(nm))}</span>${esc(nm)}</a>`;
      })
      .join("");

    const dshBox = `        <div class="dsh-box">
          <h4>DSH 集成</h4>
          <div class="dsh-row"><span class="k">类型</span><span class="v"><span class="badge">${esc(di.type || "—")}</span></span></div>
          <div class="dsh-row"><span class="k">Profile</span><span class="v">${esc(di.profile || "—")}</span></div>
          <div class="dsh-row"><span class="k">触发</span><span class="v"><code class="dsh-entry">${esc(di.entry || "—")}</code></span></div>
${membersHtml ? `          <div class="dsh-row"><span class="k">成员</span><span class="v"><div class="members">${membersHtml}</div></span></div>\n` : ""}${di.orchestration ? `          <div class="dsh-row"><span class="k">协作</span><span class="v">${esc(di.orchestration)}</span></div>\n` : ""}${di.notes ? `          <div class="dsh-row"><span class="k">说明</span><span class="v">${esc(di.notes)}</span></div>\n` : ""}        </div>`;

    const meta = `        <div class="detail-meta">
          <span class="badge">${esc(CAT_LABELS[cat] || cat)}</span>
          ${tags}
          <span class="badge tag">作者 ${esc(e.author || "—")}</span>
          <span class="badge tag">许可证 ${esc(e.license || "—")}</span>
          <span class="badge tag">版本 ${esc(e.version || "—")}</span>
          <span class="badge tag">创建 ${esc(e.created || "—")}</span>
${e.homepage ? `          <a class="badge tag" href="${esc(e.homepage)}" target="_blank" rel="noopener">仓库 ↗</a>\n` : ""}        </div>`;

    const body = `      <a class="back" href="index.html">← 返回目录</a>
      <div class="detail" data-cat="${cat}">
        <div class="detail-head">
          <div class="avatar${isPack ? " pack" : ""}">${esc(initial(e.name))}</div>
          <div>
            <h1>${esc(e.name)}</h1>
            <div class="sub">${kindLabel(e.kind)} · ${esc(CAT_LABELS[cat] || cat)}</div>
          </div>
        </div>
${meta}
        <p class="desc">${esc(e.description || "")}</p>
${dshBox}
        <div class="content">
${bodyHtml}
        </div>
      </div>`;

    const html = layout({
      title: e.name,
      description: e.summary || e.description || "",
      body,
    });
    writeFileSync(join(OUT, `${e.id}.html`), html, "utf8");
  }

  /* ----- 资源 ---------------- */
  mkdirSync(ASSETS, { recursive: true });
  writeFileSync(join(ASSETS, "site.css"), readFileSync(join(ROOT, "templates", "site.css"), "utf8"), "utf8");
  writeFileSync(join(ASSETS, "site.js"), readFileSync(join(ROOT, "templates", "site.js"), "utf8"), "utf8");
  writeFileSync(join(OUT, ".nojekyll"), "", "utf8");
  writeFileSync(join(OUT, "index.html"), indexHtml, "utf8");

  console.log(`✓ site generated: ${entries.length} detail pages + index -> ${OUT}`);
}

main();
