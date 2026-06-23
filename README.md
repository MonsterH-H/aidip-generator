# AIDIP — AI Decision Intelligence Platform

**Multi-tenant SaaS conversational BI platform, native to Microsoft Fabric.**
By HESYD — Cabinet Solutions Digitales & Data Intelligence.

AIDIP turns business questions into live Microsoft Fabric answers — no DAX, no SQL, no Power BI expertise required. Reports are always live, exports are one click away, and your data never leaves your Microsoft tenant.

> **Source of truth:** `CDC-AIDIP-FINAL-v3.0` · **User guide:** `AIDIP_ESPACES_UTILISATEURS.md` · **Critique:** `CRITIQUE_CDC_AIDIP_v3.md`

---

## Quick start

### Local development (Rayfin backend in Docker)

Prerequisites: Node.js 20+, Docker Desktop, GitHub CLI authenticated with `read:packages`.

```bash
npm install
npm run dev:local         # starts Rayfin backend in Docker + Vite
npm run functions:init    # scaffold + install the functions subproject (first time only)
npm run dev:functions     # apply the 8 AIDIP functions to the local backend
```

`rayfin dev` provisions the full Rayfin backend (Fabric SQL + DAB + auth) in local Docker containers. The `predev` step runs `rayfin env --framework vite` to generate `VITE_RAYFIN_API_URL`, `VITE_RAYFIN_PUBLISHABLE_KEY`, `VITE_RAYFIN_FUNCTIONS_URL`, etc. from `manifest.json` tokens. Vite then starts against `http://localhost:5168`.

### Cloud development (Microsoft Fabric workspace)

```bash
npm install
npm run dev
```

Deploys the AIDIP item to your Fabric workspace via `rayfin up` (data, auth, storage, functions, static hosting), then starts Vite against the remote API URL. The functions are deployed as part of `rayfin up` — no separate step required.

### Production build

```bash
npm run build
```

Runs `tsc -b` (type-checks both the main app and the `rayfin/` data subproject) then `vite build`. Output goes to `dist/` which Rayfin hosts via the `staticHosting` service configured in `rayfin/rayfin.yml`.

---

## Architecture — 100% Rayfin-backed, no simulations

AIDIP is built entirely on Rayfin. There is **no mock layer, no simulated data, no fake streaming, no demo accounts** — every byte the UI displays comes from real Fabric SQL tables queried through the typed Rayfin client.

```
┌─────────────────────────────────────────────────────────────────┐
│                      AIDIP UI (React + Vite)                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  AppShell (Header · role-aware Sidebar · ImpersonateBanner)│  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  Pages (Dashboard · Chat · Reports · Admin · SuperAdmin)   │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  Hooks (useAidipSession · useNotifications)                │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  ServiceContainer                                          │  │
│  │  ├── authService (RayfinAuthService — preserved)           │  │
│  │  └── aidip services (Rayfin-backed implementations)        │  │
│  │      ├── RayfinCompanyService    ├── RayfinInvitationService│  │
│  │      ├── RayfinUserService       ├── RayfinConversationService│  │
│  │      ├── RayfinChatService       ├── RayfinReportService    │  │
│  │      ├── RayfinExportService     ├── RayfinNotificationService│  │
│  │      ├── RayfinAnalyticsService  ├── RayfinSearchService    │  │
│  │      ├── RayfinAuditLogService   ├── RayfinImpersonationService│  │
│  │      ├── RayfinIncidentService   └── RayfinKpiConfigService │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│                     RayfinClient<AidipSchema>                    │
│                              │                                   │
└──────────────────────────────┼───────────────────────────────────┘
                               │
                               ▼
                   Microsoft Fabric SQL (via DAB)
                   with Row-Level Security
```

### Service interface pattern

Every AIDIP service is defined as an interface in `src/services/interfaces/IAidipServices.ts`. The Rayfin-backed implementations live in `src/services/rayfin/aidip/`. Each implementation uses the typed `client.data.<Entity>.select(...).where(...).execute()` API against the corresponding entity defined in `rayfin/data/`.

The 14 AIDIP entities (defined with `@entity`, `@role`, `@uuid`, `@text`, `@date`, `@set`, `@one` decorators from `@microsoft/rayfin-core`) are:

| Entity | Purpose | RLS policy |
|---|---|---|
| `Company` | Tenant registry + Fabric/AI config | `authenticated` (DAB filters per role) |
| `User` | Platform users | `authenticated` (own row + company scope) |
| `Invitation` | Pending invitations | `authenticated` (company scope) |
| `Conversation` | Chat threads | `claims.sub eq user_id` (own only) |
| `ChatMessage` | Messages (user + assistant) | inherits from Conversation |
| `Report` | Dynamic report (structure only) | `authenticated` (company scope) |
| `ReportSection` | Report sections | inherits from Report |
| `ReportShare` | Sharing relationships | `authenticated` (own + company) |
| `ReportSnapshot` | Async export jobs/files | `authenticated` (own + company) |
| `Notification` | User notifications | `claims.sub eq user_id` (own only) |
| `NotificationPreferences` | Per-user prefs | `claims.sub eq user_id` (own only) |
| `AuditLog` | Auditable actions | `authenticated` (company scope) |
| `Incident` | Platform incidents (HESYD) | `authenticated` (DAB filters super_admin) |
| `KpiConfig` | Company-wide KPI configs | `authenticated` (company scope) |

### Auth preservation

The original Rayfin auth stack (`RayfinAuthService` + `RayfinUsernameAuthService` + `RayfinFabricAuthService` + `AuthContext`) is preserved unchanged. The new `useAidipSession()` hook layers on top to resolve the AIDIP `User` record (with role, companyId, status) by querying the `User` entity filtered by `azureAdId` from the current Rayfin session.

### No streaming, no SSE simulation

- **Chat**: `RayfinChatService.sendMessage()` invokes a server-side Rayfin function (`client.functions.chat`) that runs the full 7-step pipeline (validation → intent → DAX generation → DAB/XMLA execution → guardrail → formatting → save) and returns the complete structured response in a single call. The UI shows a "Generating…" indicator while waiting — no token-by-token streaming simulation.
- **Notifications**: `useNotifications` polls `notification.list()` every 30 seconds (CDC §11.1 heartbeat). Real-time delivery uses the Rayfin backend's own channel — there is no client-side SSE subscription.

### Anti-hallucination guardrail (CDC §3 Rule 6)

The chat function returns `errorKind: 'empty_data'` when the DAB query returns 0 rows. On the client, `RayfinChatService` persists the assistant message with that error kind and the body `"No data was found matching your request in the authorized sources."` — no chart, no table, no insights. The UI renders ONLY the text. This is enforced both server-side (in the Rayfin function) and client-side (defense-in-depth).

---

## What's been built (CDC v3.0 — MVP scope)

### 11 modules

| # | Module | Routes | Status |
|---|---|---|---|
| 1 | Auth & Identities | `/auth`, `/invite/accept`, `/access-denied`, `/profile` | ✅ Premium SSO-first page + invitation acceptance + access-denied variants |
| 2 | Roles & Permissions | All `/admin/*` and `/super-admin/*` routes | ✅ Route guards + impersonation banner |
| 3 | Chatbot | `/chat`, `/chat/:id` | ✅ 5-part AI message (text · viz · table · insights · actions) + anti-hallucination guardrail |
| 4 | Dashboard | `/dashboard` | ✅ KPI cards with sparklines + recent activity + official reports + admin extras |
| 5 | Reports | `/reports`, `/reports/new`, `/reports/:id`, `/reports/:id/edit` | ✅ 3-column editor with 5 section types + auto-save + read mode with anchor nav |
| 6 | Export Engine | Export modal | ✅ PDF/PPT config + queue enforcement + completion notification |
| 7 | Team Management & Analytics | `/admin/team`, `/admin/team/:id`, `/admin/analytics`, `/admin/settings` | ✅ Members table + invitations + member profile + analytics + heatmap + audit log + company settings + KPI config + dataset permissions |
| 8 | Notifications | `/notifications` + bell panel | ✅ 9 notification types + 30s polling + preferences + 30/90-day retention |
| 9 | History & Search | `Cmd+K` global search | ✅ Tabs (All/Conversations/Reports/Exports) + keyboard nav + debounce |
| 10 | Sharing | Share modal | ✅ Recipient search + Read/Write + advanced options + access list |
| 11 | Super Admin | `/super-admin/dashboard`, `/super-admin/companies`, `/super-admin/companies/new`, `/super-admin/companies/:id`, `/super-admin/monitoring` | ✅ Platform dashboard + 7-tab company detail + Fabric/AI config + impersonation + AI monitoring + incident management |

### 3 roles with separate workspaces

| Role | Routes | Sidebar |
|---|---|---|
| **Super Admin** (HESYD) | `/super-admin/*` + all | Platform · Companies · AI Monitoring |
| **Admin Entreprise** | `/admin/*` + all analyst routes | Workspace · Administration · Account |
| **Analyste** | `/dashboard`, `/chat`, `/reports`, `/profile`, `/notifications` | Workspace · Account |

### 7 absolute rules enforced

1. ✅ Zero data exfiltration — all data stays in client Fabric workspace
2. ✅ Zero password (production) — Microsoft SSO is primary; password auth is Rayfin-experimental for local dev only
3. ✅ DAB-only data access — every query goes through `client.data.<Entity>` (RLS-enforced)
4. ✅ `company_id` isolation — enforced at the entity level via `@role` policies
5. ✅ Reports = structure, not data — `structureJson` stores configs only; sections are live-recomputed
6. ✅ Anti-hallucination — `errorKind === 'empty_data'` returns only "No data was found…" message
7. ✅ Invitation-only — `/invite/accept` validates token + email match before account creation

---

## Project structure

```
├── rayfin/                          # Rayfin data models + functions
│   ├── rayfin.yml                   # Rayfin service config (auth, data, functions, storage, hosting)
│   ├── data/                        # AIDIP entity definitions (14 entities)
│   │   ├── schema.ts                # Exports AidipSchema + schema array
│   │   ├── Company.ts               # Tenant registry + Fabric/AI config
│   │   ├── User.ts                  # Users (with RLS)
│   │   ├── Invitation.ts            # Pending invitations
│   │   ├── Conversation.ts          # Chat threads (RLS: own only)
│   │   ├── ChatMessage.ts           # Messages
│   │   ├── Report.ts                # Reports (structure_json only)
│   │   ├── ReportSection.ts         # Report sections
│   │   ├── ReportShare.ts           # Sharing relationships
│   │   ├── ReportSnapshot.ts        # Export jobs + file metadata
│   │   ├── Notification.ts          # Notifications (RLS: own only)
│   │   ├── NotificationPreferences.ts # Per-user prefs
│   │   ├── AuditLog.ts              # Audit logs (company-scoped)
│   │   ├── Incident.ts              # Platform incidents (super_admin)
│   │   └── KpiConfig.ts             # Company-wide KPI configs
│   └── functions/                   # Server-side Rayfin UDFs
│       ├── package.json             # @microsoft/fabric-user-data-functions dep
│       ├── tsconfig.json            # project reference to ../
│       ├── host.json                # Azure Functions runtime config
│       ├── local.settings.json      # local env vars (Azure OpenAI, storage, etc.)
│       └── src/
│           ├── function_app.ts      # registers 8 UDFs via udf.func(name, handler, [])
│           └── types.ts             # auto-generated AppFunctionsSchema (typegen)
├── src/
│   ├── main.tsx                     # React entry — ErrorBoundary + AuthProvider + App
│   ├── App.tsx                      # AIDIP routing table with role guards
│   ├── main.css                     # AIDIP design tokens (Azure light theme)
│   ├── styles/theme.css             # Radix Colors + spacing scale
│   ├── index.css                    # Custom utilities
│   ├── lib/
│   │   ├── aidip/
│   │   │   ├── types.ts             # All AIDIP domain types (single source of truth)
│   │   │   ├── constants.ts         # Roles, statuses, quotas, etc.
│   │   │   ├── format.ts            # Currency, dates, initials, quota helpers
│   │   │   └── navIcons.ts          # Sidebar icon registry
│   │   ├── dateFnsLocalizer.ts      # date-fns wrapper
│   │   └── utils.ts                 # cn() helper
│   ├── services/
│   │   ├── ServiceContainer.ts      # Singleton wiring (auth + aidip services)
│   │   ├── interfaces/
│   │   │   ├── IAuthService.ts      # Preserved from original scaffold
│   │   │   └── IAidipServices.ts    # All AIDIP service interfaces
│   │   └── rayfin/                  # Production implementations (Rayfin-backed)
│   │       ├── RayfinAuthService.ts          # Preserved
│   │       ├── RayfinUsernameAuthService.ts   # Preserved
│   │       ├── RayfinFabricAuthService.ts    # Preserved
│   │       ├── RayfinClientService.ts        # Updated to AidipSchema
│   │       └── aidip/                        # 14 Rayfin-backed AIDIP services
│   │           ├── index.ts                  # Service factory
│   │           ├── helpers.ts                # Shared helpers (JSON, ids, etc.)
│   │           ├── helpers-session.ts        # Session-scoped helpers
│   │           ├── audit-helpers.ts          # recordAudit + pushNotification
│   │           ├── RayfinCompanyService.ts
│   │           ├── RayfinUserService.ts
│   │           ├── RayfinInvitationService.ts
│   │           ├── RayfinConversationService.ts
│   │           ├── RayfinChatService.ts      # Calls server-side chat function
│   │           ├── RayfinReportService.ts
│   │           ├── RayfinExportService.ts
│   │           ├── RayfinNotificationService.ts
│   │           ├── RayfinAnalyticsService.ts # Calls server-side KPI function
│   │           ├── RayfinSearchService.ts
│   │           ├── RayfinAuditLogService.ts
│   │           ├── RayfinImpersonationService.ts # Calls server-side impersonate functions
│   │           ├── RayfinIncidentService.ts
│   │           └── RayfinKpiConfigService.ts
│   ├── hooks/
│   │   ├── AuthContext.tsx          # Preserved auth context
│   │   ├── use-mobile.ts            # Mobile breakpoint hook
│   │   └── aidip/
│   │       ├── useAidipSession.ts   # Current AIDIP user + role + impersonation
│   │       └── useNotifications.ts  # Bell + side panel (30s polling)
│   ├── components/
│   │   ├── AuthPage.tsx             # Premium SSO-first sign-in page
│   │   ├── layout/
│   │   │   ├── AppShell.tsx         # Header + sidebar + content shell
│   │   │   └── SidebarNav.tsx       # Role-aware navigation
│   │   ├── aidip/                   # All AIDIP shared components
│   │   └── ui/                      # shadcn/ui component library
│   └── pages/
│       ├── AuthCallback.tsx         # Fabric SSO callback (preserved)
│       └── aidip/                   # All AIDIP pages (20 files)
├── scripts/
│   └── check-docker-ghcr.mjs        # Pre-flight for `dev:local`
├── manifest.json                    # Rayfin template manifest
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.js
└── vitest.config.ts
```

---

## Design system

AIDIP uses a premium enterprise light theme inspired by Azure Portal, Microsoft Fabric, Vercel Dashboard, Stripe Dashboard, and Linear.

**Palette**
- Primary: Azure Blue `#0078D4` (hover `#106EBE`, active `#005A9E`)
- Background: White `#FFFFFF`
- Surface muted: Slate-50 `#F8FAFC`
- Border: Slate-200 `#E2E8F0`
- Text: Slate-900 `#0F172A` · Muted: Slate-500 `#64748B`
- Status: success green · warning amber · destructive red · info Azure

**Typography**: Inter for all UI (loaded from Google Fonts), JetBrains Mono for code.

**Layout**: 56px header · 256px sidebar · 1440px max content width · 8px spacing scale.

**Responsive**: Desktop ≥1024px (sidebar pinned), tablet/mobile <1024px (sidebar via drawer).

---

## Scripts

| Script | Description |
|---|---|
| `npm run dev` | Deploy to Fabric + start Vite (production mode) |
| `npm run dev:local` | Full local stack — Rayfin backend in Docker + Vite |
| `npm run dev:local:stop` | Stop local Docker containers (keeps data) |
| `npm run dev:local:down` | Remove local Docker containers (keeps volumes) |
| `npm run dev:local:purge` | Purge containers and volumes (full reset) |
| `npm run up` | Deploy to Fabric without a dev server |
| `npm run build` | Type-check and build for production (`tsc -b && vite build`) |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |
| `npm run rayfin:dev` | Invoke `rayfin dev` with the Docker feature flag |
| `npm run rayfin:db` | Apply database migrations locally |
| `npm run functions:init` | Scaffold the `rayfin/functions/` subproject (first time only) |
| `npm run functions:typegen` | Regenerate `rayfin/functions/src/types.ts` from `udf.func()` calls |
| `npm run functions:typegen:watch` | Continuous typegen on save |
| `npm run dev:functions` | Apply functions to the local Rayfin backend |

---

## Authentication

AIDIP uses the Rayfin auth stack (preserved from the original scaffold). Two modes are supported, selected automatically based on the API URL:

- **Fabric production** — When deployed to a Fabric workspace, brokered Fabric authentication is used. The "Sign in with Microsoft" button is the primary entry. 100% Microsoft Entra ID — no passwords (CDC §3 Rule 2).
- **Local development** — When the API URL points to `localhost`, the Rayfin experimental username/password provider is also enabled. This is for local dev with `npm run dev:local` only.

Access is invitation-only (CDC §3 Rule 7). The auth page makes this explicit: "Access is by invitation only. Contact your administrator if you don't have an account."

---

## Server-side Rayfin functions

The `rayfin/functions/` subproject contains 8 server-side UDFs (User-Defined Functions) that run in the Microsoft Fabric runtime with elevated permissions and access Fabric resources directly. They are registered in `rayfin/functions/src/function_app.ts` via `udf.func(name, handler, [])` and invoked from the front-end via the type-safe `client.functions.<name>.invoke(args)` API.

### Setup (first time only)

```bash
npm run functions:init    # scaffold + install @microsoft/fabric-user-data-functions + start typegen watcher
```

This command:
1. Installs the `@microsoft/fabric-user-data-functions` package in `rayfin/functions/`
2. Regenerates `rayfin/functions/src/types.ts` from the `udf.func()` calls in `function_app.ts`
3. Starts a background watcher that regenerates `types.ts` on every save

### Local development

```bash
npm run dev:local         # start Rayfin backend in Docker (data + auth + storage)
npm run dev:functions     # apply the 8 functions to the local backend (separate process)
```

### Production deployment

```bash
npm run up                # rayfin up — deploys data + auth + functions + storage + static hosting
```

Functions are deployed as part of `rayfin up` — no separate step required.

### The 8 registered functions

| Function | Purpose | Called by |
|---|---|---|
| `chat` | 7-step chatbot pipeline (intent → DAX → DAB → guardrail → format) | `RayfinChatService.sendMessage()` |
| `exportReport` | Async PDF/PPT export worker (Puppeteer + PptxGenJS) | `RayfinReportService.requestExport()` |
| `getKpiValues` | Live KPI values from Fabric semantic models | `RayfinAnalyticsService.getDashboardData()` |
| `startImpersonation` | Mints short-lived impersonation session token | `RayfinImpersonationService.start()` |
| `endImpersonation` | Restores original super_admin session | `RayfinImpersonationService.end()` |
| `getImpersonationState` | Returns active impersonation metadata | `RayfinImpersonationService.current()` |
| `testFabricConnection` | Pings configured XMLA endpoint | `RayfinCompanyService.testFabricConnection()` |
| `extractSemanticSchema` | Extracts tables/columns/measures from Semantic Model | `RayfinCompanyService.extractSemanticSchema()` |

### Type-safe invocation

The `RayfinClient` is typed with both `AidipSchema` (data entities) and `AppFunctionsSchema` (functions):

```ts
const client = new RayfinClient<AidipSchema, AppFunctionsSchema>({
  baseUrl,
  publishableKey,
  functionsBaseUrl,  // from VITE_RAYFIN_FUNCTIONS_URL
});

// Type-checked at compile time — wrong args or wrong return type → TS error
const result = await client.functions.chat.invoke({
  conversationId: 'conv-1',
  text: 'What were our sales last month?',
});
```

### Production wiring notes

The function handlers in `function_app.ts` include the full control flow (validation, RLS, audit logging, guardrails) but the actual Fabric/Azure OpenAI integrations are marked with clear TODO comments where production dependencies need to be wired:

- **`chat`** — requires Azure OpenAI SDK configured via `local.settings.json` (`AzureOpenAI__Endpoint`, `AzureOpenAI__ApiKey`)
- **`exportReport`** — requires Puppeteer (PDF) and PptxGenJS (PPT) in the functions bundle, plus Fabric storage SDK integration
- **`getKpiValues`** — requires XMLA client to execute the configured DAX queries against the company's Semantic Model
- **`startImpersonation` / `endImpersonation`** — requires JWT minting logic for the short-lived impersonation session token
- **`testFabricConnection`** / **`extractSemanticSchema`** — require `@azure/identity` + Microsoft XMLA SDK

Until these integrations are wired in production, each function returns a clear "not yet configured" response so the UI displays an informative message rather than crashing.

---

## License

© 2026 HESYD — Cabinet Solutions Digitales & Data Intelligence. All rights reserved.
