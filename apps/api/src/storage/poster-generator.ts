import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

const execFileAsync = promisify(execFile);

/**
 * Extracts 3 candidate thumbnail frames from a video file at 25%, 50%, and 75%
 * of its probed duration using native ffmpeg.
 *
 * @param videoFilePath - Absolute path to local video file.
 * @param durationS - Duration of the video in seconds.
 * @param outputDir - Directory to store generated candidate images.
 * @param baseName - Base name prefix for generated image files.
 * @returns Array of absolute paths to the 3 generated JPEG candidate images.
 */
export async function generatePosterCandidates(
  videoFilePath: string,
  durationS: number,
  outputDir: string,
  baseName: string,
): Promise<string[]> {
  const safeDuration = Math.max(durationS, 0.1);
  const timestamps = [safeDuration * 0.25, safeDuration * 0.5, safeDuration * 0.75];
  const outputPaths: string[] = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i]!;
    const outPath = resolve(outputDir, `${baseName}-poster-cand-${i + 1}.jpg`);
    await execFileAsync('ffmpeg', [
      '-y',
      '-ss',
      timestamp.toFixed(2),
      '-i',
      videoFilePath,
      '-frames:v',
      '1',
      '-update',
      '1',
      '-q:v',
      '2',
      outPath,
    ]);
    outputPaths.push(outPath);
  }

  return outputPaths;
}
