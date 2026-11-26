import {
  cert,
  getApp,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const globalForFirestore = globalThis as typeof globalThis & {
  __aislavesFirestoreConfigured?: boolean;
};

function parseServiceAccount(raw: string): ServiceAccount {
  const trimmed = raw.trim();
  const jsonStr = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed, 'base64').toString('utf8');
  const parsed = JSON.parse(jsonStr) as ServiceAccount & {
    private_key?: unknown;
    privateKey?: unknown;
  };
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  if (typeof parsed.privateKey === 'string') {
    parsed.privateKey = parsed.privateKey.replace(/\\n/g, '\n');
  }
  return parsed;
}

export function isFirebaseAdminConfigured(): boolean {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim()) return true;
  if (
    (process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    return true;
  }
  return false;
}

export function getFirebaseAdminApp(): App | null {
  if (!isFirebaseAdminConfigured()) return null;
  if (getApps().length > 0) return getApp();

  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT_KEY?.trim();
  if (serviceAccountEnv) {
    return initializeApp({
      credential: cert(parseServiceAccount(serviceAccountEnv)),
    });
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  }

  return null;
}

export function getFirebaseAdminDb(): Firestore | null {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  const db = getFirestore(app);
  if (!globalForFirestore.__aislavesFirestoreConfigured) {
    try {
      db.settings({ ignoreUndefinedProperties: true });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('already been initialized')) {
        throw error;
      }
    }
    globalForFirestore.__aislavesFirestoreConfigured = true;
  }
  return db;
}

export async function verifyFirebaseIdTokenSafe(
  idToken: string
): Promise<{ uid: string; email?: string } | null> {
  const app = getFirebaseAdminApp();
  if (app) {
    try {
      const { getAuth } = await import('firebase-admin/auth');
      const decoded = await getAuth(app).verifyIdToken(idToken);
      return { uid: decoded.uid, email: decoded.email };
    } catch {
      // Fall back to Firebase Identity Toolkit token lookup if runtime cannot load jose ESM
    }
  }

  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  if (!apiKey) return null;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idToken }),
    }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    users?: Array<{ localId?: string; email?: string }>;
  };
  const user = data.users?.[0];
  if (!user?.localId) return null;
  return { uid: user.localId, email: user.email };
}
