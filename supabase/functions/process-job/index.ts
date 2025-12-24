import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AssemblyClip {
  url: string;
  type: string;
  duration_sec?: number;
}

interface AssemblyManifest {
  clips: AssemblyClip[];
  audio_url: string;
  target: {
    aspect_ratio: string;
    duration_sec: number;
  };
  upload_target: {
    bucket: string;
    path: string;
  };
}

interface StoryboardScene {
  type: "avatar" | "broll";
  prompt: string;
  duration_sec: number;
}

// Google OAuth2 token generation using service account
async function getGoogleAccessToken(): Promise<string | null> {
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    console.log("No GOOGLE_SERVICE_ACCOUNT_JSON configured");
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);
    
    // Create JWT header
    const header = {
      alg: "RS256",
      typ: "JWT",
    };
    
    // Create JWT claims
    const claims = {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/cloud-platform",
    };
    
    // Base64url encode helper
    const base64UrlEncode = (data: Uint8Array): string => {
      return btoa(String.fromCharCode(...data))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
    };
    
    const encoder = new TextEncoder();
    const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
    const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
    
    const signatureInput = `${headerB64}.${claimsB64}`;
    
    // Import private key and sign
    const pemContents = serviceAccount.private_key
      .replace("-----BEGIN PRIVATE KEY-----", "")
      .replace("-----END PRIVATE KEY-----", "")
      .replace(/\s/g, "");
    
    const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      encoder.encode(signatureInput)
    );
    
    const signatureB64 = base64UrlEncode(new Uint8Array(signature));
    
    const jwt = `${signatureInput}.${signatureB64}`;
    
    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    
    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error("OAuth2 token error:", err);
      return null;
    }
    
    const tokenData = await tokenResponse.json();
    console.log("Successfully obtained Google access token");
    return tokenData.access_token;
  } catch (error) {
    console.error("Error generating Google access token:", error);
    return null;
  }
}

// Generate storyboard using OpenAI
async function generateStoryboard(emotion: string, lyrics: string | null): Promise<StoryboardScene[]> {
  const openaiKey = Deno.env.get("OPEN_AI_KEY");
  if (!openaiKey) {
    console.log("No OpenAI key, using default storyboard");
    return getDefaultStoryboard(emotion);
  }

  try {
    console.log("Generating storyboard with OpenAI...");
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are a music video director. Create a storyboard with 3-4 scenes for a short-form vertical video.
Return JSON array with scenes. Each scene has: type ("avatar" for lip-sync or "broll" for b-roll footage), prompt (visual description for AI video generation), duration_sec (2-4 seconds each).
Avatar scenes show the performer singing. B-roll scenes are cinematic visuals matching the mood.
Total duration should be 10-15 seconds. Start and end with avatar scenes, b-roll in between.`
          },
          {
            role: "user",
            content: `Create a storyboard for a ${emotion} music video.${lyrics ? ` Lyrics: "${lyrics}"` : ""}`
          }
        ],
        response_format: { type: "json_object" },
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("OpenAI error:", err);
      return getDefaultStoryboard(emotion);
    }

    const data = await response.json();
    const content = JSON.parse(data.choices[0].message.content);
    console.log("Storyboard generated:", content);
    return content.scenes || content;
  } catch (error) {
    console.error("Storyboard generation error:", error);
    return getDefaultStoryboard(emotion);
  }
}

function getDefaultStoryboard(emotion: string): StoryboardScene[] {
  const emotionVisuals: Record<string, string> = {
    happy: "bright sunlit meadow with flowers swaying, golden hour lighting",
    sad: "rain falling on a window, soft blue tones, melancholic atmosphere",
    angry: "dramatic storm clouds, lightning, intense red and orange hues",
    love: "soft pink sunset, rose petals floating, romantic dreamy atmosphere",
    chill: "calm ocean waves at sunset, pastel colors, peaceful vibes",
    hype: "neon city lights at night, energetic motion blur, vibrant colors",
  };

  return [
    { type: "avatar", prompt: "performer singing emotionally to camera", duration_sec: 3 },
    { type: "broll", prompt: emotionVisuals[emotion] || "abstract colorful visuals", duration_sec: 4 },
    { type: "avatar", prompt: "close-up of performer singing with emotion", duration_sec: 3 },
  ];
}

// Generate video clip using Vertex AI Veo 3.1 with OAuth2
async function generateVeoClip(prompt: string, durationSec: number, accessToken: string): Promise<string | null> {
  const projectId = Deno.env.get("VERTEX_PROJECT_ID");
  const location = Deno.env.get("VERTEX_LOCATION") || "us-central1";

  if (!projectId) {
    console.log("No VERTEX_PROJECT_ID configured, skipping Veo generation");
    return null;
  }

  try {
    console.log("Generating Veo clip:", prompt);
    
    // Veo 3.1 API endpoint
    const endpoint = `https://${location}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${location}/publishers/google/models/veo-3.1:predictLongRunning`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instances: [{
          prompt: `${prompt}, vertical 9:16 aspect ratio, cinematic quality, smooth motion`,
        }],
        parameters: {
          aspectRatio: "9:16",
          durationSeconds: durationSec,
          numberOfVideos: 1,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Veo API error:", response.status, err);
      return null;
    }

    const data = await response.json();
    console.log("Veo response:", JSON.stringify(data).slice(0, 500));

    // Handle long-running operation - poll for completion
    if (data.name) {
      const operationId = data.name;
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
        
        const statusResp = await fetch(
          `https://${location}-aiplatform.googleapis.com/v1/${operationId}`,
          {
            headers: { "Authorization": `Bearer ${accessToken}` },
          }
        );
        
        const statusData = await statusResp.json();
        console.log("Veo operation status:", statusData.done ? "done" : "pending");
        
        if (statusData.done) {
          if (statusData.response?.predictions?.[0]?.videoUri) {
            return statusData.response.predictions[0].videoUri;
          }
          if (statusData.response?.predictions?.[0]?.video) {
            // Base64 encoded video - would need to upload to storage
            console.log("Received base64 video, needs upload handling");
            return null;
          }
          break;
        }
        attempts++;
      }
    }

    return null;
  } catch (error) {
    console.error("Veo generation error:", error);
    return null;
  }
}

// Generate lip-synced avatar using Sync.so
async function generateLipSync(selfieUrl: string, audioUrl: string): Promise<string | null> {
  const syncApiKey = Deno.env.get("SYNC_SO_API");
  
  if (!syncApiKey) {
    console.log("No Sync.so API key, skipping lip-sync");
    return null;
  }

  try {
    console.log("Generating lip-sync with Sync.so...");
    
    // Create lip-sync job
    const response = await fetch("https://api.sync.so/v2/generate", {
      method: "POST",
      headers: {
        "x-api-key": syncApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "lipsync-1.9.0-beta",
        input: [
          {
            type: "video",
            url: selfieUrl,
          },
          {
            type: "audio",
            url: audioUrl,
          },
        ],
        options: {
          output_format: "mp4",
          aspect_ratio: "9:16",
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Sync.so API error:", err);
      return null;
    }

    const data = await response.json();
    console.log("Sync.so job created:", data.id);

    // Poll for completion
    const jobId = data.id;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes max

    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
      
      const statusResp = await fetch(`https://api.sync.so/v2/generate/${jobId}`, {
        headers: { "x-api-key": syncApiKey },
      });
      
      const statusData = await statusResp.json();
      console.log("Sync.so status:", statusData.status);
      
      if (statusData.status === "COMPLETED") {
        return statusData.output_url || statusData.output?.[0]?.url;
      }
      
      if (statusData.status === "FAILED") {
        console.error("Sync.so job failed:", statusData.error);
        return null;
      }
      
      attempts++;
    }

    console.error("Sync.so job timed out");
    return null;
  } catch (error) {
    console.error("Sync.so error:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  let jobId: string | null = null;

  try {
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

    const body = await req.json();
    jobId = body.job_id;
    console.log("Processing job:", jobId);

    // Get job details
    const { data: job, error: jobError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      throw new Error("Job not found");
    }

    // Update job status to running
    await supabaseClient
      .from("jobs")
      .update({ status: "running" })
      .eq("id", jobId);

    console.log("Job status updated to running");

    // =====================================================
    // REAL AI PIPELINE
    // =====================================================

    // Step 0: Get Google OAuth2 access token for Vertex AI
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      console.log("Warning: Could not obtain Google access token, Veo generation will be skipped");
    }

    // Step 1: Generate storyboard
    const storyboard = await generateStoryboard(job.emotion || "happy", job.lyrics);
    console.log("Storyboard ready:", storyboard.length, "scenes");

    // Step 2: Process each scene
    const clips: AssemblyClip[] = [];
    let avatarVideoUrl: string | null = null;

    for (const scene of storyboard) {
      if (scene.type === "avatar") {
        // Generate lip-synced avatar (only once, reuse for all avatar scenes)
        if (!avatarVideoUrl) {
          avatarVideoUrl = await generateLipSync(job.selfie_url, job.song_url);
        }
        
        clips.push({
          url: avatarVideoUrl || job.selfie_url, // Fallback to selfie if lip-sync fails
          type: "avatar",
          duration_sec: scene.duration_sec,
        });
      } else {
        // Generate B-roll with Veo (only if we have access token)
        const brollUrl = accessToken 
          ? await generateVeoClip(scene.prompt, scene.duration_sec, accessToken)
          : null;
        
        clips.push({
          url: brollUrl || job.selfie_url, // Fallback to selfie if Veo fails
          type: "broll",
          duration_sec: scene.duration_sec,
        });
      }
    }

    // Calculate total duration
    const totalDuration = clips.reduce((sum, c) => sum + (c.duration_sec || 3), 0);

    // Create assembly manifest
    const assembly: AssemblyManifest = {
      clips,
      audio_url: job.song_url,
      target: {
        aspect_ratio: "9:16",
        duration_sec: totalDuration,
      },
      upload_target: {
        bucket: "outputs",
        path: `final/${jobId}.mp4`,
      },
    };

    // Store provider refs for debugging
    const providerRefs = {
      storyboard,
      has_lipsync: !!avatarVideoUrl,
      clips_generated: clips.filter(c => c.url !== job.selfie_url).length,
    };

    // Update job with assembly manifest
    await supabaseClient
      .from("jobs")
      .update({ 
        status: "ready_for_assembly",
        assembly_manifest: assembly,
        provider_refs: providerRefs,
      })
      .eq("id", jobId);

    console.log("Job ready for assembly with", clips.length, "clips");

    return new Response(
      JSON.stringify({ 
        status: "ready_for_assembly",
        assembly,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Process job error:", error);
    
    // Update job status to error
    if (jobId) {
      try {
        const serviceClient = createClient(
          Deno.env.get("SUPABASE_URL") ?? "",
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
        );
        await serviceClient
          .from("jobs")
          .update({ 
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", jobId);
      } catch {
        // Ignore cleanup errors
      }
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});