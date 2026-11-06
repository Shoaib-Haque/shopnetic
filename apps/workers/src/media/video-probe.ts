import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VideoProbeResult {
  durationS: number;
  width?: number;
  height?: number;
  codec?: string;
}

/**
 * Structural video validation and duration probing using native ffprobe.
 *
 * Security:
 * - Restricts demuxer protocols strictly to `file` via `-protocol_whitelist file`.
 * - Enforces bounded execution timeout (10 seconds) to prevent hanging/stalling on malformed inputs.
 * - Confirms valid container metadata and presence of a decodable `video` stream.
 */
export async function probeVideoStructure(filePath: string): Promise<VideoProbeResult> {
  const { stdout } = await execFileAsync(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-show_entries',
      'format=duration:stream=codec_type,codec_name,width,height',
      '-of',
      'json',
      filePath,
    ],
    { timeout: 10_000, maxBuffer: 10 * 1024 * 1024 },
  );

  let parsed: {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>;
  };

  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Failed to parse ffprobe JSON output for file: ${filePath}`);
  }

  const durationStr = parsed.format?.duration;
  const durationFloat = durationStr ? parseFloat(durationStr) : NaN;
  if (!Number.isFinite(durationFloat) || durationFloat < 0) {
    throw new Error(`Invalid video duration parsed from ffprobe: "${durationStr}"`);
  }

  // Structural video check: must contain at least one stream with codec_type === 'video'
  const videoStream = parsed.streams?.find((s) => s.codec_type === 'video');
  if (!videoStream) {
    throw new Error(`Video file does not contain a decodable video stream: ${filePath}`);
  }

  return {
    durationS: durationFloat,
    ...(videoStream.width !== undefined ? { width: videoStream.width } : {}),
    ...(videoStream.height !== undefined ? { height: videoStream.height } : {}),
    ...(videoStream.codec_name !== undefined ? { codec: videoStream.codec_name } : {}),
  };
}

/**
 * Probes the duration in seconds of a video file using native ffprobe after
 * verifying structural integrity.
 */
export async function probeVideoDuration(filePath: string): Promise<number> {
  const result = await probeVideoStructure(filePath);
  return result.durationS;
}
