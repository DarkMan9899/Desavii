import { describe, test, expect } from '@jest/globals';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LocalStorageProvider } from '../../../../src/infrastructure/storage/localStorageProvider.js';

describe('LocalStorageProvider (Sprint 5 §8)', () => {
  test("defaults to the /uploads public URL contract app.js's static route relies on", () => {
    const provider = new LocalStorageProvider();
    expect(provider.publicPathPrefix).toBe('/uploads');
    expect(provider.getUrl('listings/1/cover.jpg')).toBe(
      '/uploads/listings/1/cover.jpg',
    );
  });

  test('rootDir is a real, resolved absolute path — never a bare relative string', () => {
    const provider = new LocalStorageProvider();
    expect(path.isAbsolute(provider.rootDir)).toBe(true);
    expect(provider.rootDir.endsWith('uploads')).toBe(true);
  });

  test('a custom rootDir/publicPathPrefix is honestly reflected by both accessors', async () => {
    const customRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-storage-provider-test-'),
    );
    const provider = new LocalStorageProvider({
      rootDir: customRoot,
      publicPathPrefix: '/media',
    });
    expect(provider.rootDir).toBe(path.resolve(customRoot));
    expect(provider.publicPathPrefix).toBe('/media');
    expect(provider.getUrl('avatars/7.png')).toBe('/media/avatars/7.png');
    await fs.rm(customRoot, { recursive: true, force: true });
  });

  test('put()/delete() round-trip through the real resolved rootDir', async () => {
    const customRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), 'local-storage-provider-test-'),
    );
    const provider = new LocalStorageProvider({ rootDir: customRoot });
    const data = Buffer.from('fake bytes');

    const result = await provider.put('a/b/c.bin', data);
    expect(result).toEqual({ key: 'a/b/c.bin', url: '/uploads/a/b/c.bin' });
    const written = await fs.readFile(path.join(customRoot, 'a/b/c.bin'));
    expect(Buffer.compare(written, data)).toBe(0);

    await provider.delete('a/b/c.bin');
    await expect(
      fs.access(path.join(customRoot, 'a/b/c.bin')),
    ).rejects.toThrow();

    await fs.rm(customRoot, { recursive: true, force: true });
  });

  test('rejects a storage key that attempts to escape rootDir', async () => {
    const provider = new LocalStorageProvider();
    await expect(provider.delete('../../etc/passwd')).rejects.toThrow(
      /escapes the storage root/,
    );
  });
});
