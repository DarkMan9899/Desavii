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

  // Step L3.1 (brief §10): `getKeyFromUrl` is the inverse of `getUrl` —
  // lets a caller that only ever persisted `url` (never `key`) recover
  // the key for a later delete.
  describe('getKeyFromUrl (Step L3.1)', () => {
    test('recovers the exact key a matching getUrl() produced', () => {
      const provider = new LocalStorageProvider();
      const key = 'listings/1/cover.jpg';
      expect(provider.getKeyFromUrl(provider.getUrl(key))).toBe(key);
    });

    test('honors a custom publicPathPrefix', () => {
      const provider = new LocalStorageProvider({ publicPathPrefix: '/media' });
      expect(provider.getKeyFromUrl('/media/avatars/7.png')).toBe(
        'avatars/7.png',
      );
    });

    test('returns null for a URL that does not match this prefix', () => {
      const provider = new LocalStorageProvider();
      expect(provider.getKeyFromUrl('https://cdn.example/foo.png')).toBeNull();
      expect(provider.getKeyFromUrl(null)).toBeNull();
      expect(provider.getKeyFromUrl(undefined)).toBeNull();
    });
  });
});
