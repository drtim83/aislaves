import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { CAPABILITY_IDS, type CapabilityId, type KnowledgeSlotId } from './contracts';

export const KnowledgeSlotDeclSchema = z.object({
  id: z.enum(['pricing_guide', 'company_policies', 'bookkeeping_folder', 'brand_voice']),
  label: z.string(),
  required: z.boolean().default(true),
});

export const TriggerDeclSchema = z.object({
  id: z.string(),
  source: z.string().optional(),
  event: z.string().optional(),
  filter: z.string().optional(),
  type: z.enum(['event', 'cron', 'webhook']).default('event'),
  schedule: z.string().optional(),
});

export const AgentDeclSchema = z.object({
  id: z.string(),
  role: z.string(),
  goal: z.string(),
  modelTier: z.enum(['gemini-flash', 'gemini-pro', 'local-ollama']).default('gemini-flash'),
  uses: z.array(z.enum(CAPABILITY_IDS)),
  slots: z.array(z.string()).default([]),
  canDelegate: z.boolean().default(false),
  maxSteps: z.number().int().positive().default(15),
});

export const TaskDeclSchema = z.object({
  id: z.string(),
  description: z.string(),
  agent: z.string(),
  trigger: z.string().optional(),
  after: z.string().optional(),
  outputTo: z.string().optional(),
  requiresApproval: z.string().optional(),
});

export const CrewPackManifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string(),
  category: z.enum(['sales', 'finance_pos', 'ops_sop']),
  bundleLabel: z.string(),
  processMode: z.enum(['sequential', 'hierarchical', 'event_triggered']).default('sequential'),
  description: z.string(),
  requiredCapabilities: z.array(z.enum(CAPABILITY_IDS)),
  optionalCapabilities: z.array(z.enum(CAPABILITY_IDS)).default([]),
  knowledgeSlots: z.array(KnowledgeSlotDeclSchema),
  triggers: z.array(TriggerDeclSchema),
  agents: z.array(AgentDeclSchema),
  tasks: z.array(TaskDeclSchema),
  approvalGates: z.array(z.string()).default([]),
});

export type CrewPackManifest = z.infer<typeof CrewPackManifestSchema>;

export function parseCrewPackYaml(yamlSource: string): CrewPackManifest {
  const raw = parseYaml(yamlSource);
  return CrewPackManifestSchema.parse(raw);
}

export interface PreflightCheckItem {
  kind: 'capability' | 'slot';
  key: string;
  label: string;
  required: boolean;
  status: 'green' | 'amber';
  detail: string;
}

export interface PreflightReport {
  packId: string;
  packName: string;
  readyToActivate: boolean;
  greenCount: number;
  amberCount: number;
  items: PreflightCheckItem[];
}

export interface TenantPreflightInput {
  cartridges: Partial<Record<CapabilityId, { cartridgeId: string; label: string; connected: boolean }>>;
  knowledgeSlots: Partial<Record<KnowledgeSlotId, { docName: string; indexed: boolean }>>;
}

export function evaluatePackPreflight(
  manifest: CrewPackManifest,
  tenant: TenantPreflightInput
): PreflightReport {
  const items: PreflightCheckItem[] = [];

  for (const cap of manifest.requiredCapabilities) {
    const binding = tenant.cartridges[cap];
    const isGreen = Boolean(binding?.connected);
    items.push({
      kind: 'capability',
      key: cap,
      label: cap,
      required: true,
      status: isGreen ? 'green' : 'amber',
      detail: isGreen
        ? `Bound to ${binding!.label} (${binding!.cartridgeId})`
        : `Needs Cartridge binding or Magic Connect OAuth`,
    });
  }

  for (const slot of manifest.knowledgeSlots) {
    const bound = tenant.knowledgeSlots[slot.id as KnowledgeSlotId];
    const isGreen = Boolean(bound?.indexed);
    items.push({
      kind: 'slot',
      key: slot.id,
      label: slot.label,
      required: slot.required,
      status: isGreen ? 'green' : 'amber',
      detail: isGreen
        ? `Indexed: ${bound!.docName}`
        : slot.required
          ? `Missing required document/folder (send Magic Connect Link)`
          : `Optional — upload anytime`,
    });
  }

  const greenCount = items.filter((item) => item.status === 'green').length;
  const amberRequiredCount = items.filter((item) => item.required && item.status === 'amber').length;

  return {
    packId: manifest.id,
    packName: manifest.name,
    readyToActivate: amberRequiredCount === 0,
    greenCount,
    amberCount: items.length - greenCount,
    items,
  };
}
