import { afterEach, describe, expect, it, vi } from 'vitest';
import { canShareFiles, downloadTextFile, readFileText } from './files';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('downloadTextFile', () => {
  it('offers the text as a named file download', async () => {
    let saved: Blob | undefined;
    // jsdom leaves these two undefined, so they are assigned rather than spied on.
    URL.createObjectURL = vi.fn((blob: Blob) => {
      saved = blob;
      return 'blob:backup';
    });
    URL.revokeObjectURL = vi.fn();
    let link: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      link = this;
    });

    downloadTextFile('backup.json', '{"a":1}');

    expect(link?.download).toBe('backup.json');
    expect(link?.href).toBe('blob:backup');
    expect(saved?.type).toBe('application/json');
    expect(await readFileText(saved as File)).toBe('{"a":1}');
    // The temporary link does not stay in the page.
    expect(document.querySelector('a')).toBeNull();
  });
});

describe('canShareFiles', () => {
  it('is false where the browser has no share sheet', () => {
    expect(canShareFiles()).toBe(false);
  });

  it('is true when the share sheet accepts files', () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => true });
    expect(canShareFiles()).toBe(true);
  });

  it('is false when the share sheet rejects files', () => {
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
    expect(canShareFiles()).toBe(false);
  });
});
