import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { probeVideoDuration, probeVideoStructure } from './video-probe.js';

describe('probeVideoStructure & probeVideoDuration', () => {
  const dir = resolve(process.cwd(), '../../tmp/catalog/media');
  const fixturePath = resolve(dir, 'test-5s.mp4');

  it('probes real video duration and structure accurately', async () => {
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

    const structure = await probeVideoStructure(fixturePath);
    expect(structure.durationS).toBe(5);
    expect(structure.width).toBe(320);
    expect(structure.height).toBe(240);
  });

  it('rejects on truncated / padded video with valid ftyp header but no video data (oversized_mock)', async () => {
    const truncatedPath = resolve(dir, 'oversized_mock.mp4');
    mkdirSync(dir, { recursive: true });
    // Valid ftyp mp4 box header followed by null byte padding
    const mockBuffer = Buffer.concat([
      Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0x00, 0x00, 0x00,
        0x00,
      ]),
      Buffer.alloc(1024),
    ]);
    writeFileSync(truncatedPath, mockBuffer);

    try {
      await expect(probeVideoStructure(truncatedPath)).rejects.toThrow();
      await expect(probeVideoDuration(truncatedPath)).rejects.toThrow();
    } finally {
      if (existsSync(truncatedPath)) {
        unlinkSync(truncatedPath);
      }
    }
  });

  it('rejects on non-existent or invalid file', async () => {
    await expect(probeVideoDuration('/non-existent-probe-test.mp4')).rejects.toThrow();
  });
});
