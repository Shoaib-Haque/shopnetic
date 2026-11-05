import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Probes the duration in seconds of a video file using native ffprobe.
 * Spawns:
 * `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <filePath>`
 * Returns rounded integer duration in seconds.
 */
export async function probeVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);

  const durationFloat = parseFloat(stdout.trim());
  if (!Number.isFinite(durationFloat) || durationFloat < 0) {
    throw new Error(`Failed to parse video duration from ffprobe output: "${stdout.trim()}"`);
  }

  return Math.round(durationFloat);
}
