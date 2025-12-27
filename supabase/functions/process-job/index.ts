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

// Retry helper with exponential backoff
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; context?: string } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelay = 1000, context = 'operation' } = options;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log('warn', `${context} failed (attempt ${attempt}/${maxRetries})`, { error: lastError.message });
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  
  throw lastError;
}

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

// Validate required environment variables
function validateEnv() {
  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !Deno.env.get(key));
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

// Google OAuth2 token generation using service account
async function getGoogleAccessToken(): Promise<string | null> {
  const serviceAccountJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    log('info', 'No GOOGLE_SERVICE_ACCOUNT_JSON configured, skipping Vertex AI');
    return null;
  }

  try {
    const serviceAccount = JSON.parse(serviceAccountJson);
    const now = Math.floor(Date.now() / 1000);
    
    const header = { alg: "RS256", typ: "JWT" };
    const claims = {
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
      scope: "https://www.googleapis.com/auth/cloud-platform",
    };
    
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
      log('error', 'OAuth2 token error', { error: err });
      return null;
    }
    
    const tokenData = await tokenResponse.json();
    log('info', 'Successfully obtained Google access token');
    return tokenData.access_token;
  } catch (error) {
    log('error', 'Error generating Google access token', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// Generate storyboard using OpenAI with retry
async function generateStoryboard(emotion: string, lyrics: string | null): Promise<StoryboardScene[]> {
  const openaiKey = Deno.env.get("OPEN_AI_KEY");
  if (!openaiKey) {
    log('info', 'No OpenAI key, using default storyboard');
    return getDefaultStoryboard(emotion);
  }

  try {
    const result = await withRetry(async () => {
      log('info', 'Generating storyboard with OpenAI', { emotion });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
      
      try {
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
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`OpenAI API error: ${response.status} - ${err}`);
        }

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);
        return content.scenes || content;
      } finally {
        clearTimeout(timeoutId);
      }
    }, { maxRetries: 3, context: 'OpenAI storyboard generation' });
    
    log('info', 'Storyboard generated', { sceneCount: result.length });
    return result;
  } catch (error) {
    log('error', 'Storyboard generation failed, using defaults', { error: error instanceof Error ? error.message : String(error) });
    return getDefaultStoryboard(emotion);
  }
}

function getDefaultStoryboard(emotion: string): StoryboardScene[] {
  const emotionVisuals: Record<string, string> = {
    unfiltered: "raw urban street scene, graffiti walls, authentic documentary style",
    vulnerable: "soft rain on window, intimate bedroom lighting, gentle atmosphere",
    untouchable: "sleek modern architecture, cold steel and glass, powerful stance",
    numb: "foggy empty streets, muted colors, detached floating feeling",
    ascending: "sunrise over mountains, golden light rays, triumphant energy",
    unhinged: "chaotic neon lights, fast motion blur, wild energy",
  };

  return [
    { type: "avatar", prompt: "performer singing emotionally to camera", duration_sec: 3 },
    { type: "broll", prompt: emotionVisuals[emotion] || "abstract colorful visuals", duration_sec: 4 },
    { type: "avatar", prompt: "close-up of performer singing with emotion", duration_sec: 3 },
  ];
}

// Generate video clip using Vertex AI Veo 3.1 with retry
async function generateVeoClip(prompt: string, durationSec: number, accessToken: string): Promise<string | null> {
  const projectId = Deno.env.get("VERTEX_PROJECT_ID");
  const location = Deno.env.get("VERTEX_LOCATION") || "us-central1";

  if (!projectId) {
    log('info', 'No VERTEX_PROJECT_ID configured, skipping Veo generation');
    return null;
  }

  try {
    return await withRetry(async () => {
      log('info', 'Generating Veo clip', { prompt: prompt.substring(0, 50) });
      
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
        throw new Error(`Veo API error: ${response.status} - ${err}`);
      }

      const data = await response.json();

      // Handle long-running operation
      if (data.name) {
        const operationId = data.name;
        let attempts = 0;
        const maxAttempts = 60;

        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 5000));
          
          const statusResp = await fetch(
            `https://${location}-aiplatform.googleapis.com/v1/${operationId}`,
            { headers: { "Authorization": `Bearer ${accessToken}` } }
          );
          
          const statusData = await statusResp.json();
          
          if (statusData.done) {
            if (statusData.response?.predictions?.[0]?.videoUri) {
              return statusData.response.predictions[0].videoUri;
            }
            break;
          }
          attempts++;
        }
      }

      return null;
    }, { maxRetries: 2, context: 'Veo clip generation' });
  } catch (error) {
    log('error', 'Veo generation failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
  }
}

// Generate lip-synced avatar using Sync.so with retry
async function generateLipSync(selfieUrl: string, audioUrl: string): Promise<string | null> {
  const syncApiKey = Deno.env.get("SYNC_SO_API");
  
  if (!syncApiKey) {
    log('info', 'No Sync.so API key, skipping lip-sync');
    return null;
  }

  try {
    return await withRetry(async () => {
      log('info', 'Generating lip-sync with Sync.so');
      
      const response = await fetch("https://api.sync.so/v2/generate", {
        method: "POST",
        headers: {
          "x-api-key": syncApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "lipsync-1.9.0-beta",
          input: [
            { type: "video", url: selfieUrl },
            { type: "audio", url: audioUrl },
          ],
          options: {
            output_format: "mp4",
            aspect_ratio: "9:16",
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Sync.so API error: ${response.status} - ${err}`);
      }

      const data = await response.json();
      log('info', 'Sync.so job created', { jobId: data.id });

      // Poll for completion
      const jobId = data.id;
      let attempts = 0;
      const maxAttempts = 120;

      while (attempts < maxAttempts) {
        await new Promise(r => setTimeout(r, 5000));
        
        const statusResp = await fetch(`https://api.sync.so/v2/generate/${jobId}`, {
          headers: { "x-api-key": syncApiKey },
        });
        
        const statusData = await statusResp.json();
        
        if (statusData.status === "COMPLETED") {
          return statusData.output_url || statusData.output?.[0]?.url;
        }
        
        if (statusData.status === "FAILED") {
          throw new Error(`Sync.so job failed: ${statusData.error}`);
        }
        
        attempts++;
      }

      throw new Error("Sync.so job timed out");
    }, { maxRetries: 2, context: 'Sync.so lip-sync' });
  } catch (error) {
    log('error', 'Lip-sync generation failed', { error: error instanceof Error ? error.message : String(error) });
    return null;
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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  let jobId: string | null = null;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    jobId = body.job_id;
    
    if (!jobId) {
      return new Response(
        JSON.stringify({ error: "job_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    log('info', 'Processing job', { jobId, userId: user.id });

    // Get job details
    const { data: job, error: jobError } = await supabaseClient
      .from("jobs")
      .select("*")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .single();

    if (jobError || !job) {
      log('error', 'Job not found', { jobId, userId: user.id });
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update job status to running
    await supabaseClient
      .from("jobs")
      .update({ status: "running" })
      .eq("id", jobId);

    log('info', 'Job status updated to running', { jobId });

    // Step 0: Get Google OAuth2 access token for Vertex AI
    const accessToken = await getGoogleAccessToken();

    // Step 1: Generate storyboard
    const storyboard = await generateStoryboard(job.emotion || "unfiltered", job.lyrics);
    log('info', 'Storyboard ready', { jobId, sceneCount: storyboard.length });

    // Step 2: Process each scene
    const clips: AssemblyClip[] = [];
    let avatarVideoUrl: string | null = null;

    for (const scene of storyboard) {
      if (scene.type === "avatar") {
        if (!avatarVideoUrl) {
          avatarVideoUrl = await generateLipSync(job.selfie_url, job.song_url);
        }
        
        clips.push({
          url: avatarVideoUrl || job.selfie_url,
          type: "avatar",
          duration_sec: scene.duration_sec,
        });
      } else {
        const brollUrl = accessToken 
          ? await generateVeoClip(scene.prompt, scene.duration_sec, accessToken)
          : null;
        
        clips.push({
          url: brollUrl || job.selfie_url,
          type: "broll",
          duration_sec: scene.duration_sec,
        });
      }
    }

    const totalDuration = clips.reduce((sum, c) => sum + (c.duration_sec || 3), 0);

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

    const providerRefs = {
      storyboard,
      has_lipsync: !!avatarVideoUrl,
      clips_generated: clips.filter(c => c.url !== job.selfie_url).length,
    };

    await supabaseClient
      .from("jobs")
      .update({ 
        status: "ready_for_assembly",
        assembly_manifest: assembly,
        provider_refs: providerRefs,
      })
      .eq("id", jobId);

    log('info', 'Job ready for assembly', { jobId, clipCount: clips.length });

    return new Response(
      JSON.stringify({ status: "ready_for_assembly", assembly }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    log('error', 'Process job error', { jobId, error: error instanceof Error ? error.message : String(error) });
    
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
      JSON.stringify({ error: "Processing failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
