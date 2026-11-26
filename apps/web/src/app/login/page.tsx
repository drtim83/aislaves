import { LoginFormClient } from '@/components/LoginFormClient';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const firebaseReady = Boolean(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
  return <LoginFormClient firebaseReady={firebaseReady} />;
}
