import { cookies } from 'next/headers';

export const SESSION_COOKIE_NAME = 'aislaves_session';

export interface ActiveSession {
  role: 'operator' | 'sme_client';
  email: string;
  tenantId?: string;
  mode: 'firebase' | 'demo_preview';
}

export async function getActiveSession(): Promise<ActiveSession> {
  try {
    const store = await cookies();
    const raw = store.get(SESSION_COOKIE_NAME)?.value;
    if (!raw) {
      return {
        role: 'operator',
        email: 'operator-demo@aislaves.my',
        mode: 'demo_preview',
      };
    }
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as ActiveSession;
    return parsed;
  } catch {
    return {
      role: 'operator',
      email: 'operator-demo@aislaves.my',
      mode: 'demo_preview',
    };
  }
}

export function encodeSessionCookie(session: ActiveSession): string {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
}
