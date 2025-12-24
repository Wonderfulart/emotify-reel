import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { AssemblyManifest } from '@/types/veosync';

let ffmpeg: FFmpeg | null = null;
let loaded = false;

export async function loadFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && loaded) return ffmpeg;
  
  ffmpeg = new FFmpeg();
  
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  
  loaded = true;
  return ffmpeg;
}

export async function assembleVideo(
  manifest: AssemblyManifest,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ffmpegInstance = await loadFFmpeg();
  
  // Download all clips
  const clipFiles: string[] = [];
  const totalClips = manifest.clips.length + 1; // +1 for audio
  let downloadedCount = 0;

  for (let i = 0; i < manifest.clips.length; i++) {
    const clip = manifest.clips[i];
    const fileName = `clip_${i}.mp4`;
    const fileData = await fetchFile(clip.url);
    await ffmpegInstance.writeFile(fileName, fileData);
    clipFiles.push(fileName);
    downloadedCount++;
    onProgress?.((downloadedCount / totalClips) * 30); // 0-30% for downloads
  }

  // Download audio
  const audioData = await fetchFile(manifest.audio_url);
  await ffmpegInstance.writeFile('audio.mp3', audioData);
  downloadedCount++;
  onProgress?.(30);

  // Create concat file
  const concatContent = clipFiles.map(f => `file '${f}'`).join('\n');
  await ffmpegInstance.writeFile('concat.txt', concatContent);

  // Set up progress handler
  ffmpegInstance.on('progress', ({ progress }) => {
    onProgress?.(30 + progress * 60); // 30-90% for processing
  });

  // Concat videos and mux audio
  await ffmpegInstance.exec([
    '-f', 'concat',
    '-safe', '0',
    '-i', 'concat.txt',
    '-i', 'audio.mp3',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-shortest',
    '-y',
    'output.mp4'
  ]);

  onProgress?.(95);

  // Read output
  const data = await ffmpegInstance.readFile('output.mp4');
  // Convert to Blob - data could be Uint8Array or string
  let blob: Blob;
  if (typeof data === 'string') {
    blob = new Blob([data], { type: 'video/mp4' });
  } else {
    // Copy the Uint8Array to a new ArrayBuffer to avoid SharedArrayBuffer issues
    const buffer = new ArrayBuffer(data.length);
    const view = new Uint8Array(buffer);
    view.set(data);
    blob = new Blob([buffer], { type: 'video/mp4' });
  }

  // Cleanup
  for (const file of clipFiles) {
    await ffmpegInstance.deleteFile(file);
  }
  await ffmpegInstance.deleteFile('audio.mp3');
  await ffmpegInstance.deleteFile('concat.txt');
  await ffmpegInstance.deleteFile('output.mp4');

  onProgress?.(100);
  
  return blob;
}
