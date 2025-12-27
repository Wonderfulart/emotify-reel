import { z } from 'zod';
import { JobStatus, Emotion, SubscriptionStatus, Plan, Platform } from './constants';

// Job schema
export const JobSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  status: z.enum([
    JobStatus.QUEUED,
    JobStatus.RUNNING,
    JobStatus.ASSEMBLING,
    JobStatus.DONE,
    JobStatus.ERROR,
  ]),
  emotion: z.enum([
    Emotion.HAPPY,
    Emotion.SAD,
    Emotion.EXCITED,
    Emotion.CALM,
    Emotion.ANGRY,
    Emotion.FEARFUL,
    Emotion.SURPRISED,
  ]).nullable(),
  lyrics: z.string().nullable(),
  song_url: z.string().nullable(),
  selfie_url: z.string().nullable(),
  result_url: z.string().nullable(),
  error: z.string().nullable(),
  provider_refs: z.record(z.unknown()).nullable(),
  assembly_manifest: z.unknown().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type JobFromSchema = z.infer<typeof JobSchema>;

// Subscription schema
export const SubscriptionSchema = z.object({
  user_id: z.string().uuid(),
  status: z.enum([
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.TRIALING,
    SubscriptionStatus.PAST_DUE,
    SubscriptionStatus.CANCELED,
    SubscriptionStatus.INCOMPLETE,
  ]).nullable(),
  current_period_end: z.string().nullable(),
  price_id: z.string().nullable(),
  updated_at: z.string().nullable(),
});

export type SubscriptionFromSchema = z.infer<typeof SubscriptionSchema>;

// Profile schema
export const ProfileSchema = z.object({
  id: z.string().uuid(),
  plan: z.enum([Plan.FREE, Plan.CREATOR]).nullable(),
  stripe_customer_id: z.string().nullable(),
  created_at: z.string().nullable(),
});

export type ProfileFromSchema = z.infer<typeof ProfileSchema>;

// Assembly manifest schema (for client-side video assembly)
export const ClipSchema = z.object({
  type: z.enum(['video', 'image']),
  url: z.string().url(),
  duration: z.number().positive().optional(),
  startTime: z.number().nonnegative().optional(),
});

export const AssemblyManifestSchema = z.object({
  clips: z.array(ClipSchema),
  audioUrl: z.string().url(),
  totalDuration: z.number().positive(),
  resolution: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
});

export type AssemblyManifestFromSchema = z.infer<typeof AssemblyManifestSchema>;

// Request body schemas for edge functions
export const CreateJobRequestSchema = z.object({
  emotion: z.string().min(1),
  platform: z.string().default(Platform.PORTRAIT),
  selfie_asset_url: z.string().url(),
  song_asset_url: z.string().url(),
  lyrics: z.string().optional(),
  hero_segments: z.array(z.number()).optional(),
  style_chips: z.array(z.string()).optional(),
  output: z.object({
    duration_sec: z.number().positive().optional(),
  }).optional(),
});

export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

// Utility function to safely parse with error handling
export function safeParse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  context?: string
): T {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errorMessage = result.error.errors
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join(', ');
    
    console.error(`Validation failed${context ? ` for ${context}` : ''}:`, errorMessage);
    throw new Error(`Invalid data${context ? ` for ${context}` : ''}: ${errorMessage}`);
  }
  
  return result.data;
}
