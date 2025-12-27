import { useState, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export const AuthScreen = forwardRef<HTMLDivElement, object>(function AuthScreen(_, ref) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const { signInWithMagicLink, signInWithGoogle } = useAuth();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    const { error } = await signInWithMagicLink(email);
    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      setMagicLinkSent(true);
      toast.success('Check your email for the magic link!');
    }
  };

  const handleGoogle = async () => {
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error(error.message);
    }
  };

  if (magicLinkSent) {
    return (
      <div ref={ref} className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm animate-fade-in text-center">
          <div className="mb-6 text-6xl">✉️</div>
          <h1 className="mb-2 font-display text-4xl tracking-wider text-foreground">
            CHECK YOUR EMAIL
          </h1>
          <p className="mb-6 text-muted-foreground">
            We sent a magic link to <strong>{email}</strong>
          </p>
          <Button
            variant="ghost"
            onClick={() => setMagicLinkSent(false)}
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="mb-8 text-center">
          <h1 className="mb-2 font-display text-6xl tracking-wider gradient-text">
            VEOSYNC
          </h1>
          <p className="text-muted-foreground">
            Create cinematic music videos from your selfie
          </p>
        </div>

        <form onSubmit={handleMagicLink} className="mb-6 space-y-4">
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 rounded-xl border-border bg-muted/50 text-center text-lg placeholder:text-muted-foreground"
            required
          />
          <Button
            type="submit"
            variant="hero"
            className="w-full"
            disabled={loading || !email}
          >
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'Continue with Email'
            )}
          </Button>
        </form>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full h-14 rounded-xl text-lg"
          onClick={handleGoogle}
        >
          <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="currentColor"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="currentColor"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="currentColor"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="currentColor"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continue with Google
        </Button>
      </div>
    </div>
  );
});

AuthScreen.displayName = 'AuthScreen';
