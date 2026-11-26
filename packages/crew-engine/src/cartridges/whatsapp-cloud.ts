export interface ParsedWhatsAppInbound {
  kind: 'text' | 'image' | 'approval_tap' | 'unknown';
  fromPhone: string;
  text?: string;
  mediaId?: string;
  decision?: 'approved' | 'rejected';
  approvalId?: string;
}

export function verifyWhatsAppWebhook(opts: {
  mode?: string | null;
  token?: string | null;
  challenge?: string | null;
  expectedToken?: string;
}): { ok: boolean; status: number; body: string } {
  const verifyToken = opts.expectedToken || process.env.WHATSAPP_VERIFY_TOKEN || 'aislaves-verify';
  if (opts.mode === 'subscribe' && opts.token === verifyToken && opts.challenge) {
    return { ok: true, status: 200, body: opts.challenge };
  }
  return { ok: false, status: 403, body: 'Verification failed' };
}

export function parseWhatsAppWebhookPayload(body: unknown): ParsedWhatsAppInbound[] {
  const events: ParsedWhatsAppInbound[] = [];
  if (!body || typeof body !== 'object') return events;

  const root = body as {
    entry?: Array<{
      changes?: Array<{
        value?: {
          messages?: Array<{
            from?: string;
            type?: string;
            text?: { body?: string };
            image?: { id?: string; caption?: string };
            interactive?: {
              type?: string;
              button_reply?: { id?: string; title?: string };
            };
          }>;
        };
      }>;
    }>;
  };

  for (const entry of root.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        const fromPhone = msg.from || 'unknown';
        if (msg.type === 'interactive' && msg.interactive?.button_reply?.id) {
          const btnId = msg.interactive.button_reply.id;
          if (btnId.startsWith('approve:')) {
            events.push({
              kind: 'approval_tap',
              fromPhone,
              decision: 'approved',
              approvalId: btnId.slice('approve:'.length),
            });
            continue;
          }
          if (btnId.startsWith('reject:')) {
            events.push({
              kind: 'approval_tap',
              fromPhone,
              decision: 'rejected',
              approvalId: btnId.slice('reject:'.length),
            });
            continue;
          }
        }

        if (msg.type === 'image' && msg.image?.id) {
          events.push({
            kind: 'image',
            fromPhone,
            mediaId: msg.image.id,
            text: msg.image.caption,
          });
          continue;
        }

        if (msg.type === 'text' && msg.text?.body) {
          events.push({
            kind: 'text',
            fromPhone,
            text: msg.text.body,
          });
          continue;
        }

        events.push({ kind: 'unknown', fromPhone });
      }
    }
  }

  return events;
}

export async function sendWhatsAppCloudApprovalCard(input: {
  toPhone: string;
  bodyText: string;
  approvalId: string;
}): Promise<{ sentLive: boolean; note: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneId) {
    return {
      sentLive: false,
      note: 'Queued in interactive WhatsApp Simulator (set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID for Meta Cloud dispatch).',
    };
  }

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: input.toPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: input.bodyText },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `approve:${input.approvalId}`, title: 'Approve' } },
            { type: 'reply', reply: { id: `reject:${input.approvalId}`, title: 'Reject' } },
          ],
        },
      },
    }),
  });

  return {
    sentLive: res.ok,
    note: res.ok
      ? `Dispatched interactive Meta WhatsApp approval card to ${input.toPhone}.`
      : `Meta Cloud API returned HTTP ${res.status}.`,
  };
}
