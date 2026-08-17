/**
 * client.js — DSH Expert Marketplace, CLIENT (browser) half.
 *
 * ## DSH client bundle contract (critical)
 * DSH loads every client bundle through its ModuleLoader. The file MUST call
 * `window.__ModuleLoader__.load({ id, factory })` and the `factory` MUST return
 * `{ apply, inject }`. (This is the native DSH client bundle format — see any
 * first-party package such as `@deepseek-ai/dsh-client-ui-cordis`.) Failing to
 * register is exactly what makes the harness report "Failed to load plugins /
 * loaded without registering … via __ModuleLoader__.load". This plugin therefore
 * registers on load instead of relying on ESM `export`.
 *
 * ## Crash-safety (this is the half that can stop the Web UI from mounting)
 *  - The registration is guarded, so a missing loader can never throw at import.
 *  - Everything inside the factory is plain JS. `react` is required LAZILY
 *    inside `apply()` (via the `require` the loader handed the factory), so a
 *    plugin can never hard-crash the Web UI if react were somehow unavailable —
 *    at worst DSH reports a render failure on the tab only.
 *  - `apply()` is feature-by-feature try/catch. The Settings tab uses the
 *    VERIFIED slot `settings.section` (mirrored from the reference
 *    `dshmarket` client, which targets the same DeepSeek Harness web version
 *    this plugin is built for). The registration metadata shape
 *    `{ name, id, order, label, locale, inject }` matches that reference.
 *  - The composer (chat input) entry is double-guarded: the outer
 *    `slots.inject` and the inner `slots.register` are both wrapped, because
 *    registering into an undeclared slot throws. A wrong slot name for a given
 *    DSH version silently degrades and the Settings tab still works — no crash,
 *    no console-level anomaly. NOTE: deepseek-harness 0.1.0-rc.6 does not
 *    expose a composer input slot, so this entry is expected to degrade in
 *    that version; the Settings-tab clipboard flow remains the working path.
 */

const NS = 'settings.expertMarketplace'
const INJECT = ['slots', 'locale', 'theme']
const SETTINGS_TAB_SLOT = 'settings.section'
const COMPOSER_SLOT = 'composer.toolbar'

const CATEGORIES = [
  'coding', 'writing', 'design', 'data', 'devops',
  'legal', 'education', 'multimodal', 'general', 'team', 'uncategorized',
]
const KINDS = ['expert', 'pack']

const zh = {
  tab: '专家市场',
  title: 'Awesome DSH Experts · 专家市场',
  subtitle: '浏览社区贡献的 DSH 专家与专家团，一键复制提示词到对话。',
  searchPlaceholder: '搜索专家名称、描述、作者或标签…',
  all: '全部',
  experts: '单专家',
  packs: '专家团',
  groups: '分类',
  loading: '加载中…',
  empty: '暂无专家，请稍后刷新或检查目录源。',
  error: '加载失败：',
  retry: '重试',
  detail: '详情',
  back: '返回',
  importConversation: '引入对话',
  copied: '已复制提示词，请粘贴到输入框',
  copyFailed: '复制失败，请手动复制',
  category: '分类',
  author: '作者',
  version: '版本',
  license: '许可',
  integration: 'DSH 接入',
  members: '成员',
  orchestration: '协作方式',
  notFound: '未找到该专家',
  stale: '目录可能不是最新（远程拉取失败，已回退到缓存/内置）。',
  expertPicker: '专家',
  pickerPlaceholder: '选择要引入的专家 / 专家团…',
  pickerIntro: '点选后复制其调用提示到剪贴板，粘贴到输入框即可启用。',
}

const en = {
  tab: 'Expert Market',
  title: 'Awesome DSH Experts · Market',
  subtitle: 'Browse community DSH experts and expert groups; copy a prompt into your conversation.',
  searchPlaceholder: 'Search expert name, description, author, or tags…',
  all: 'All',
  experts: 'Experts',
  packs: 'Expert Groups',
  groups: 'Categories',
  loading: 'Loading…',
  empty: 'No experts yet. Refresh later or check the catalog source.',
  error: 'Failed to load: ',
  retry: 'Retry',
  detail: 'Detail',
  back: 'Back',
  importConversation: 'Add to chat',
  copied: 'Prompt copied — paste it into the input box',
  copyFailed: 'Copy failed; please copy manually',
  category: 'Category',
  author: 'Author',
  version: 'Version',
  license: 'License',
  integration: 'DSH integration',
  members: 'Members',
  orchestration: 'Orchestration',
  notFound: 'Expert not found',
  stale: 'Catalog may be stale (remote fetch failed; using cache/seed).',
  expertPicker: 'Experts',
  pickerPlaceholder: 'Select an expert / expert group to add…',
  pickerIntro: 'Pick one to copy its invocation hint to the clipboard, then paste it into the input.',
}

/* ----------------------------- API client ----------------------------- */

async function apiCall(method, params) {
  const response = await fetch('/api/expert-marketplace', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ method, ...(params === undefined ? {} : { params }) }),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result || !result.ok) {
    const message = result && result.error ? result.error.message : `HTTP ${String(response.status)}`
    throw new Error(message)
  }
  return result.value
}

function bootstrap() { return apiCall('bootstrap') }
function listExperts(opts) { return apiCall('list', opts) }
function getGroups() { return apiCall('groups') }
function getDetail(id) { return apiCall('detail', { id }) }
function getPacks() { return apiCall('packs') }
function getPackDetail(id) { return apiCall('packDetail', { id }) }
function refresh(currentDigest) { return apiCall('refresh', { currentDigest }) }

/**
 * Build the human-facing "invocation block" copied into the chat input so the
 * user can enable the expert without a fragile composer API. Safe against
 * missing fields and any malformed partial entry (degrades to empty string).
 */
function buildInvocationBlock(entry) {
  try {
    if (!entry) return ''
    const lines = []
    lines.push(`@expert ${entry.id}`)
    lines.push(`# ${entry.name}`)
    if (entry.summary) lines.push(entry.summary)
    if (entry.dsh_integration && entry.dsh_integration.entry) {
      lines.push(`触发方式：${entry.dsh_integration.entry}`)
    }
    if (entry.kind === 'pack') {
      const members = (entry.dsh_integration && entry.dsh_integration.members) || []
      if (members.length) lines.push(`专家团成员：${members.join(', ')}`)
      if (entry.dsh_integration && entry.dsh_integration.orchestration) {
        lines.push(`协作方式：${entry.dsh_integration.orchestration}`)
      }
    }
    return lines.join('\n')
  } catch {
    return ''
  }
}

/* --------------------------- React (lazy) --------------------------- */

let R = null // set by apply() via the loader-provided `require('react')`
function h(type, props, ...children) { return R.createElement(type, props, ...children) }
function useState(v) { return R.useState(v) }
function useEffect(fn, deps) { return R.useEffect(fn, deps) }
function useCallback(fn, deps) { return R.useCallback(fn, deps) }
function useRef(v) { return R.useRef(v) }

/* ----------------------------- components ----------------------------- */

function Spinner({ t }) {
  return h('div', { style: { padding: 16, opacity: 0.7 } }, t('loading'))
}

function ErrorBox({ message, t, onRetry }) {
  return h('div', { style: { padding: 16 } }, [
    h('div', { key: 'e', style: { color: '#e06c6c' } }, t('error') + (message || '')),
    h('button', { key: 'r', style: btnStyle, onClick: onRetry }, t('retry')),
  ])
}

function Toast({ text, onClose }) {
  if (!text) return null
  return h('div', {
    style: {
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      background: '#222', color: '#fff', padding: '10px 14px', borderRadius: 8,
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 9999,
    },
    onClick: onClose,
  }, text)
}

function ExpertCard({ entry, t, onOpen }) {
  return h('div', { style: cardStyle, onClick: () => onOpen(entry.id) }, [
    h('div', { key: 'n', style: { fontWeight: 600, marginBottom: 4 } }, entry.name),
    h('div', { key: 'k', style: { fontSize: 12, opacity: 0.6, marginBottom: 6 } },
      `[${entry.kind === 'pack' ? t('packs') : t('experts')}] · ${entry.category}`),
    h('div', { key: 's', style: { fontSize: 13, opacity: 0.85 } }, entry.summary || ''),
    h('div', { key: 'a', style: { fontSize: 12, opacity: 0.5, marginTop: 6 } }, `${t('author')}: ${entry.author}`),
  ])
}

function Detail({ entry, t, onBack, onImport }) {
  if (!entry) return h('div', null, t('notFound'))
  const di = entry.dsh_integration || {}
  const members = di.members || []
  return h('div', { style: { padding: 12, maxWidth: 720 } }, [
    h('button', { key: 'b', style: btnStyle, onClick: onBack }, t('back')),
    h('h3', { key: 't', style: { margin: '12px 0' } }, entry.name),
    h('p', { key: 's', style: { opacity: 0.85 } }, entry.summary || ''),
    h('p', { key: 'd', style: { opacity: 0.7 } }, entry.description || ''),
    h('div', { key: 'm', style: { fontSize: 13, opacity: 0.7, lineHeight: 1.8 } }, [
      h('div', { key: 'cat' }, `${t('category')}: ${entry.category}`),
      h('div', { key: 'au' }, `${t('author')}: ${entry.author}`),
      h('div', { key: 'v' }, `${t('version')}: ${entry.version}`),
      h('div', { key: 'l' }, `${t('license')}: ${entry.license}`),
      h('div', { key: 'i' }, `${t('integration')}: ${di.type || 'prompt-only'}${di.entry ? ` (${di.entry})` : ''}`),
    ]),
    entry.kind === 'pack'
      ? h('div', { key: 'mem', style: { marginTop: 10 } }, [
          h('div', { key: 'mh', style: { fontWeight: 600 } }, t('members')),
          h('div', { key: 'ml', style: { opacity: 0.8 } }, members.join(', ') || '—'),
          di.orchestration ? h('div', { key: 'mo', style: { marginTop: 6, opacity: 0.8 } }, `${t('orchestration')}: ${di.orchestration}`) : null,
        ])
      : null,
    h('button', { key: 'imp', style: { ...btnStyle, marginTop: 14 }, onClick: () => onImport(entry) }, t('importConversation')),
  ])
}

function ExpertMarketSettingsTab(props) {
  const { t, api } = props
  const [status, setStatus] = useState('loading')
  const [groups, setGroups] = useState({})
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [stale, setStale] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [kind, setKind] = useState('all')
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    setStatus('loading'); setError(null)
    try {
      const [boot, g] = await Promise.all([api.bootstrap(), api.groups()])
      setGroups(g || {})
      setList(boot && boot.list ? boot.list : null)
      setStale(!!(boot && boot.stale))
      setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setStatus('error')
    }
  }, [api])

  useEffect(() => { load() }, [load])

  const runSearch = useCallback(async () => {
    setStatus('loading')
    try {
      const r = await api.list({ query, category, kind, page: 1, pageSize: 50 })
      setList(r); setStatus('ready')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e)); setStatus('error')
    }
  }, [api, query, category, kind])

  const openDetail = useCallback(async (id) => {
    try { const entry = await api.detail(id); setSelected(entry) }
    catch (e) { setToast(e instanceof Error ? e.message : String(e)) }
  }, [api])

  const doImport = useCallback((entry) => {
    const block = api.buildInvocationBlock ? api.buildInvocationBlock(entry) : `@expert ${entry.id}`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(block)
        setToast(t('copied'))
      } else { setToast(t('copyFailed')) }
    } catch { setToast(t('copyFailed')) }
  }, [api, t])

  if (selected) {
    return h(Detail, { entry: selected, t, onBack: () => setSelected(null), onImport: doImport })
  }

  let body
  if (status === 'loading') body = h(Spinner, { t })
  else if (status === 'error') body = h(ErrorBox, { message: error, t, onRetry: load })
  else {
    const items = (list && list.items) || []
    const cards = items.length
      ? items.map((e) => h(ExpertCard, { key: e.id, entry: e, t, onOpen: openDetail }))
      : [h('div', { key: 'empty', style: { padding: 16, opacity: 0.7 } }, t('empty'))]
    body = h('div', null, [
      h('div', { key: 'toolbar', style: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 8 } }, [
        h('input', {
          key: 'q', style: inputStyle, placeholder: t('searchPlaceholder'), value: query,
          onChange: (e) => setQuery(e.target.value),
        }),
        h('select', {
          key: 'c', style: inputStyle, value: category,
          onChange: (e) => setCategory(e.target.value),
        }, CATEGORIES.map((c) => h('option', { key: c, value: c }, c))),
        h('select', {
          key: 'k', style: inputStyle, value: kind,
          onChange: (e) => setKind(e.target.value),
        }, ['all', ...KINDS].map((k) => h('option', { key: k, value: k }, k))),
        h('button', { key: 's', style: btnStyle, onClick: runSearch }, '🔍'),
        h('button', { key: 'r', style: btnStyle, onClick: load }, t('retry')),
      ]),
      stale ? h('div', { key: 'stale', style: { color: '#d9a441', marginBottom: 8 } }, t('stale')) : null,
      h('div', { key: 'grid', style: { display: 'flex', flexWrap: 'wrap' } }, cards),
    ])
  }

  return h('div', { style: { padding: 12 } }, [
    h('div', { key: 'head' }, [
      h('h2', { key: 'title', style: { margin: '0 0 4px' } }, t('title')),
      h('div', { key: 'sub', style: { opacity: 0.7, fontSize: 13 } }, t('subtitle')),
    ]),
    h(Toast, { key: 'toast', text: toast, onClose: () => setToast(null) }),
    body,
  ])
}

function ExpertPickerButton(props) {
  const { t, api } = props
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])
  const [toast, setToast] = useState(null)

  const toggle = useCallback(async () => {
    if (!open && items.length === 0) {
      try {
        const [list, packs] = await Promise.all([api.list({ page: 1, pageSize: 100 }), api.packs()])
        const merged = [...((list && list.items) || []), ...(packs || [])]
        setItems(merged)
      } catch { setItems([]) }
    }
    setOpen((v) => !v)
  }, [open, items.length, api])

  const pick = useCallback((entry) => {
    const block = api.buildInvocationBlock ? api.buildInvocationBlock(entry) : `@expert ${entry.id}`
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(block); setToast(t('copied'))
      } else { setToast(t('copyFailed')) }
    } catch { setToast(t('copyFailed')) }
    setOpen(false)
  }, [api, t])

  return h('div', { style: { position: 'relative', display: 'inline-block' } }, [
    h('button', {
      key: 'btn', style: { ...btnStyle, background: 'var(--dsh-card,#1c1c1c)', color: 'inherit' }, onClick: toggle,
    }, `🧠 ${t('expertPicker')}`),
    open
      ? h('div', {
          key: 'pop',
          style: {
            position: 'absolute', bottom: '110%', left: 0, minWidth: 240, maxHeight: 320, overflowY: 'auto',
            border: '1px solid var(--dsh-border,#2a2a2a)', borderRadius: 8, background: 'var(--dsh-card,#1c1c1c)', padding: 6, zIndex: 50,
          },
        }, [
          h('div', { key: 'intro', style: { fontSize: 12, opacity: 0.6, marginBottom: 4 } }, t('pickerIntro')),
          ...(items.length ? items.map((e) => h('div', {
            key: e.id, style: { padding: '6px 8px', cursor: 'pointer', borderRadius: 4 },
            onClick: () => pick(e),
          }, `${e.name} · ${e.kind === 'pack' ? t('packs') : t('experts')}`)) : [h('div', { key: 'none', style: { opacity: 0.6, padding: 6 } }, t('empty'))]),
        ])
      : null,
    h(Toast, { key: 'toast', text: toast, onClose: () => setToast(null) }),
  ])
}

const cardStyle = {
  border: '1px solid var(--dsh-border, #2a2a2a)',
  borderRadius: 8,
  padding: 12,
  margin: 8,
  background: 'var(--dsh-card, #1c1c1c)',
  color: 'inherit',
  maxWidth: 280,
  cursor: 'pointer',
}
const btnStyle = {
  border: '1px solid var(--dsh-border, #2a2a2a)',
  borderRadius: 6,
  padding: '6px 10px',
  background: 'var(--dsh-accent, #3a6df0)',
  color: '#fff',
  cursor: 'pointer',
}
const inputStyle = {
  padding: '6px 10px', borderRadius: 6, border: '1px solid var(--dsh-border, #2a2a2a)', background: 'var(--dsh-input, #111)', color: 'inherit', minWidth: 220,
}

/* ------------------------------- apply ------------------------------- */

let moduleRequire = null // set by the loader when it calls `factory(require)`

function makeInjectedFace(t) {
  return {
    t,
    api: {
      bootstrap,
      list: listExperts,
      groups: getGroups,
      detail: getDetail,
      packs: getPacks,
      packDetail: getPackDetail,
      refresh,
      buildInvocationBlock,
    },
  }
}

/**
 * Register a component into `slot`, swallowing any "undeclared slot" throw so a
 * wrong slot name can never bubble up and break plugin mount.
 */
function guardedRegister(ctx, options, component) {
  try {
    return ctx.slots.register(options, component)
  } catch {
    return () => null
  }
}

function apply(ctx) {
  // 1) Locale dictionaries (best-effort).
  try {
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.locale.register(NS, { zh, en })
    }
  } catch { /* locale is optional */ }

  // 2) Resolve react lazily. If it is unavailable the UI degrades gracefully
  //    (DSH reports a render failure on the tab) but the plugin still loads.
  try {
    if (moduleRequire) R = moduleRequire('react')
  } catch { R = null }

  const t = (ctx.locale && typeof ctx.locale.bind === 'function')
    ? ctx.locale.bind(NS)
    : (k) => String(k)

  const injected = makeInjectedFace(t)

  // 3) Settings tab — VERIFIED slot `settings.section` (per dshmarket, the
  //    reference client for this harness version). Always attempted.
  //    The component element is built from closure values (t, api) like
  //    dshmarket does, so it never depends on how the harness passes `inject`
  //    results as props — eliminating any chance of an undefined `api` crash.
  try {
    if (ctx.slots && typeof ctx.slots.inject === 'function') {
      ctx.slots.inject(SETTINGS_TAB_SLOT, () => guardedRegister(
        ctx,
        {
          name: SETTINGS_TAB_SLOT,
          id: 'expert-marketplace',
          order: 50,
          label: () => t('tab'),
          locale: NS,
          inject: () => injected,
        },
        () => h(ExpertMarketSettingsTab, { t, api: injected.api }),
      ))
    }
  } catch { /* if slots are unavailable, skip UI entirely */ }

  // 4) Composer (chat input) entry — BEST-EFFORT, double-guarded.
  try {
    if (COMPOSER_SLOT && ctx.slots && typeof ctx.slots.inject === 'function') {
      ctx.slots.inject(COMPOSER_SLOT, () => guardedRegister(
        ctx,
        {
          name: COMPOSER_SLOT,
          id: 'expert-picker',
          order: 10,
          label: () => t('expertPicker'),
          inject: () => injected,
        },
        () => h(ExpertPickerButton, { t, api: injected.api }),
      ))
    }
  } catch { /* slot missing or invalid → silently skip; Settings tab still works */ }

  // 5) Lifecycle cleanup (best-effort).
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => { /* no client-side resources to release in this build */ }, 'expert-marketplace.client')
  }
}

/* --------------------------- ModuleLoader --------------------------- */

const spec = {
  id: 'dsh-expert-marketplace',
  factory: function (require) {
    moduleRequire = require
    const module = { exports: {} }
    const exports = module.exports
    exports.apply = apply
    exports.inject = INJECT
    exports.buildInvocationBlock = buildInvocationBlock
    return module.exports
  },
}

if (typeof window !== 'undefined' && window.__ModuleLoader__) {
  window.__ModuleLoader__.load(spec)
}
