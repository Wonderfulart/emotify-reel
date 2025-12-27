import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Validate required environment variables at startup
const REQUIRED_ENV_VARS = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

function validateEnvVars(): void {
  const missing = REQUIRED_ENV_VARS.filter(
    (varName) => !Deno.env.get(varName)
  );
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

// Validate on cold start
validateEnvVars();

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

// Simple request body validation
function validateRequestBody(body: unknown): DirectorPlan {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body");
  }
  
  const plan = body as Record<string, unknown>;
  
  if (!plan.emotion || typeof plan.emotion !== "string") {
    throw new Error("Missing or invalid 'emotion' field");
  }
  if (!plan.selfie_asset_url || typeof plan.selfie_asset_url !== "string") {
    throw new Error("Missing or invalid 'selfie_asset_url' field");
  }
  if (!plan.song_asset_url || typeof plan.song_asset_url !== "string") {
    throw new Error("Missing or invalid 'song_asset_url' field");
  }
  
  return {
    emotion: plan.emotion as string,
    platform: (plan.platform as string) || "9:16",
    selfie_asset_url: plan.selfie_asset_url as string,
    song_asset_url: plan.song_asset_url as string,
    lyrics: plan.lyrics as string | undefined,
    hero_segments: plan.hero_segments as number[] | undefined,
    style_chips: plan.style_chips as string[] | undefined,
    output: plan.output as { duration_sec?: number } | undefined,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    console.log(`[${new Date().toISOString()}] CREATE-JOB: Request received`);
    
    // Auth client for user verification
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!
    );

    // Admin client for database operations (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Extract and validate auth token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error(`[${new Date().toISOString()}] CREATE-JOB: No authorization header`);
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);

    if (authError || !user) {
      console.error(`[${new Date().toISOString()}] CREATE-JOB: Auth failed - ${authError?.message || "No user"}`);
      return new Response(
        JSON.stringify({ error: "Invalid or expired session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[${new Date().toISOString()}] CREATE-JOB: User authenticated - ${user.id}`);

    // Check subscription status (enforce in production)
    const { data: subscription } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .single();
    
    // Uncomment for production subscription enforcement:
    // if (!subscription || !["active", "trialing"].includes(subscription.status ?? "")) {
    //   console.log(`[${new Date().toISOString()}] CREATE-JOB: Subscription required - user ${user.id}`);
    //   return new Response(
    //     JSON.stringify({ 
    //       error: "Active subscription required",
    //       code: "SUBSCRIPTION_REQUIRED",
    //       upgradeUrl: "/billing"
    //     }),
    //     { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    //   );
    // }
    
    console.log(`[${new Date().toISOString()}] CREATE-JOB: Subscription status - ${subscription?.status || "none"}`);

    // Parse and validate request body
    let plan: DirectorPlan;
    try {
      const rawBody = await req.json();
      plan = validateRequestBody(rawBody);
    } catch (parseError) {
      console.error(`[${new Date().toISOString()}] CREATE-JOB: Invalid request body - ${parseError}`);
      return new Response(
        JSON.stringify({ error: parseError instanceof Error ? parseError.message : "Invalid request body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`[${new Date().toISOString()}] CREATE-JOB: Creating job for emotion "${plan.emotion}"`);

    // Create job record using admin client (bypasses RLS - we already verified user)
    const { data: job, error: jobError } = await supabaseAdmin
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
      console.error(`[${new Date().toISOString()}] CREATE-JOB: Database error - ${jobError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to create job. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] CREATE-JOB: Success - job ${job.id} created in ${duration}ms`);

    return new Response(JSON.stringify({ job_id: job.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${new Date().toISOString()}] CREATE-JOB: Unexpected error after ${duration}ms -`, error);
    
    // Don't leak internal error details to client
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
