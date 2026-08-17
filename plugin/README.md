# dsh-expert-marketplace

An **out-of-tree DSH bundle** that brings the [Awesome DSH Experts](https://github.com/fuchao2pku/awesome-dsh-experts) catalog (community **experts** and **expert groups**) into the DeepSeek Harness **Web UI** — without any changes to deepseek-harness itself.

> DSH ("everything is a plugin") ships with no first-class "Expert / Expert Group" concept. This bundle fills that gap: a **Settings → section** tab (the same `settings.section` slot the reference **[dshmarket](https://github.com/dsh-market/dsh-market)** client uses) to browse and copy experts, plus an optional **compose-box entry** to inject an installed expert group into the chat.

## What it does

- **Settings → section tab** — browse the catalog by category/kind, search, view details, and copy a ready-to-paste `@expert <id>` invocation block. Registered into the verified `settings.section` slot.
- **Composer entry (chat input)** — an optional button that opens a picker and copies an expert/group invocation block into the chat input. **Note:** deepseek-harness `0.1.0-rc.6` does not expose a composer input slot, so this entry is expected to silently degrade in that version; the Settings-tab clipboard flow is the working path. The slot is configurable (`DSH_EXPERT_MARKETPLACE_COMPOSER_SLOT`).
- **Same-origin HTTP API** — `POST /api/expert-marketplace` with methods `bootstrap`, `list`, `detail`, `groups`, `refresh`, `packs`, `packDetail`.
- **Agent tools** — registers `expert_list` / `expert_detail` tools (best-effort, only when `@deepseek-ai/dsh-tools` is available).

## Install

```bash
dsh plugin --profile web add <path-or-git-url-to>/awesome-dsh-experts/plugin
```

Then restart the Web profile. The plugin reads its catalog from the published
`catalog.json` (overridable, see below) and falls back to a **bundled seed** so
the UI works even with no network.

## Configuration

All options default sensibly and can be overridden via `cordis.patch.yml` or
environment variables:

| Option            | Env override                              | Default |
| ----------------- | ----------------------------------------- | ------- |
| `catalogUrl`      | `DSH_EXPERT_MARKETPLACE_CATALOG_URL`      | the published `catalog.json` |
| `maxAgeMs`        | —                                         | `172800000` (48h) |
| `timeoutMs`       | —                                         | `15000` |
| `maxBytes`        | —                                         | `5000000` |
| `composerSlot`    | `DSH_EXPERT_MARKETPLACE_COMPOSER_SLOT`    | `composer.toolbar` (set to `""` to disable) |
| `composerIntegration` | —                                    | `true` |
| `agentTools`      | —                                         | `true` |

## Safety design (why it won't crash your DSH install)

This bundle was written to the explicit contract: **installing it must never
crash the host or the Web UI.** Mechanisms:

- **Zero build step** — pure ESM JS, no `tsdown`/TypeScript compile, so there is
  no build failure surface and every file is directly loadable + testable in
  plain Node.
- **Defensive perimeters** — every external input (catalog JSON, HTTP params,
  agent-tool args, UI entries) is validated and never throws; failures become
  safe empty structures.
- **Lazy optional dependencies** — all `@deepseek-ai/*` packages and `react` are
  optional peer dependencies, imported lazily inside `try/catch`. Missing them
  degrades a feature, never the plugin.
- **Per-feature `try/catch` in `apply()`** — web server route, agent tools,
  system-prompt section, and UI tabs are each independently guarded; one failing
  feature never prevents the others (or the plugin mount).
- **Bundled seed catalog** — if the remote fetch fails, the last-good/seed
  catalog is served, so the Settings tab always renders.
- **Double-guarded composer slot** — Cordis throws when registering into an
  undeclared slot; both the `slots.inject` and `slots.register` calls are
  wrapped, so a wrong slot name for a given DSH version silently degrades the
  composer entry while the Settings tab keeps working.
- **Same-origin API guard** — cross-origin requests are rejected with a
  structured `403` instead of throwing.

## Tests

```bash
npm test          # runs all suites (node --test, no external deps)
npm run test:verbose
```

27 tests cover: catalog model (parsing/validation/query/grouping), host route
handler (every error path returns structured JSON, never throws), lifecycle
(`apply()` survives a down network / missing services), client half (`apply()`
never throws, degrades gracefully when slots/locale/composer are absent, never
imports `react` in Node), and the client `buildInvocationBlock`.
