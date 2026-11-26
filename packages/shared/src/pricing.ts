export type PlanId = 'pilot_14d' | 'starter_clerk' | 'sme_growth' | 'pro_workforce';

export interface SmePricingTier {
  id: PlanId;
  name: string;
  tagline: string;
  monthlyRetainerMyr: number;
  monthlyRetainerUsd: number;
  setupFeeMyr: number;
  setupFeeNote: string;
  taskAllowance: number;
  maxCartridges: number;
  includesOnPremEdge: boolean;
  includesBossPulse: boolean;
  estimatedCogsMyr: number;
}

export const SME_PRICING_TIERS: Record<PlanId, SmePricingTier> = {
  pilot_14d: {
    id: 'pilot_14d',
    name: '14-Day Paid Pilot',
    tagline: 'Test-Drive 1 AI Clerk',
    monthlyRetainerMyr: 299,
    monthlyRetainerUsd: 69,
    setupFeeMyr: 0,
    setupFeeNote: '100% credited to full setup if converted',
    taskAllowance: 150,
    maxCartridges: 2,
    includesOnPremEdge: false,
    includesBossPulse: false,
    estimatedCogsMyr: 18,
  },
  starter_clerk: {
    id: 'starter_clerk',
    name: 'Starter',
    tagline: 'Single AI Clerk',
    monthlyRetainerMyr: 399,
    monthlyRetainerUsd: 89,
    setupFeeMyr: 800,
    setupFeeNote: 'Waived on 12-mo prepay',
    taskAllowance: 500,
    maxCartridges: 2,
    includesOnPremEdge: false,
    includesBossPulse: false,
    estimatedCogsMyr: 38,
  },
  sme_growth: {
    id: 'sme_growth',
    name: 'SME Growth',
    tagline: 'Department AI Crew (Core Offer)',
    monthlyRetainerMyr: 899,
    monthlyRetainerUsd: 199,
    setupFeeMyr: 1800,
    setupFeeNote: 'Done-for-you onboarding & SOP indexing',
    taskAllowance: 2000,
    maxCartridges: 5,
    includesOnPremEdge: false,
    includesBossPulse: true,
    estimatedCogsMyr: 68,
  },
  pro_workforce: {
    id: 'pro_workforce',
    name: 'Pro Back-Office',
    tagline: 'Full AI Workforce + On-Prem',
    monthlyRetainerMyr: 1699,
    monthlyRetainerUsd: 379,
    setupFeeMyr: 3500,
    setupFeeNote: 'Includes Docker Edge Runner + 1 Custom REST Bridge',
    taskAllowance: 6000,
    maxCartridges: 12,
    includesOnPremEdge: true,
    includesBossPulse: true,
    estimatedCogsMyr: 112,
  },
};

export const SME_BENCHMARK_CLERK_COST_MYR = 3200; // Junior accounts/admin clerk all-in MYR/mo

export function calculateGrossMarginPct(retainerMyr: number, cogsMyr: number): number {
  if (retainerMyr <= 0) return 0;
  return Math.round(((retainerMyr - cogsMyr) / retainerMyr) * 1000) / 10;
}

export function calculateRoiSummary(completedTasks: number, monthlyRetainerMyr: number) {
  // Average SME manual workflow (OCR + sheet entry + email drafting + chase) saves ~12 mins per completed task.
  const hoursSaved = Math.round((completedTasks * 12) / 60 * 10) / 10;
  const hourlyClerkRateMyr = 22;
  const laborValueSavedMyr = Math.round(hoursSaved * hourlyClerkRateMyr);
  const netSavingsVsClerkMyr = SME_BENCHMARK_CLERK_COST_MYR - monthlyRetainerMyr;
  return {
    hoursSaved,
    laborValueSavedMyr,
    benchmarkClerkCostMyr: SME_BENCHMARK_CLERK_COST_MYR,
    netSavingsVsClerkMyr,
  };
}

export function estimateStepCogsMyr(modelTier: 'gemini-flash' | 'gemini-pro' | 'local-ollama' | 'deterministic', includesWhatsApp = false): number {
  const aiCost =
    modelTier === 'gemini-flash'
      ? 0.015
      : modelTier === 'gemini-pro'
        ? 0.065
        : 0.002;
  const waCost = includesWhatsApp ? 0.04 : 0;
  return Math.round((aiCost + waCost) * 1000) / 1000;
}
