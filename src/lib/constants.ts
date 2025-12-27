// Job status constants
export const JobStatus = {
  QUEUED: 'queued',
  RUNNING: 'running',
  ASSEMBLING: 'assembling',
  DONE: 'done',
  ERROR: 'error',
} as const;

export type JobStatusType = typeof JobStatus[keyof typeof JobStatus];

// Emotion constants
export const Emotion = {
  HAPPY: 'happy',
  SAD: 'sad',
  EXCITED: 'excited',
  CALM: 'calm',
  ANGRY: 'angry',
  FEARFUL: 'fearful',
  SURPRISED: 'surprised',
} as const;

export type EmotionType = typeof Emotion[keyof typeof Emotion];

// Subscription status constants
export const SubscriptionStatus = {
  ACTIVE: 'active',
  TRIALING: 'trialing',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  INCOMPLETE: 'incomplete',
} as const;

export type SubscriptionStatusType = typeof SubscriptionStatus[keyof typeof SubscriptionStatus];

// Plan types
export const Plan = {
  FREE: 'free',
  CREATOR: 'creator',
} as const;

export type PlanType = typeof Plan[keyof typeof Plan];

// Platform/aspect ratio options
export const Platform = {
  PORTRAIT: '9:16',
  LANDSCAPE: '16:9',
  SQUARE: '1:1',
} as const;

export type PlatformType = typeof Platform[keyof typeof Platform];

// Rate limits
export const RATE_LIMITS = {
  FREE_JOBS_PER_HOUR: 10,
  PAID_JOBS_PER_HOUR: 50,
} as const;

// Retry configuration
export const RETRY_CONFIG = {
  MAX_RETRIES: 3,
  INITIAL_DELAY_MS: 1000,
  MAX_DELAY_MS: 10000,
} as const;

// Storage bucket names
export const StorageBuckets = {
  UPLOADS: 'uploads',
  OUTPUTS: 'outputs',
} as const;

// Signed URL expiry times (in seconds)
export const URL_EXPIRY = {
  UPLOAD: 3600, // 1 hour
  OUTPUT: 86400, // 24 hours
} as const;
