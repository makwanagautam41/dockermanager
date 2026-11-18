# DockerManager: Refactor & Feature Upgrade

## 0. Role and working rules

You are a senior full-stack engineer working on **DockerManager** (backend container: `dockermanager-backend`, port `22443`, DB: `postgres:16`).

Before writing any code:

1. Scan the whole repository and summarize the stack, folder structure, routes, API endpoints, shared components and services.
2. Produce a short plan (phases below) and list anything ambiguous.
3. Work phase by phase. After each phase, confirm the app builds and runs.

Rules:

- Do not break existing working features (container list, start/stop, logs, etc.).
- Do not delete a shared component, service or util until you have confirmed nothing remaining uses it.
- Prefer small, typed, reusable modules over large files.
- Everything optional or AI-driven must stay in the **user's hands**: nothing runs automatically unless the user clicks it, and defaults stay as they are.

---

## 1. Remove pages

Remove these pages completely (route, sidebar/nav item, page component, page-only components, page-only API endpoints, state, styles, tests, dead imports):

- [ ] Dashboard
- [ ] Metrics
- [ ] Alerts
- [ ] AI Assistant
- [ ] Settings

Notes:

- Set a sensible new landing page, for example **Containers**.
- **Ollama is still needed** (see section 5), so remove the AI Assistant _page_ but keep a reusable `ollamaClient` service.
- Because Settings is removed, Ollama configuration (base URL, model) must live somewhere else: a small "AI settings" popover inside the YAML page, backed by env defaults (for example `OLLAMA_BASE_URL=http://localhost:11434`).
- If any removed page's logic is used by a remaining page, move it into a shared module instead of deleting it.

---

## 2. "Create from YAML": full page instead of popup

Replace the popup/modal with a dedicated full page (for example `/create/yaml`).

### Layout (desktop)

```
┌──────────────────────────────────────────────────────────────┐
│ Header: breadcrumb · page title · [Analyze] [AI Analyze] [Deploy] │
├───────────────┬─────────────────────────┬────────────────────┤
│ LEFT          │ CENTER                  │ RIGHT              │
│ Option panel  │ YAML editor             │ Analysis results   │
│ (cards + "?") │ (line numbers, markers) │ errors/warn/tips   │
└───────────────┴─────────────────────────┴────────────────────┘
```

- Roughly 3 columns, resizable and collapsible, with clear spacing (8px grid) and consistent padding.
- No cramped or hidden controls. Use collapsible sections, sticky headers, internal scroll per pane.
- Tablet/mobile: stack panes into tabs (Options / YAML / Analysis).
- Include loading, empty and error states for every pane.

---

## 3. Left panel: option cards with help ("?") on everything

Every option shown in the left panel must have a **description** and a **"?" help icon** (hover/click/keyboard-focus popover) answering:

1. **What is this?** (plain-language description)
2. **What is it used for?**
3. **What happens if I use it?**
4. **What happens if I don't (default)?**
5. **Example value**
6. **Risk/notes** (for example "exposes port to the whole network", "data is lost without a volume")

Create a **single source of truth**: a metadata registry, one entry per YAML key.

```ts
type OptionMeta = {
  key: string; // e.g. "services.*.restart"
  label: string;
  type: 'string' | 'number' | 'boolean' | 'enum' | 'list' | 'map';
  description: string;
  whenToUse: string;
  ifUsed: string;
  ifOmitted: string;
  example: string;
  defaultValue?: string;
  riskLevel?: 'none' | 'low' | 'medium' | 'high';
  riskNote?: string;
  docsUrl?: string;
};
```

Cover all common Compose keys at minimum:

- Top-level: `name`, `services`, `networks`, `volumes`, `configs`, `secrets`
- Service: `image`, `build` (context, dockerfile, args, target), `container_name`, `command`, `entrypoint`, `ports`, `expose`, `environment`, `env_file`, `volumes`, `networks`, `depends_on` (+ conditions), `restart`, `healthcheck`, `labels`, `user`, `working_dir`, `privileged`, `cap_add/cap_drop`, `deploy.resources` (limits/reservations), `logging`, `extra_hosts`, `dns`, `profiles`, `platform`, `read_only`, `tmpfs`, `stop_grace_period`

Behavior:

- Left panel and YAML are **two-way synced**. Editing a field updates the YAML, and editing the YAML updates the fields.
- Each option card has an "Add to YAML" / "Remove" toggle.
- Include a search box in the panel plus a filter by category (Basic / Networking / Storage / Health / Resources / Security / Advanced).

---

## 4. Pasted YAML: built-in rule-based analyzer (NO AI)

When the user pastes or uploads a ready-made YAML, run an internal deterministic engine (no network, no AI) and show the result in the left panel and the right panel.

### Engine requirements

- Parse with a YAML library that preserves **line/column positions**, so issues can point to exact lines in the editor.
- Validate against the Compose schema (structure, types, unknown keys).
- Extract and display a **configured-setup summary** in the left panel:
  - services (name, image:tag, build)
  - published/exposed ports
  - volumes (named / bind mounts)
  - networks per service
  - environment variables (mask values that look like secrets)
  - `depends_on` graph
  - healthchecks, restart policy, resource limits
- Show each detected option as an **already-enabled card**, with its "?" help.

### Built-in rules (each with severity, message, line, suggested fix)

- **Errors:** invalid YAML syntax, unknown or misspelled keys, wrong types, undefined network/volume/service references, `depends_on` cycles, duplicate container names or ports inside the file.
- **Warnings:**
  - image uses `latest` or has no tag
  - no `restart` policy
  - no `healthcheck` on DB or backend-type services
  - `privileged: true`
  - hardcoded passwords/tokens in `environment`
  - ports published on `0.0.0.0` for databases
  - no named volume for a database
  - no resource limits
- **Live-state conflicts (check the real Docker daemon):**
  - host port already in use by a running container (for example 3306, 5432 and 8000 are taken on this machine)
  - `container_name` already exists
  - the referenced external network doesn't exist
- **Tips:** naming consistency, grouping into networks, using `.env` files.

Show findings grouped by severity with counts, and clicking a finding jumps to the line in the editor. Provide "Apply fix" only where the fix is safe and deterministic.

---

## 5. Optional AI analysis with Ollama (user-controlled)

Add a separate **"Analyze with AI (Ollama)"** button. It must be:

- **Off by default.** Never called automatically, and never on paste or save.
- Clearly separate from the built-in analyzer.

Flow:

1. User clicks the button, and the app checks Ollama health (`/api/tags`) and lists installed models in a dropdown.
2. User picks a model and optionally the focus: _Improve options · Naming conventions · Security · Performance · All_.
3. Before sending, show a **privacy note** and offer an option to **mask secret values** (default on).
4. The prompt sent includes the YAML plus the rule-engine findings, and asks for **structured JSON** (list of suggestions).
5. Display each suggestion as a card: _what to change · why · before/after diff · confidence_.
6. The user can **Accept / Reject** per suggestion or "Accept all". Nothing is applied automatically.
7. Provide **Undo / revert to original**, and keep the original YAML in history.

Error handling:

- If Ollama is unreachable, show a clear message and keep everything else working.
- Add a timeout and a cancel button. If the model returns invalid JSON, show the raw text with a "couldn't parse" notice and don't touch the YAML.

---

## 6. Dependency integrity between pages and features

Features depend on each other (1 → 2 → 3). **If a dependency is broken, its dependents must not work or show misleading data.**

Implement a central **dependency/health gate**:

```ts
// each feature declares what it requires
const featureGraph = {
  dockerEngine: [],
  containerList: ['dockerEngine'],
  containerFilters: ['containerList'],
  networkView: ['dockerEngine', 'containerList'],
  yamlLiveChecks: ['dockerEngine'],
  yamlDeploy: ['yamlValidation', 'dockerEngine'],
  aiAnalysis: ['ollamaReachable', 'yamlParsed'],
};
```

Rules:

- A central status store tracks each node: `ok | loading | degraded | failed`.
- If a node is `failed`, **every dependent is disabled**, with a visible reason, for example _"Unavailable: Docker engine is not reachable"_, and a **Retry** action.
- No stale cached data presented as live. No blank screens or silent failures.
- Independent features must keep working (for example the YAML editor and built-in analyzer work even if Docker is down, but Deploy and live conflict checks are disabled with an explanation).
- Deploy is blocked until validation has no **errors**, and the user must confirm warnings.
- Add a global status indicator in the header (Docker: connected · Ollama: optional/connected).
- Add tests for this logic.

---

## 7. Built-in container filtering (from real container data)

Build a filter system on the **Containers** page, derived from live Docker data (`docker ps -a` / inspect: name, image, command, status, health, ports, networks, labels, created, compose project).

### Auto-categorization (rule-based, extensible)

Classify using image name, container name, exposed ports and labels:

| Category                    | Detection hints (image / name / port)              |
| --------------------------- | -------------------------------------------------- |
| **Databases: MySQL**        | image contains `mysql`/`mariadb`, port 3306/33060  |
| **Databases: PostgreSQL**   | image contains `postgres`, port 5432               |
| **Cache / Queue**           | `redis`, `valkey`, `memcached`, `rabbitmq`         |
| **Backend / API**           | name or image contains `backend`, `api`, `server`  |
| **AI / ML**                 | `ollama`, `machine-learning`, `rocm`, `cuda`       |
| **Management tools**        | `portainer`, `traefik`, `nginx-proxy`              |
| **Cloud emulators / infra** | `floci`, `localstack`, `minio`                     |
| **Web apps**                | other apps with HTTP ports (for example `trilium`) |

Example mapping for the current machine (use as a test fixture):

- `floci` → Cloud emulator
- `trilium` → Web app
- `immich_server` → Backend / Web app (project: immich)
- `immich_postgres` → PostgreSQL (image path contains `postgres`)
- `immich_machine_learning` → AI/ML
- `immich_redis` → Cache
- `pdftools-backend`, `ollama-chat-backend`, `dockermanager-backend-1` → Backend
- `mysql`, `mysqllearningdb`, `datacleaningdb` → MySQL
- `dockermanager-prod-db` → PostgreSQL
- `portainer` → Management tool

### Filters (faceted, with live counts)

- Category (multi-select chips: MySQL, PostgreSQL, Backend, ...)
- Status: running / exited / paused / restarting
- Health: healthy / unhealthy / starting / none
- Network, Compose project (`com.docker.compose.project`), image, published port, host port range
- Created / uptime ("older than 1 month")
- Free-text search across name, image, port, ID

Behavior:

- Multi-select with AND across facets and OR within a facet.
- Active filters shown as removable chips, with a "Clear all" button.
- Filter state saved in the URL query so it's shareable and survives refresh.
- Users can override the category or add custom tags per container (stored in the backend or a label), and overrides win over auto-detection.
- Offer a "Save this filter" option for quick views.
- Table + card view toggle, with sortable columns, and bulk actions (start/stop/restart) on filtered results with a confirmation.

---

## 8. Networking visualization (AWS/GCP/Azure-console style)

Add a **Networks** section so the user can see which containers are connected to which network.

### 8.1 Network list

Table: name · driver · scope · subnet · gateway · internal? · # containers · compose project. Includes search and sort.

### 8.2 Network detail (drill-down)

- Overview card (subnet, gateway, driver, options, labels).
- Connected containers table: name · IP · MAC · aliases · published ports · status.
- Actions available: connect/disconnect container (with confirmation).

### 8.3 Topology view

- Interactive graph: **networks as grouped zones**, **containers as nodes**, with edges/membership lines.
- A container on multiple networks is shown bridging them (this is the key insight users need).
- Hover shows details, click highlights its connections and opens a side detail panel.
- Filter by network, category or project; zoom, pan, fit-to-screen, legend, and a table toggle for accessibility.
- Port exposure is visible, with badges for "published to host (0.0.0.0)" vs "internal only".

### 8.4 Insights

- Containers on the default `bridge` (no DNS name resolution).
- Isolated containers (no network).
- Databases exposed on `0.0.0.0`.
- Containers that can't talk to each other (no shared network), with a simple "can A reach B?" checker.

### 8.5 Console-style navigation

- Left sidebar (Containers · Networks · Create from YAML, plus Images/Volumes if they already exist), top breadcrumbs, a global search, and consistent resource detail pages.
- Cross-linking everywhere: container → its networks → other containers on that network.

Data sources: Docker API `network ls/inspect` and container inspect (`NetworkSettings.Networks`). Cache briefly and provide a manual refresh and optional auto-refresh.

---

## 9. UI/UX standards (apply everywhere)

- Consistent spacing scale (8px grid), typography hierarchy and color tokens, with dark and light support if already present.
- Aligned components, no overlapping or clipped content, no horizontal scroll at common widths.
- Visible primary actions, secondary actions grouped, and destructive actions confirmed.
- Keyboard accessible (focus rings, tooltip on focus, ARIA labels), with sufficient contrast.
- Skeleton loaders, helpful empty states, and actionable error messages.

---

## 10. Code quality

- Clear folder structure by feature (`features/yaml`, `features/containers`, `features/networks`, `core/health`).
- Strong typing, no dead code, no unused dependencies after removing pages.
- Unit tests for the YAML analyzer rules, the categorizer (using the fixture above) and the dependency gate. Add component tests for the filter and network views.
- Update the README with the new structure and features.

---

## 11. Phases and deliverables

1. **Audit + plan:** repo summary, dependency map, risks.
2. **Cleanup:** remove the 5 pages and verify the build.
3. **Core:** dependency/health gate and shared status store.
4. **Containers:** categorization engine and filters.
5. **Networks:** list, detail, topology, insights.
6. **YAML page:** full-page layout, option registry with help, two-way sync.
7. **Analyzer:** rule engine with live-state checks.
8. **Ollama:** optional AI analysis with accept/reject suggestions.
9. **Polish + tests + docs.**

After each phase, report: what changed, files touched, how to verify, and any open questions.

## 12. Acceptance checklist

- [ ] The 5 pages and their routes/nav/code are gone, and the app builds with no dead imports.
- [ ] Create-from-YAML is a full page, well spaced and aligned, with no popup.
- [ ] Every left-panel option has a working "?" help (what / use / if used / if omitted / example).
- [ ] Pasting a YAML populates the left panel and the findings through the **non-AI** engine.
- [ ] The Ollama analysis is opt-in, with per-suggestion accept/reject and undo.
- [ ] If a dependency fails, its dependents are disabled with a clear reason, while independent features keep working.
- [ ] Container filters work (category, status, health, network, project, port, search) with URL persistence.
- [ ] The network list, detail and topology views show which containers are connected to which networks.
- [ ] Tests pass, and the README is updated.
