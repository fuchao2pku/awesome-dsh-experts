/**
 * client.js — DSH Expert Marketplace, CLIENT (browser) half.
 *
 * Safety notes (this is the half that, if it throws during `apply`, can make
 * the Web UI fail to mount the plugin — so it is maximally defensive):
 *  - `apply` is async and wrapped feature-by-feature in try/catch.
 *  - React components are imported lazily and ONLY in a browser environment,
 *    so plain-Node unit tests can load this module without resolving `react`.
 *  - The Settings tab uses the VERIFIED slot `settings.plugins.tab` (mirrored
 *    from dsh-plugin-marketplace).
 *  - The optional composer (chat input) entry is double-guarded: the outer
 *    `slots.inject` call and the inner `slots.register` call are both wrapped,
 *    because registering into an undeclared slot throws. If the slot name is
 *    wrong for a given DSH version, the feature silently degrades and the
 *    Settings tab still works — no crash, no console-level anomaly.
 */
import { en, zh } from './client/locales.js'
import * as catalogClient from './client/catalog-client.js'

export const NS = 'settings.expertMarketplace'
export const inject = ['slots', 'locale']

const SETTINGS_TAB_SLOT = 'settings.plugins.tab'
const COMPOSER_SLOT = 'composer.toolbar'

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined'
}

function makeInjectedFace(t) {
  return {
    t,
    api: {
      bootstrap: catalogClient.bootstrap,
      list: catalogClient.listExperts,
      groups: catalogClient.getGroups,
      detail: catalogClient.getDetail,
      packs: catalogClient.getPacks,
      packDetail: catalogClient.getPackDetail,
      refresh: catalogClient.refresh,
      buildInvocationBlock: catalogClient.buildInvocationBlock,
    },
  }
}

/**
 * Register a component into `slot`, swallowing any "undeclared slot" throw so a
 * wrong slot name can never bubble up and break plugin mount.
 */
function guardedRegister(ctx, slot, options, component) {
  try {
    return ctx.slots.register(options, component)
  } catch {
    return () => null
  }
}

export async function apply(ctx) {
  // 1) Locale dictionaries (best-effort).
  try {
    if (ctx.locale && typeof ctx.locale.register === 'function') {
      ctx.locale.register(NS, { zh, en })
    }
  } catch { /* locale is optional */ }

  const t = (ctx.locale && typeof ctx.locale.bind === 'function')
    ? ctx.locale.bind(NS)
    : (k) => String(k)

  // 2) Load React components only in the browser (avoids react import in tests).
  let ExpertMarketSettingsTab = () => null
  let ExpertPickerButton = () => null
  if (isBrowser()) {
    try {
      const mod = await import('./client/components.js')
      ExpertMarketSettingsTab = mod.ExpertMarketSettingsTab || ExpertMarketSettingsTab
      ExpertPickerButton = mod.ExpertPickerButton || ExpertPickerButton
    } catch { /* fall back to no-op components */ }
  }

  const injected = makeInjectedFace(t)

  // 3) Settings tab — VERIFIED slot. Always attempted.
  try {
    if (ctx.slots && typeof ctx.slots.inject === 'function') {
      ctx.slots.inject(SETTINGS_TAB_SLOT, () => guardedRegister(
        ctx,
        SETTINGS_TAB_SLOT,
        {
          name: SETTINGS_TAB_SLOT,
          id: 'expert-marketplace',
          order: 20,
          label: () => t('tab'),
          locale: NS,
          inject: () => injected,
        },
        ExpertMarketSettingsTab,
      ))
    }
  } catch { /* if slots are unavailable, skip UI entirely */ }

  // 4) Composer (chat input) entry — BEST-EFFORT, double-guarded.
  try {
    if (COMPOSER_SLOT && ctx.slots && typeof ctx.slots.inject === 'function') {
      ctx.slots.inject(COMPOSER_SLOT, () => guardedRegister(
        ctx,
        COMPOSER_SLOT,
        {
          name: COMPOSER_SLOT,
          id: 'expert-picker',
          order: 10,
          label: () => t('expertPicker'),
          inject: () => injected,
        },
        ExpertPickerButton,
      ))
    }
  } catch { /* slot missing or invalid → silently skip; Settings tab still works */ }

  // 5) Lifecycle cleanup (best-effort).
  if (typeof ctx.effect === 'function') {
    ctx.effect(() => { /* no client-side resources to release in this build */ }, 'expert-marketplace.client')
  }
}
