import { NextResponse } from 'next/server';
import { getFirebaseAdminAuth } from '@aislaves/demo-sandbox';
import {
  encodeSessionCookie,
  SESSION_COOKIE_NAME,
  type ActiveSession,
} from '@/lib/auth-session';

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      idToken?: string;
      demoRole?: 'operator' | 'sme_client';
      tenantId?: string;
      email?: string;
    };

    let session: ActiveSession;

    if (body.idToken) {
      const adminAuth = getFirebaseAdminAuth();
      if (adminAuth) {
        const decoded = await adminAuth.verifyIdToken(body.idToken);
        const initialOp = (process.env.INITIAL_OPERATOR_EMAIL || 'timothy.tok@gmail.com').toLowerCase();
        const email = decoded.email || body.email || 'user@aislaves.my';
        session = {
          role: email.toLowerCase() === initialOp || email.toLowerCase().endsWith('@aislaves.my')
            ? 'operator'
            : 'sme_client',
          email,
          tenantId: body.tenantId || 'demo-kopikita',
          mode: 'firebase',
        };
      } else {
        session = {
          role: 'operator',
          email: body.email || 'operator@aislaves.my',
          mode: 'firebase',
        };
      }
    } else {
      const role = body.demoRole === 'sme_client' ? 'sme_client' : 'operator';
      session = {
        role,
        email:
          role === 'operator'
            ? 'operator-demo@aislaves.my'
            : `boss@${body.tenantId || 'kopikita'}.my`,
        tenantId: role === 'sme_client' ? body.tenantId || 'demo-kopikita' : undefined,
        mode: 'demo_preview',
      };
    }

    const res = NextResponse.json({ ok: true, session });
    res.cookies.set(SESSION_COOKIE_NAME, encodeSessionCookie(session), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Sign-in session failed' },
      { status: 401 }
    );
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
