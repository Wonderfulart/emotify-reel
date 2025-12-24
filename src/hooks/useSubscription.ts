import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Subscription } from '@/types/veosync';

export function useSubscription(userId: string | undefined) {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const fetchSubscription = async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (!error && data) {
        setSubscription(data as Subscription);
      }
      setLoading(false);
    };

    fetchSubscription();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('subscription-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new) {
            setSubscription(payload.new as Subscription);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const isActive = subscription?.status === 'active' || subscription?.status === 'trialing';

  return { subscription, loading, isActive };
}
