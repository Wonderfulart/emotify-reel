import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DirectorPlan {
  emotion: string;
  platform: string;
  selfie_asset_url: string;
  song_asset_url: string;
  lyrics?: string;
  hero_segments?: number[];
  style_chips?: string[];
  output?: { duration_sec?: number };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    // Note: Subscription check disabled for testing
    // Re-enable in production:
    // const { data: subscription } = await supabaseClient
    //   .from("subscriptions")
    //   .select("status")
    //   .eq("user_id", user.id)
    //   .single();
    // if (!subscription || !["active", "trialing"].includes(subscription.status)) {
    //   return new Response(
    //     JSON.stringify({ error: "Active subscription required" }),
    //     { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    //   );
    // }

    const plan: DirectorPlan = await req.json();
    console.log("Creating job with plan:", plan);

    // Create job record
    const { data: job, error: jobError } = await supabaseClient
      .from("jobs")
      .insert({
        user_id: user.id,
        status: "queued",
        emotion: plan.emotion,
        lyrics: plan.lyrics || null,
        song_url: plan.song_asset_url,
        selfie_url: plan.selfie_asset_url,
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      throw new Error("Failed to create job");
    }

    console.log("Created job:", job.id);

    return new Response(JSON.stringify({ job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Create job error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
