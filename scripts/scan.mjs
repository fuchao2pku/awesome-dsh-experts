#!/usr/bin/env node
/**
 * awesome-dsh-experts — catalog scanner
 *
 * Aggregates DSH "experts" (Markdown + YAML frontmatter) into CATALOG.md + catalog.json.
 *
 * Usage:
 *   node scripts/scan.mjs [--local] [--remote] [--out <dir>] [--help]
 *
 *   --local    Scan ./experts recursively (default, works offline).
 *   --remote   Query GitHub for repos tagged `dsh-expert` / `dsh-expert-pack`.
 *   --out DIR  Output directory (default: repo root, resolved relative to this script).
 *
 * Phase 2: the DSH Experts Marketplace plugin will consume catalog.json to render
 * a browsable market and to install experts into a dsh profile — without forking
 * deepseek-harness source (mirrors how dsh-plugin-marketplace works).
 *
 * No external dependencies: uses only Node.js built-ins.
 */

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const CATEGORIES = [
  'coding', 'writing', 'design', 'data', 'devops',
  'legal', 'education', 'multimodal', 'general', 'team', 'uncategorized',
];
const KINDS = ['expert', 'pack'];
const INTEGRATION_TYPES = ['preset', 'skill', 'prompt-only'];
const REQUIRED = [
  'id', 'name', 'kind', 'summary', 'description',
  'category', 'author', 'version', 'created', 'dsh_integration',
];

// ---------------------------------------------------------------------------
// Minimal YAML-frontmatter parser (subset: scalars, block seq, one-level map,
// inline arrays). Intentionally dependency-free.
// ---------------------------------------------------------------------------
function parseScalar(s) {
  const v = s.trim();
  if (v === '') return '';
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null' || v === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
  return v;
}

function parseInlineArray(s) {
  const inner = s.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((x) => parseScalar(x.trim())).filter((x) => x !== '');
}

function parseFrontmatter(fm) {
  const lines = fm.split(/\r?\n/);
  /** @type {Record<string, any>} */
  const result = {};
  let topKey = null;
  let topMode = null; // 'seq' | 'map' | null
  let mapObj = null;
  let nestedSeqKey = null;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    const indent = raw.length - raw.trimStart().length;
    const line = raw.trim();

    const listMatch = line.match(/^-\s+(.*)$/);
    if (listMatch) {
      const val = parseScalar(listMatch[1].trim());
      if (nestedSeqKey !== null && mapObj) {
        mapObj[nestedSeqKey].push(val);
      } else if (topMode === 'seq' && topKey !== null) {
        result[topKey].push(val);
      }
      continue;
    }

    const km = line.match(/^([A-Za-z0-9_.\-]+):\s*(.*)$/);
    if (!km) continue;
    const key = km[1];
    const val = km[2].trim();

    if (indent === 0) {
      topKey = key;
      nestedSeqKey = null;
      if (val === '') {
        result[key] = [];
        topMode = 'seq';
        mapObj = null;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        result[key] = parseInlineArray(val);
        topMode = null;
      } else {
        result[key] = parseScalar(val);
        topMode = null;
      }
    } else {
      if (topMode === 'seq') {
        result[topKey] = {};
        mapObj = result[topKey];
        topMode = 'map';
      }
      if (!mapObj) {
        mapObj = {};
        result[topKey] = mapObj;
        topMode = 'map';
      }
      if (val === '') {
        mapObj[key] = [];
        nestedSeqKey = key;
      } else if (val.startsWith('[') && val.endsWith(']')) {
        mapObj[key] = parseInlineArray(val);
        nestedSeqKey = null;
      } else {
        mapObj[key] = parseScalar(val);
        nestedSeqKey = null;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Validation (equivalent to the JSON Schema in schema/expert-manifest.md)
// ---------------------------------------------------------------------------
function validate(e) {
  const errs = [];
  for (const k of REQUIRED) {
    const v = e[k];
    if (v === undefined || v === null || v === '') errs.push(`missing required field "${k}"`);
  }
  if (e.id !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(e.id))) {
    errs.push(`id "${e.id}" is not kebab-case`);
  }
  if (e.kind !== undefined && !KINDS.includes(e.kind)) {
    errs.push(`kind "${e.kind}" must be one of ${KINDS.join(', ')}`);
  }
  if (e.category !== undefined && !CATEGORIES.includes(e.category)) {
    errs.push(`category "${e.category}" must be one of ${CATEGORIES.join(', ')}`);
  }
  if (e.dsh_integration && e.dsh_integration.type !== undefined &&
      !INTEGRATION_TYPES.includes(e.dsh_integration.type)) {
    errs.push(`dsh_integration.type "${e.dsh_integration.type}" must be one of ${INTEGRATION_TYPES.join(', ')}`);
  }
  if (e.kind === 'pack') {
    const m = e.dsh_integration && e.dsh_integration.members;
    if (!Array.isArray(m) || m.length === 0) {
      errs.push('pack must declare non-empty dsh_integration.members');
    }
    if (!e.dsh_integration || !e.dsh_integration.orchestration) {
      errs.push('pack must declare dsh_integration.orchestration');
    }
  }
  return errs;
}

// ---------------------------------------------------------------------------
// Local scan
// ---------------------------------------------------------------------------
async function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name.startsWith('_')) continue; // skip _template etc.
      await walk(p, out);
    } else if (ent.isFile() && ent.name.endsWith('.md')) {
      out.push(p);
    }
  }
  return out;
}

async function readExpert(path) {
  const raw = await readFile(path, 'utf8');
  const m = raw.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  if (!m) return null;
  return { path: relative(REPO_ROOT, path), frontmatter: parseFrontmatter(m[1]) };
}

async function scanLocal() {
  const files = await walk(join(REPO_ROOT, 'experts'));
  const entries = [];
  const errors = [];
  for (const f of files) {
    const ex = await readExpert(f);
    if (!ex) {
      errors.push(`${f}: no valid frontmatter`);
      continue;
    }
    const errs = validate(ex.frontmatter);
    if (errs.length) errors.push(`${ex.path}: ${errs.join('; ')}`);
    entries.push({ ...ex.frontmatter, _path: ex.path });
  }
  return { entries, errors };
}

// ---------------------------------------------------------------------------
// Remote scan (GitHub topic discovery) — best-effort, never crashes
// ---------------------------------------------------------------------------
async function scanRemote() {
  const token = process.env.GITHUB_TOKEN;
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'awesome-dsh-experts-scanner' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const entries = [];
  const errors = [];
  try {
    const res = await fetch(
      `https://api.github.com/search/repositories?q=${encodeURIComponent('topic:dsh-expert')}&per_page=100`,
      { headers },
    );
    if (res.status === 403) {
      errors.push('GitHub rate limit (403). Set GITHUB_TOKEN to raise the limit.');
      return { entries, errors };
    }
    if (!res.ok) {
      errors.push(`GitHub API error ${res.status}`);
      return { entries, errors };
    }
    const data = await res.json();
    for (const repo of data.items || []) {
      const topics = repo.topics || [];
      entries.push({
        id: repo.name,
        name: repo.name,
        kind: topics.includes('dsh-expert-pack') ? 'pack' : 'expert',
        summary: repo.description || '',
        description: repo.description || '',
        category: 'uncategorized',
        author: repo.owner?.login || '',
        homepage: repo.html_url,
        license: 'unknown',
        version: '0.0.0',
        created: (repo.created_at || '').slice(0, 10),
        updated: (repo.pushed_at || '').slice(0, 10),
        dsh_integration: { type: 'prompt-only', notes: 'discovered via GitHub topic; manifest pending' },
        _path: repo.html_url,
        _remote: true,
      });
    }
  } catch (e) {
    errors.push(`network error: ${e.message}`);
  }
  return { entries, errors };
}

// ---------------------------------------------------------------------------
// Catalog assembly + writers
// ---------------------------------------------------------------------------
function buildByCategory(entries) {
  const byCat = {};
  for (const c of CATEGORIES) byCat[c] = [];
  for (const e of entries) {
    const c = CATEGORIES.includes(e.category) ? e.category : 'uncategorized';
    byCat[c].push(e);
  }
  return byCat;
}

function renderMarkdown(byCat, generatedAt, errors, sources) {
  const lines = [];
  lines.push('# Awesome DSH Experts — 目录 (CATALOG)');
  lines.push('');
  lines.push(`> 自动生成于 ${generatedAt}（来源：${sources}）。请勿手改；由 \`scripts/scan.mjs\` 生成。`);
  lines.push('');
  const total = Object.values(byCat).reduce((n, a) => n + a.length, 0);
  lines.push(`共 **${total}** 个专家 / 专家团。`);
  lines.push('');
  for (const cat of CATEGORIES) {
    const list = byCat[cat];
    if (!list.length) continue;
    lines.push(`## ${cat}`);
    lines.push('');
    lines.push('| id | 名称 | 简介 | 作者 | 类型 |');
    lines.push('|----|------|------|------|------|');
    for (const e of list) {
      const id = e._remote ? `[${e.id}](${e._path})` : `\`${e.id}\``;
      lines.push(`| ${id} | ${e.name} | ${e.summary} | ${e.author} | ${e.kind} |`);
    }
    lines.push('');
  }
  if (errors.length) {
    lines.push('## 校验问题');
    lines.push('');
    for (const er of errors) lines.push(`- ${er}`);
    lines.push('');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`Usage: node scripts/scan.mjs [--local] [--remote] [--out <dir>] [--help]

  --local    Scan ./experts recursively (default, offline)
  --remote   Query GitHub for topic:dsh-expert (needs network; GITHUB_TOKEN optional)
  --out DIR  Output directory (default: repo root)
  --help     Show this help`);
    return;
  }
  const outIdx = args.indexOf('--out');
  const outDir = outIdx >= 0 ? resolve(args[outIdx + 1]) : REPO_ROOT;
  const remote = args.includes('--remote');
  const local = args.includes('--local') || !remote;

  let entries = [];
  const errors = [];
  const sources = [];
  if (local) {
    const r = await scanLocal();
    entries = entries.concat(r.entries);
    errors.push(...r.errors);
    sources.push('local');
  }
  if (remote) {
    const r = await scanRemote();
    entries = entries.concat(r.entries);
    errors.push(...r.errors);
    sources.push('remote');
  }

  const byCat = buildByCategory(entries);
  const generatedAt = new Date().toISOString();
  const catalog = {
    generatedAt,
    sources,
    total: entries.length,
    categories: byCat,
    errors,
  };
  const md = renderMarkdown(byCat, generatedAt, errors, sources.join('+'));

  await writeFile(join(outDir, 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  await writeFile(join(outDir, 'CATALOG.md'), md, 'utf8');

  const ok = entries.length - errors.filter((e) => !e.includes(': no valid frontmatter')).length;
  console.log(`[scan] sources=${sources.join('+')} entries=${entries.length} errors=${errors.length}`);
  console.log(`[scan] wrote catalog.json + CATALOG.md to ${outDir}`);
  for (const e of errors) console.log(`  ! ${e}`);
}

main().catch((e) => {
  console.error('[scan] fatal:', e);
  process.exit(1);
});
