export const EMBEDDED_PACKS_YAML: Record<string, string> = {
  'sales-card-to-calendar.yaml': `id: sales-card-to-calendar
name: "Card-to-Calendar Sales Growth Crew"
version: "1.0.0"
category: sales
bundleLabel: "Bundle A — Sales Growth"
processMode: sequential
description: "Snap a business card photo in WhatsApp -> extract & enrich lead -> draft SOP-grounded cold email & Day-3/7 follow-ups -> approve in 1 tap -> auto-halt follow-ups & book calendar slot on reply."

requiredCapabilities:
  - capability:messaging
  - capability:mail
  - capability:calendar
  - capability:crm

optionalCapabilities:
  - capability:spreadsheet

knowledgeSlots:
  - id: pricing_guide
    label: "Products, Pricing Tiers & Pitch Deck (PDF/DOCX)"
    required: true
  - id: company_policies
    label: "Sales SLA, Discount Limits & T&Cs"
    required: false

triggers:
  - id: on_business_card_photo
    source: capability:messaging
    event: media.image.received
    filter: "tag:card OR channel:sales-leads"
    type: event
  - id: on_prospect_reply
    source: capability:mail
    event: thread.reply.received
    type: event
  - id: daily_followup_sweep
    type: cron
    schedule: "0 9 * * 1-5"

agents:
  - id: card_scout
    role: "Business Card OCR & Lead Enricher"
    goal: "Extract clean contact fields from card photos, enrich company details, and deduplicate CRM leads."
    modelTier: gemini-flash
    uses: [capability:crm, capability:spreadsheet]
    canDelegate: true
    maxSteps: 10
  - id: cold_writer
    role: "Cold Outreach Copywriter"
    goal: "Draft personalized cold emails strictly grounded in approved pricing guides and sales SOPs."
    modelTier: gemini-pro
    uses: [capability:mail, capability:crm]
    slots: [pricing_guide, company_policies]
    maxSteps: 8
  - id: followup_nurturer
    role: "Smart Follow-Up Cadence Agent"
    goal: "Execute polite Day-3/Day-7 follow-ups and halt atomically the moment any human reply arrives."
    modelTier: gemini-flash
    uses: [capability:mail, capability:crm]
    slots: [pricing_guide]
    maxSteps: 8
  - id: calendar_closer
    role: "Inbox Reply & Calendar Appointment Setter"
    goal: "Read positive replies, inspect live rep availability, and book calendar invites with Meet/Teams links."
    modelTier: gemini-pro
    uses: [capability:mail, capability:calendar, capability:crm]
    maxSteps: 10

tasks:
  - id: extract_and_enrich
    description: "Run multimodal OCR on card photo(s) and upsert deduplicated CRM lead."
    agent: card_scout
    trigger: on_business_card_photo
    outputTo: cold_writer
  - id: draft_intro_email
    description: "Draft tailored cold outreach + Day-3/Day-7 cadence grounded in Pricing SOP."
    agent: cold_writer
    after: extract_and_enrich
    requiresApproval: outbound_email_send
  - id: run_followup_touch
    description: "Run due follow-up touches for non-replied prospects."
    agent: followup_nurturer
    trigger: daily_followup_sweep
    requiresApproval: outbound_email_send
  - id: propose_and_book_meeting
    description: "Halt remaining follow-ups on prospect reply, check free/busy, and stage calendar invite."
    agent: calendar_closer
    trigger: on_prospect_reply
    requiresApproval: calendar_booking_confirm

approvalGates:
  - outbound_email_send
  - calendar_booking_confirm
`,

  'fnb-pos-bookkeeping.yaml': `id: fnb-pos-bookkeeping
name: "POS, Shared Excel & Accounting Crew"
version: "1.0.0"
category: finance_pos
bundleLabel: "Bundle B — Back-Office Finance"
processMode: hierarchical
description: "Daily POS Z-report reconciliation across outlets -> formula-safe Shared Excel staging with automatic .bak backups -> supplier bill/MyInvois validation -> AR overdue chaser."

requiredCapabilities:
  - capability:pos
  - capability:spreadsheet
  - capability:accounting
  - capability:messaging

optionalCapabilities:
  - capability:mail

knowledgeSlots:
  - id: bookkeeping_folder
    label: "Shared Bookkeeping Folder & COA Reference"
    required: true
  - id: company_policies
    label: "Cash Variance Thresholds, MyInvois & Expense SOP"
    required: true

triggers:
  - id: nightly_pos_close
    type: cron
    schedule: "30 23 * * *"
  - id: ap_invoice_uploaded
    source: capability:messaging
    event: media.document.received
    type: event

agents:
  - id: pos_closer
    role: "POS Daily Closing & Reconciler"
    goal: "Pull multi-outlet StoreHub/Loyverse totals, flag cash/DuitNow variances, and stage daily Excel rows."
    modelTier: gemini-flash
    uses: [capability:pos, capability:spreadsheet, capability:messaging]
    slots: [bookkeeping_folder, company_policies]
    canDelegate: true
    maxSteps: 12
  - id: ap_bookkeeper
    role: "AP Invoice & Receipt Bookkeeper"
    goal: "Extract supplier invoice fields and stage draft bills in Xero, Bukku, or SQL Account."
    modelTier: gemini-flash
    uses: [capability:accounting, capability:spreadsheet]
    slots: [bookkeeping_folder]
    maxSteps: 10
  - id: myinvois_validator
    role: "Malaysia LHDN MyInvois & SST Validator"
    goal: "Verify Buyer TIN, BRN, MSIC classification, and SST math before accounting submission."
    modelTier: gemini-pro
    uses: [capability:accounting, capability:messaging]
    slots: [company_policies]
    maxSteps: 8
  - id: ar_chaser
    role: "AR Overdue Payment Chaser"
    goal: "Identify 7/14/30+ day overdue receivables and queue SOP-compliant WhatsApp/email reminders."
    modelTier: gemini-flash
    uses: [capability:accounting, capability:messaging]
    slots: [company_policies]
    maxSteps: 10
  - id: payout_reconciler
    role: "Marketplace & Delivery Payout Reconciler"
    goal: "Match GrabFood, Shopee, and Foodpanda net bank payouts against POS gross sales and fees."
    modelTier: gemini-flash
    uses: [capability:pos, capability:spreadsheet]
    slots: [bookkeeping_folder]
    maxSteps: 10

tasks:
  - id: reconcile_daily_pos
    description: "Reconcile Cash, DuitNow QR, Cards, and Delivery totals; flag variances above MYR 20 SOP cap."
    agent: pos_closer
    trigger: nightly_pos_close
    outputTo: myinvois_validator
    requiresApproval: excel_commit_update
  - id: validate_einvoice_compliance
    description: "Audit staged sales and supplier bills against LHDN MyInvois mandatory fields."
    agent: myinvois_validator
    after: reconcile_daily_pos

approvalGates:
  - excel_commit_update
  - accounting_post_journal
`,

  'sop-claims-pulse.yaml': `id: sop-claims-pulse
name: "Company SOP, Claims & Boss Daily Pulse Crew"
version: "1.0.0"
category: ops_sop
bundleLabel: "Bundle C — Executive Ops & SOP"
processMode: event_triggered
description: "Cited Company Policy/SOP Q&A on WhatsApp -> staff expense receipt OCR verified against policy limits -> 8:30 AM Boss Daily Pulse briefing with 1-tap approval buttons."

requiredCapabilities:
  - capability:messaging
  - capability:spreadsheet

optionalCapabilities:
  - capability:pos
  - capability:accounting

knowledgeSlots:
  - id: company_policies
    label: "Staff Handbook, Expense Claims & DO SOP (PDF/DOCX)"
    required: true
  - id: bookkeeping_folder
    label: "Staff Claims & Petty Cash Workbook"
    required: false

triggers:
  - id: staff_claim_photo
    source: capability:messaging
    event: media.receipt.received
    type: event
  - id: morning_boss_pulse
    type: cron
    schedule: "30 8 * * *"

agents:
  - id: sop_helpdesk
    role: "Company Policy & SOP Helpdesk"
    goal: "Answer staff operational questions strictly cited to exact handbook clauses within RBAC scope."
    modelTier: gemini-flash
    uses: [capability:messaging]
    slots: [company_policies]
    maxSteps: 6
  - id: claims_verifier
    role: "WhatsApp Staff Expense & DO Verifier"
    goal: "Extract receipt amounts, verify against meal/mileage caps in Company Policies, and request 1-tap boss sign-off."
    modelTier: gemini-flash
    uses: [capability:messaging, capability:spreadsheet]
    slots: [company_policies, bookkeeping_folder]
    maxSteps: 8
  - id: boss_daily_pulse
    role: "8:30 AM Boss Daily Pulse Briefing Agent"
    goal: "Summarize yesterday sales, variances, pending approvals, and booked sales calls cleanly on WhatsApp."
    modelTier: gemini-pro
    uses: [capability:messaging, capability:pos, capability:spreadsheet]
    maxSteps: 6

tasks:
  - id: verify_expense_receipt
    description: "OCR staff receipt, compare against Company Claims Policy section 4.2, and raise approval card."
    agent: claims_verifier
    trigger: staff_claim_photo
    requiresApproval: expense_claim_payout
  - id: send_morning_pulse
    description: "Compile multi-crew KPIs into an executive WhatsApp morning brief."
    agent: boss_daily_pulse
    trigger: morning_boss_pulse

approvalGates:
  - expense_claim_payout
`,
};
