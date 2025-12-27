import { z } from 'zod';

// File size limits in bytes
export const FILE_SIZE_LIMITS = {
  selfie: 10 * 1024 * 1024, // 10MB for images
  audio: 100 * 1024 * 1024, // 100MB for audio/video
} as const;

// Allowed MIME types
export const ALLOWED_MIME_TYPES = {
  selfie: ['image/jpeg', 'image/png', 'image/webp'],
  audio: ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'video/mp4'],
} as const;

export type FileType = keyof typeof FILE_SIZE_LIMITS;

export class FileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileValidationError';
  }
}

/**
 * Validates a file based on type, size, and MIME type
 * @throws FileValidationError if validation fails
 */
export function validateFile(file: File, type: FileType): void {
  // Check file exists
  if (!file) {
    throw new FileValidationError('No file provided');
  }

  // Check file size
  const maxSize = FILE_SIZE_LIMITS[type];
  if (file.size > maxSize) {
    const maxSizeMB = Math.round(maxSize / (1024 * 1024));
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1);
    throw new FileValidationError(
      `File is too large (${fileSizeMB}MB). Maximum size is ${maxSizeMB}MB.`
    );
  }

  // Check file size is not zero
  if (file.size === 0) {
    throw new FileValidationError('File is empty');
  }

  // Check MIME type
  const allowedTypes = ALLOWED_MIME_TYPES[type] as readonly string[];
  if (!allowedTypes.includes(file.type)) {
    const friendlyTypes = type === 'selfie' 
      ? 'JPEG, PNG, or WebP images'
      : 'MP3, WAV, M4A, or MP4 audio files';
    throw new FileValidationError(
      `Invalid file type "${file.type}". Please upload ${friendlyTypes}.`
    );
  }
}

/**
 * Sanitizes a filename by removing special characters
 * Keeps only alphanumeric characters, dots, and hyphens
 */
export function sanitizeFilename(filename: string): string {
  // Get the extension
  const lastDot = filename.lastIndexOf('.');
  const name = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const ext = lastDot > 0 ? filename.slice(lastDot) : '';
  
  // Sanitize the name part - keep only alphanumeric, dots, and hyphens
  const sanitizedName = name
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_+|_+$/g, '') // Trim underscores from start/end
    .slice(0, 100); // Limit length
  
  // Sanitize extension
  const sanitizedExt = ext
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 10);
  
  return sanitizedName + sanitizedExt || 'file';
}

// Zod schema for additional validation if needed
export const FileMetadataSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().positive(),
  type: z.string().min(1),
});
