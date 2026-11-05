import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { probeVideoDuration } from './video-probe.js';

describe('probeVideoDuration (workers)', () => {
  const dir = resolve(process.cwd(), '../../tmp/catalog/media');
  const fixturePath = resolve(dir, 'test-5s.mp4');

  it('probes real video duration accurately', async () => {
    if (!existsSync(fixturePath)) {
      mkdirSync(dir, { recursive: true });
      execFileSync('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'testsrc=duration=5:size=320x240:rate=30',
        '-pix_fmt',
        'yuv420p',
        '-y',
        fixturePath,
      ]);
    }
    const duration = await probeVideoDuration(fixturePath);
    expect(duration).toBe(5);
  });

  it('rejects on non-existent or invalid file', async () => {
    await expect(probeVideoDuration('/non-existent-probe-test.mp4')).rejects.toThrow();
  });
});
