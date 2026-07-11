import Link from 'next/link';
import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-primary text-xl">Create account</h1>
        <p className="text-secondary text-sm">
          Start tracking your edge.
        </p>
      </div>
      <SignupForm />
      <p className="text-secondary text-sm">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-accent-signal hover:underline underline-offset-2"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
