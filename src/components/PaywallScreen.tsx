import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Zap, Check } from 'lucide-react';

const FEATURES = [
  'Unlimited video generations',
  'High-quality 1080p exports',
  'All emotion styles',
  'Priority processing',
  'Download & share anywhere',
];

export function PaywallScreen() {
  const [loading, setLoading] = useState(false);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { price_id: 'default' },
      });

      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error('Failed to start checkout. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm animate-fade-in text-center">
        <div className="mb-6">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full gradient-bg glow-primary">
            <Zap className="h-10 w-10 text-primary" />
          </div>
          <h1 className="mb-2 font-display text-4xl tracking-wider text-foreground">
            UNLOCK VEOSYNC
          </h1>
          <p className="text-muted-foreground">
            Create unlimited cinematic music videos
          </p>
        </div>

        <div className="mb-8 rounded-2xl bg-muted/30 p-6 text-left">
          <ul className="space-y-3">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-center gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20">
                  <Check className="h-4 w-4 text-primary" />
                </div>
                <span className="text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <Button
          variant="hero"
          className="w-full mb-4"
          onClick={handleSubscribe}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            'Start Free Trial'
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          7-day free trial, then $9.99/month. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
