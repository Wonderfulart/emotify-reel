import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function validateEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter(
    (varName) => !Deno.env.get(varName)
  );
  if (missing.length > 0) {
    console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Missing env vars: ${missing.join(", ")}`);
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

// Validate on cold start
validateEnvVars();

serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
      apiVersion: "2023-10-16",
    });

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Missing signature header`);
      return new Response("No signature", { status: 400 });
    }

    const body = await req.text();

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        Deno.env.get("STRIPE_WEBHOOK_SECRET")!
      );
    } catch (err) {
      console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Signature verification failed -`, err);
      return new Response(`Webhook Error: ${err instanceof Error ? err.message : "Unknown"}`, {
        status: 400,
      });
    }

    console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Received event ${event.type} (${event.id})`);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (!subscriptionId) {
          console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: No subscription ID in checkout session`);
          break;
        }

        // Get subscription details
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        
        // Find user by customer ID
        const { data: profile, error: profileError } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profileError || !profile) {
          console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Profile not found for customer ${customerId}`);
          break;
        }

        // Upsert subscription
        const { error: subError } = await supabaseAdmin.from("subscriptions").upsert({
          user_id: profile.id,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          price_id: subscription.items.data[0]?.price.id,
          updated_at: new Date().toISOString(),
        });

        if (subError) {
          console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Failed to upsert subscription -`, subError);
        }

        // Update profile plan
        const { error: planError } = await supabaseAdmin
          .from("profiles")
          .update({ plan: "creator" })
          .eq("id", profile.id);

        if (planError) {
          console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Failed to update profile plan -`, planError);
        }

        console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Updated subscription for user ${profile.id}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await supabaseAdmin.from("subscriptions").upsert({
            user_id: profile.id,
            status: subscription.status,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            price_id: subscription.items.data[0]?.price.id,
            updated_at: new Date().toISOString(),
          });

          const plan = subscription.status === "active" || subscription.status === "trialing" 
            ? "creator" 
            : "free";
          
          await supabaseAdmin
            .from("profiles")
            .update({ plan })
            .eq("id", profile.id);

          console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Subscription updated to ${subscription.status} for user ${profile.id}`);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .single();

        if (profile) {
          await supabaseAdmin.from("subscriptions").upsert({
            user_id: profile.id,
            status: "canceled",
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            price_id: subscription.items.data[0]?.price.id,
            updated_at: new Date().toISOString(),
          });

          await supabaseAdmin
            .from("profiles")
            .update({ plan: "free" })
            .eq("id", profile.id);

          console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Subscription canceled for user ${profile.id}`);
        }
        break;
      }

      default:
        console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Unhandled event type ${event.type}`);
    }

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Completed in ${duration}ms`);

    // Always return 200 to prevent Stripe retries on internal errors
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] STRIPE-WEBHOOK: Unexpected error after ${duration}ms -`, error);
    
    // Return 200 even on errors to prevent Stripe retries
    // The error is logged for debugging
    return new Response(JSON.stringify({ received: true, error: "Internal processing error" }), {
      headers: { "Content-Type": "application/json" },
    });
  }
});
