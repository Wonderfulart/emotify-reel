import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { job_id, final_video_url } = await req.json();
    console.log("Finalizing job:", job_id);

    // Verify job belongs to user
    const { data: job, error: jobError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", job_id)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      throw new Error("Job not found");
    }

    // Verify the URL is from outputs bucket
    if (!final_video_url || !final_video_url.includes("outputs")) {
      throw new Error("Invalid video URL");
    }

    // Update job with final video URL
    await supabaseClient
      .from("jobs")
      .update({ 
        status: "done",
        result_url: final_video_url,
      })
      .eq("id", job_id);

    // Insert asset record for final video
    await supabaseClient
      .from("assets")
      .insert({
        user_id: user.id,
        type: "final_video",
        url: final_video_url,
        meta: { job_id },
      });

    console.log("Job finalized successfully");

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Finalize job error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
