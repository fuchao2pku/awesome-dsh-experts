/**
 * Test helper: load the client bundle the same way DSH's ModuleLoader does.
 *
 * DSH executes a client bundle and expects it to call
 * `window.__ModuleLoader__.load({ id, factory })`, then calls `factory(require)`
 * to obtain `{ apply, inject, ... }`. We emulate that contract in plain Node so
 * the client half is testable without a browser and without resolving `react`.
 */
export async function loadClientModule(reactStub) {
  const react = reactStub || {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (v) => ({ current: v }),
  }

  let captured = null
  const prevWindow = globalThis.window
  globalThis.window = {
    __ModuleLoader__: {
      load: (spec) => {
        captured = spec.factory((id) => {
          if (id === 'react') return react
          throw new Error(`module not provided by test stub: ${id}`)
        })
      },
    },
  }
  try {
    // Cache-bust so repeated loads re-run the registration.
    await import(`../src/client.js?t=${Date.now()}-${Math.random()}`)
  } finally {
    globalThis.window = prevWindow
  }

  if (!captured) {
    throw new Error('client.js did not register via window.__ModuleLoader__.load')
  }
  return captured
}

/**
 * Build a fake Cordis client ctx. `register` records every call and can be made
 * to throw for an "undeclared" slot name (mimicking DSH's real behaviour).
 */
export function makeCtx({ withSlots = true, withLocale = true, throwSlot = null } = {}) {
  const registerCalls = []
  let injected = []
  const ctx = {
    slots: withSlots
      ? {
          inject: (slot, factory) => {
            injected.push(slot)
            return factory()
          },
          register: (options, component) => {
            registerCalls.push({ options, component })
            if (throwSlot && options.name === throwSlot) {
              throw new Error(`undeclared slot: ${options.name}`)
            }
            return component
          },
        }
      : null,
    locale: withLocale
      ? {
          register: () => {},
          bind: () => (k) => String(k),
        }
      : null,
    effect: () => {},
  }
  return { ctx, registerCalls, injected }
}
