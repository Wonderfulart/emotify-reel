export type Emotion = 
  | 'unfiltered'
  | 'vulnerable'
  | 'untouchable'
  | 'numb'
  | 'ascending'
  | 'unhinged';

export interface EmotionOption {
  id: Emotion;
  label: string;
  description: string;
  icon: string;
}

export type AssetType = 
  | 'selfie_image'
  | 'selfie_video'
  | 'audio'
  | 'lyrics_text'
  | 'storyboard_image'
  | 'veo_clip'
  | 'hero_shot'
  | 'lipsync_clip'
  | 'final_video';

export type JobStatus = 
  | 'queued'
  | 'running'
  | 'ready_for_assembly'
  | 'assembling'
  | 'done'
  | 'error';

export interface Asset {
  id: string;
  user_id: string;
  type: AssetType;
  url: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface Job {
  id: string;
  user_id: string;
  status: JobStatus;
  emotion: Emotion;
  lyrics?: string;
  song_url: string;
  selfie_url: string;
  result_url?: string;
  provider_refs: Record<string, unknown>;
  error?: string;
  assembly_manifest?: AssemblyManifest;
  created_at: string;
  updated_at: string;
}

export interface AssemblyClip {
  url: string;
  type: AssetType;
  duration_sec?: number;
  start_time?: number;
}

export interface AssemblyManifest {
  clips: AssemblyClip[];
  audio_url: string;
  target: {
    aspect_ratio: '9:16';
    duration_sec: number;
  };
  upload_target: {
    bucket: string;
    path: string;
  };
}

export interface DirectorPlan {
  emotion: Emotion;
  platform: '9:16';
  selfie_asset_url: string;
  song_asset_url: string;
  lyrics?: string;
  hero_segments?: number[];
  style_chips?: string[];
  output?: {
    duration_sec?: number;
  };
}

export interface UploadState {
  selfie: File | null;
  selfiePreview: string | null;
  audio: File | null;
  audioName: string | null;
  lyrics: string;
}

export interface Subscription {
  user_id: string;
  status: 'active' | 'trialing' | 'canceled' | 'past_due' | 'incomplete';
  current_period_end: string;
  price_id: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  stripe_customer_id?: string;
  plan: 'free' | 'creator' | 'pro';
  created_at: string;
}
