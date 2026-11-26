# AISlaves — Plug-and-Play Multi-Agent Workforce Platform & MCP Hub

**Hire · Plug · Brief · Supervise** pre-configured AI Employees and multi-agent Crews built on a **3-Layer Plug-and-Play Architecture** ("Shopify App Store / Lego Bricks for AI Employees") — powered by **Capability Contracts + MCP Cartridges**, **Drop-In Knowledge/Data Slots**, **1-tap Human-in-the-Loop approvals** (Web & WhatsApp), safe **Shared Excel Bookkeeping**, **POS & Accounting integrations**, **Company SOP RAG**, and a **"Card-to-Calendar" Sales Growth Crew**.

> Read the full engineering specification, 3-layer plug-and-play contracts, `crew-pack.yaml` manifest spec, MCP tools, guardrails, and 12-week delivery roadmap in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).

---

## Core Platform Capabilities

0. **3-Layer Plug-and-Play Standard (Zero-Code Client Onboarding)**
   - **Layer 1 — Hot-Swappable MCP Tool "Cartridges":** Agents bind only to normalized **Capability Contracts** (`capability:pos`, `capability:accounting`, `capability:spreadsheet`, `capability:messaging`, `capability:mail`, `capability:calendar`, `capability:crm`). Swap StoreHub <-> Loyverse <-> Qashier or Xero <-> Bukku <-> SQL Account or Local SMB Excel <-> Google Sheets without touching a single prompt.
   - **Layer 2 — Drop-In Knowledge & Data "Slots":** Packs declare named slots (`slot:company_policies`, `slot:pricing_guide`, `slot:bookkeeping_folder`). Clients simply drag-and-drop PDFs/DOCX or link a shared folder.
   - **Layer 3 — Declarative Crew Packs (`crew-pack.yaml`) & 1-Click Preflight Installer:** Installing a vertical bundle (*Sales*, *F&B*, *Trading/Wholesale*, *Agency*, *Clinic*) diffs requirements against active cartridges, shows **Green/Amber** status, prompts only missing connections/files, and activates cleanly.

1. **CrewAI-Style Multi-Agent Engine & Dynamic Spawner**
   - Define `Agent` (`role`, `goal`, `backstory`, `sopCollectionIds`, `mcpToolAllowlist`, `modelTier`), `Task` (`expectedOutputSchema`, `dependsOnTaskIds`, `approvalPolicy`), and `Crew` (`sequential`, `hierarchical` with a Manager Agent, or `event_triggered`).
   - Spawn single AI Employees from a **12-template Pre-Configured Library** or fan out sub-agents dynamically (e.g., scanning 40 expo business cards and spawning 40 parallel research + cold-email tasks within concurrency and budget caps).

2. **First-Party 9-Server MCP Hub (Cloud + Client-Server Edge Runner)**
   - Standardized Model Context Protocol servers with code-enforced permission tiers (`READ`, `DRAFT`, `APPROVAL_REQUIRED`, `BLOCKED`):
     - **`mcp-whatsapp-business`**: Customer triage, media intake (cards/receipts/DOs), and **1-tap Manager Approve/Reject interactive buttons inside WhatsApp**.
     - **`mcp-pos-systems`**: StoreHub, Loyverse, Qashier, FeedMe POS, Shopify POS/Square, Xilnex/Zeoniq + universal daily Z-report CSV/Excel drop parser.
     - **`mcp-accounting`**: Xero, QuickBooks Online, Bukku, Financio, Odoo Accounting + On-Premises **SQL Account** and **AutoCount** via the Docker Edge Runner.
     - **`mcp-shared-excel`**: Safe bookkeeping workbook engine for Google Drive, OneDrive/SharePoint, Dropbox, or local SMB shares (auto-backups before write, formula preservation, schema column locks).
     - **`mcp-knowledge-sop`**: Company Policies, Guides & SOP RAG Vault with department RBAC and mandatory document/section citations.
     - **`mcp-vision-ocr`**: Multimodal Gemini Vision OCR for Business Cards, Supplier Invoices, Crumpled Staff Receipts, Delivery Orders (DOs), and Bank Statements.
     - **`mcp-email-outreach`**: Gmail / M365 / SMTP cold email drafting, warm-up rate limits, Day-3/Day-7 follow-ups, and instant stop-on-reply detection.
     - **`mcp-calendar-booking`**: Google Calendar & Microsoft Outlook free/busy checks, slot proposals, and automatic invite + Meet/Teams link creation upon prospect confirmation.
     - **`mcp-crm-leads`**: Bi-directional Lead & Deal pipeline synced with CRM or Shared Excel Lead trackers.

3. **3 Turnkey Pre-Configured Crews (12 Digital Employees)**
   - **Bundle A — "Card-to-Calendar" Sales Growth Crew:** Business Card OCR & Enricher → Cold Outreach Copywriter (grounded in Company Pitch/Pricing SOP) → Smart Follow-Up Cadence Agent → Reply & Calendar Appointment Setter.
   - **Bundle B — POS, Shared Excel & Accounting Crew:** POS Daily Closing Agent → AP Invoice/Receipt Bookkeeper → **Malaysia LHDN MyInvois & SST Validator** → **AR Overdue Payment Chaser** → **Shopee/Lazada/GrabFood Payout Reconciler**.
   - **Bundle C — Company SOP, Claims & Executive Ops Crew:** Company SOP Helpdesk Agent → **WhatsApp Staff Expense Claim & DO Verifier** → **8:30 AM "Boss Daily Pulse" WhatsApp Briefing Agent**.

---

## Hybrid Architecture

```mermaid
flowchart TB
    LIB["Pre-Configured Agent & Crew Library (12 Templates)"] --> SPAWN["Crew Engine & Dynamic Spawner (Sequential / Hierarchical)"]
    MGR["Human Manager (Web Dashboard & WhatsApp 1-Tap Inbox)"] --> SPAWN
    SPAWN --> POLICY["Deterministic Policy Gatekeeper (READ / DRAFT / APPROVAL_REQUIRED / BLOCKED)"]
    POLICY -->|"Sensitive Writes"| APPR["Approval Queue (Manager Sign-Off)"]
    APPR -->|"Approved"| MCPHUB["Cloud MCP Hub (WhatsApp, Email, Calendar, POS, Xero, Excel, SOP RAG, OCR)"]
    POLICY -->|"Safe Read / Draft"| MCPHUB
    POLICY -->|"Outbound Pull Tunnel (Zero Open Ports)"| EDGE["Client Docker Edge Runner (aislaves-runner)"]
    APPR -->|"Approved"| EDGE
    EDGE --> LOCAL["Client On-Prem Systems (SQL Account, AutoCount, Local SMB Excel, Postgres, MSSQL)"]
    POLICY --> AUDIT["Immutable Audit Trail & Cost Ledger"]
```

---

## Proposed Monorepo Structure

```text
aislaves/
├── apps/
│   └── web/                          # Next.js 16 Control Plane (Crew Studio, MCP Hub, Approval Inbox, SOP Vault)
├── packages/
│   ├── shared/                       # Shared Zod schemas, Crew/Agent/Task types, Firestore converters
│   ├── crew-engine/                  # CrewAI-style Orchestrator, Manager Delegation, Dynamic Spawner, Policy Gate
│   ├── mcp-servers/
│   │   ├── whatsapp-business/        # Meta Cloud API + Manager 1-tap approval buttons
│   │   ├── pos-systems/              # StoreHub, Loyverse, Qashier, FeedMe, Shopify/Square, Z-report parser
│   │   ├── accounting/               # Xero, QBO, Bukku, Financio, Odoo, SQL Account, AutoCount
│   │   ├── shared-excel/             # Safe snapshot + formula-preserving Excel & Sheets updater
│   │   ├── knowledge-sop/            # RBAC-scoped Policy/SOP/Guide PDF/Docx/Excel RAG server
│   │   ├── vision-ocr/               # Business Cards, Invoices, Receipts, DOs (Gemini Vision + Zod)
│   │   ├── email-outreach/           # Gmail/M365/SMTP cold sequences + reply listener + rate limiter
│   │   ├── calendar-booking/         # Google/Outlook Calendar free/busy + atomic booking + Meet/Teams link
│   │   └── crm-leads/                # Pipeline tracker synced to HubSpot/Pipedrive or Shared Excel
│   └── edge-runner/                  # One-command Docker worker for client servers & on-prem ERP/SMB shares
├── firestore.rules                   # Strict multi-tenant org & department RBAC security rules
├── firestore.indexes.json            # Composite indexes for approval queues, leads, and audit logs
├── IMPLEMENTATION_PLAN.md            # Complete v2 engineering & commercial blueprint
└── README.md
```

---

## Documentation

- [Implementation Plan v2.1 (3-Layer Plug-and-Play Architecture, Crew Engine, MCP Hub & Roadmap)](./IMPLEMENTATION_PLAN.md)
