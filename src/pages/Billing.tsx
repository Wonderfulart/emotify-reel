import { useAuth } from '@/hooks/useAuth';
import { useSubscription } from '@/hooks/useSubscription';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';
import { Loader2, CreditCard, Calendar, Check, ArrowLeft } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';

export default function Billing() {
  const { user, loading: authLoading } = useAuth();
  const { subscription, loading: subLoading, isActive } = useSubscription(user?.id);
  const [loading, setLoading] = useState(false);

  if (authLoading || subLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  const handleManageBilling = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Portal error:', error);
      toast.error('Failed to open billing portal');
    } finally {
      setLoading(false);
    }
  };

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
      toast.error('Failed to start checkout');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>

        <h1 className="mb-8 font-display text-4xl tracking-wider text-foreground">
          BILLING
        </h1>

        <div className="rounded-2xl bg-card p-6 border border-border">
          <div className="mb-6 flex items-center gap-4">
            <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
              isActive ? 'bg-primary/20' : 'bg-muted'
            }`}>
              {isActive ? (
                <Check className="h-6 w-6 text-primary" />
              ) : (
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div>
              <h2 className="font-display text-2xl tracking-wider">
                {isActive ? 'CREATOR PLAN' : 'FREE PLAN'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isActive 
                  ? subscription?.status === 'trialing' 
                    ? 'Trial active'
                    : 'Subscription active'
                  : 'No active subscription'}
              </p>
            </div>
          </div>

          {subscription?.current_period_end && (
            <div className="mb-6 flex items-center gap-3 rounded-xl bg-muted/50 p-4">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {subscription.status === 'trialing' ? 'Trial ends' : 'Renews'}
                </p>
                <p className="font-medium text-foreground">
                  {formatDate(subscription.current_period_end)}
                </p>
              </div>
            </div>
          )}

          {isActive ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={handleManageBilling}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Manage Billing'
              )}
            </Button>
          ) : (
            <Button
              variant="hero"
              className="w-full"
              onClick={handleSubscribe}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                'Subscribe Now'
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
