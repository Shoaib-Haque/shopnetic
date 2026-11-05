import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { generatePosterCandidates } from './poster-generator.js';

describe('generatePosterCandidates', () => {
  const dir = resolve(process.cwd(), '../../tmp/catalog/media');
  const fixturePath = resolve(dir, 'test-poster-source.mp4');

  it('generates 3 candidate frames at 25%, 50%, and 75% of duration', async () => {
    if (!existsSync(fixturePath)) {
      mkdirSync(dir, { recursive: true });
      execFileSync('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=8:size=320x240:rate=30',
        '-pix_fmt',
        'yuv420p',
        '-y',
        fixturePath,
      ]);
    }

    const outDir = resolve(dir, 'candidates');
    mkdirSync(outDir, { recursive: true });

    const candidates = await generatePosterCandidates(fixturePath, 8, outDir, 'sample');
    expect(candidates).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(candidates[i]).toBe(resolve(outDir, `sample-poster-cand-${i + 1}.jpg`));
      expect(existsSync(candidates[i]!)).toBe(true);
      expect(statSync(candidates[i]!).size).toBeGreaterThan(0);
    }
  });

  it('rejects if video file does not exist', async () => {
    await expect(
      generatePosterCandidates('/invalid-path/missing.mp4', 10, dir, 'missing'),
    ).rejects.toThrow();
  });
});
