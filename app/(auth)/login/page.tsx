import Link from 'next/link';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-primary text-xl">Sign in</h1>
        <p className="text-secondary text-sm">
          Access your trading journal.
        </p>
      </div>
      <LoginForm />
      <p className="text-secondary text-sm">
        No account?{' '}
        <Link
          href="/signup"
          className="text-accent-signal hover:underline underline-offset-2"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
}
