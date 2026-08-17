/**
 * components.js — React components for the Expert Marketplace client half.
 *
 * Authored with React.createElement (no JSX, no build step) and inline style
 * objects (DSH forbids external stylesheets in client bundles; inline styles
 * are fine). Every data path is defensive: missing fields, empty catalogs, and
 * fetch failures render a message instead of throwing.
 *
 * `react` is imported normally; DSH's client loader resolves it from the
 * platform module table (declared in package.json `dsh.client.inject`). This
 * module is only ever imported in the browser (see client.js), so plain-Node
 * tests never load it.
 */
import React from 'react'
import { CATEGORIES, KINDS } from '../catalog.js'

const { useState, useEffect, useCallback } = React
const h = React.createElement

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

/** Main Settings → Plugins → Expert Market tab. */
export function ExpertMarketSettingsTab(props) {
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
        h('button', { key: 's', style: btnStyle, onClick: runSearch }, t('searchPlaceholder') ? '🔍' : 'Go'),
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

/** Best-effort composer (chat input) entry: a button that copies an expert's
 *  invocation hint to the clipboard. Wrapped by the client entry so a missing
 *  or differently-named slot can never crash the UI. */
export function ExpertPickerButton(props) {
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
