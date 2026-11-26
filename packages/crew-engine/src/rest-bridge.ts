import type { CustomRestApiSpec } from '@aislaves/shared';

export interface McpToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
  };
  policyTier: CustomRestApiSpec['policyTier'];
}

export function toMcpToolDescriptor(spec: CustomRestApiSpec): McpToolDescriptor {
  return {
    name: `custom.${spec.toolName}`,
    description: `${spec.description} (${spec.method} ${spec.baseUrl}${spec.path})`,
    inputSchema: {
      type: 'object',
      properties: {
        referenceId: { type: 'string', description: 'Target order, invoice, or lead reference ID' },
        payload: { type: 'string', description: 'Optional JSON body passed to client endpoint' },
      },
    },
    policyTier: spec.policyTier,
  };
}

export async function invokeCustomRestBridge(
  spec: CustomRestApiSpec,
  payload: Record<string, unknown>
): Promise<{
  ok: boolean;
  statusCode: number;
  url: string;
  responseBody: Record<string, unknown>;
}> {
  const fullUrl = `${spec.baseUrl.replace(/\/$/, '')}${spec.path}`;

  if (spec.baseUrl.startsWith('mock://') || spec.baseUrl.includes('demo.aislaves.local')) {
    return {
      ok: true,
      statusCode: 200,
      url: fullUrl,
      responseBody: {
        cartridge: spec.toolName,
        mode: 'sandbox_mock_bridge',
        echoedPayload: payload,
        syncedAt: new Date().toISOString(),
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(fullUrl, {
      method: spec.method,
      headers: { 'content-type': 'application/json' },
      body: spec.method === 'GET' ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await res.text();
    let parsed: Record<string, unknown> = { raw: text };
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      // keep raw text wrapper
    }
    return {
      ok: res.ok,
      statusCode: res.status,
      url: fullUrl,
      responseBody: parsed,
    };
  } finally {
    clearTimeout(timer);
  }
}
