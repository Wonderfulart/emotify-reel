import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Logging helper
function log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const logEntry = JSON.stringify({ timestamp, level, message, ...context });
  if (level === 'error') {
    console.error(logEntry);
  } else if (level === 'warn') {
    console.warn(logEntry);
  } else {
    console.log(logEntry);
  }
}

// Validate required environment variables
function validateEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missing = required.filter(key => !Deno.env.get(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate environment at startup
  try {
    validateEnv();
  } catch (error) {
    log('error', 'Environment validation failed', { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: "Server configuration error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      log('warn', 'Missing authorization header');
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      log('warn', 'Unauthorized access attempt', { error: authError?.message });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const { job_id, final_video_url } = body;
    
    // Validate required fields
    if (!job_id) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!final_video_url) {
      return new Response(
        JSON.stringify({ error: "final_video_url is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    log('info', 'Finalizing job', { jobId: job_id, userId: user.id });

    // Verify job belongs to user and is in correct state
    const { data: job, error: jobError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      log('error', 'Job not found', { jobId: job_id, userId: user.id });
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify job is in correct state
    const validStates = ['ready_for_assembly', 'assembling', 'running'];
    if (!validStates.includes(job.status || '')) {
      log('warn', 'Job in invalid state for finalization', { jobId: job_id, status: job.status });
      return new Response(
        JSON.stringify({ error: `Cannot finalize job in '${job.status}' state` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the URL is from outputs bucket (basic security check)
    if (!final_video_url.includes("outputs") && !final_video_url.includes("supabase")) {
      log('error', 'Invalid video URL', { jobId: job_id, url: final_video_url.substring(0, 50) });
      return new Response(
        JSON.stringify({ error: "Invalid video URL" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job with final video URL
    const { error: updateError } = await supabaseClient
      .from("jobs")
      .update({ 
        status: "done",
        result_url: final_video_url,
      })
      .eq("id", job_id);

    if (updateError) {
      log('error', 'Failed to update job', { jobId: job_id, error: updateError.message });
      throw updateError;
    }

    // Insert asset record for final video
    const { error: assetError } = await supabaseClient
      .from("assets")
      .insert({
        user_id: user.id,
        type: "final_video",
        url: final_video_url,
        meta: { job_id },
      });

    if (assetError) {
      log('warn', 'Failed to insert asset record', { jobId: job_id, error: assetError.message });
      // Non-fatal error, continue
    }

    log('info', 'Job finalized successfully', { jobId: job_id, userId: user.id });

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log('error', 'Finalize job error', { error: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ error: "Failed to finalize job" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
