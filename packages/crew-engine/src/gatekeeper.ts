import type { PolicyTier, TenantWorkspace } from '@aislaves/shared';

export interface PolicyEvaluationInput {
  tenant: TenantWorkspace;
  toolName: string;
  policyTier: PolicyTier;
  idempotencyKey?: string;
}

export interface PolicyEvaluationResult {
  decision: 'ALLOW' | 'PAUSE_FOR_APPROVAL' | 'BLOCKED';
  code:
    | 'OK'
    | 'TENANT_PAUSED'
    | 'TASK_CAP_REACHED'
    | 'POLICY_BLOCKED'
    | 'APPROVAL_REQUIRED';
  reason: string;
  idempotencyKey?: string;
}

export function evaluateToolCallPolicy(
  input: PolicyEvaluationInput
): PolicyEvaluationResult {
  const { tenant, toolName, policyTier, idempotencyKey } = input;

  if (tenant.subscription.status === 'paused') {
    return {
      decision: 'BLOCKED',
      code: 'TENANT_PAUSED',
      reason: `Blocked ${toolName}: workspace paused by Operator kill-switch.`,
    };
  }

  if (tenant.subscription.tasksUsed >= tenant.subscription.taskAllowance) {
    return {
      decision: 'BLOCKED',
      code: 'TASK_CAP_REACHED',
      reason: `Hard fair-use allowance reached (${tenant.subscription.tasksUsed}/${tenant.subscription.taskAllowance} tasks). Zero surprise overages — opt-in MYR 99 (+1,000 tasks) pack required to resume.`,
    };
  }

  if (policyTier === 'BLOCKED') {
    return {
      decision: 'BLOCKED',
      code: 'POLICY_BLOCKED',
      reason: `Tool ${toolName} is strictly disabled by tenant Policy Gatekeeper.`,
    };
  }

  if (policyTier === 'APPROVAL_REQUIRED') {
    return {
      decision: 'PAUSE_FOR_APPROVAL',
      code: 'APPROVAL_REQUIRED',
      reason: `Sensitive write ${toolName} paused for 1-tap human approval.`,
      idempotencyKey: idempotencyKey ?? `${tenant.id}:${toolName}:${Date.now()}`,
    };
  }

  return {
    decision: 'ALLOW',
    code: 'OK',
    reason: `${policyTier} access allowed for ${toolName}.`,
  };
}
