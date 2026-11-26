import type { TenantWorkspace } from '@aislaves/shared';

export interface EmailDispatchResult {
  sentLive: boolean;
  provider: 'resend' | 'smtp' | 'sandbox';
  messageId: string;
  note: string;
}

export function canSendOutreachToday(tenant: TenantWorkspace): {
  allowed: boolean;
  sentToday: number;
  dailyCap: number;
} {
  const dailyCap = tenant.policySettings?.dailyEmailWarmupCap ?? 30;
  const sentToday = tenant.policySettings?.emailsSentToday ?? 0;
  return {
    allowed: sentToday < dailyCap,
    sentToday,
    dailyCap,
  };
}

export async function dispatchApprovedOutreachEmail(input: {
  tenant: TenantWorkspace;
  to: string;
  subject: string;
  body: string;
}): Promise<EmailDispatchResult> {
  const { allowed, sentToday, dailyCap } = canSendOutreachToday(input.tenant);
  if (!allowed) {
    throw new Error(
      `Warm-up deliverability guard blocked send: ${sentToday}/${dailyCap} daily emails reached.`
    );
  }

  const mailCartridge = input.tenant.cartridges['capability:mail'];
  const isMockCartridge = !mailCartridge || mailCartridge.cartridgeId === 'mock-mail';

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromAddress = process.env.SMTP_FROM?.trim() || 'AISlaves Outreach <no-reply@aislaves.my>';

  if (!isMockCartridge && resendKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${resendKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [input.to],
        subject: input.subject,
        text: input.body,
      }),
    });
    if (res.ok) {
      const json = (await res.json()) as { id?: string };
      return {
        sentLive: true,
        provider: 'resend',
        messageId: json.id || `resend-${Date.now()}`,
        note: `Dispatched live email to ${input.to} via Resend API.`,
      };
    }
  }

  const smtpHost = process.env.SMTP_HOST?.trim();
  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (!isMockCartridge && smtpHost && smtpUser && smtpPass) {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(process.env.SMTP_PORT || 587),
      secure: Number(process.env.SMTP_PORT || 587) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    const info = await transporter.sendMail({
      from: fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.body,
    });
    return {
      sentLive: true,
      provider: 'smtp',
      messageId: info.messageId || `smtp-${Date.now()}`,
      note: `Dispatched live email to ${input.to} via SMTP (${smtpHost}).`,
    };
  }

  return {
    sentLive: false,
    provider: 'sandbox',
    messageId: `sim-mail-${Date.now()}`,
    note: `Sandbox Cartridge recorded outbound email to ${input.to} cleanly (within ${sentToday + 1}/${dailyCap} warm-up cap).`,
  };
}
