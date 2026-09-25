import { describe, test, expect, jest } from '@jest/globals';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { S3StorageProvider } from '../../../../src/infrastructure/storage/s3StorageProvider.js';
import { ExternalServiceError } from '../../../../src/errors/AppError.js';

function buildProvider(overrides = {}) {
  const s3Client = { send: jest.fn().mockResolvedValue({}) };
  const provider = new S3StorageProvider({
    bucket: 'desavii-media',
    region: 'auto',
    publicBaseUrl: 'https://media.desavii.com',
    s3Client,
    ...overrides,
  });
  return { provider, s3Client };
}

describe('S3StorageProvider (P0.7)', () => {
  test('throws ExternalServiceError at construction when no bucket is configured', () => {
    expect(() => new S3StorageProvider({})).toThrow(ExternalServiceError);
  });

  test('put() sends a real PutObjectCommand with the right bucket/key/body/content-type', async () => {
    const { provider, s3Client } = buildProvider();
    const data = Buffer.from('fake image bytes');

    const result = await provider.put('listings/42/cover.jpg', data, {
      contentType: 'image/jpeg',
    });

    expect(s3Client.send).toHaveBeenCalledTimes(1);
    const command = s3Client.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'desavii-media',
      Key: 'listings/42/cover.jpg',
      Body: data,
      ContentType: 'image/jpeg',
    });
    expect(result).toEqual({
      key: 'listings/42/cover.jpg',
      url: 'https://media.desavii.com/listings/42/cover.jpg',
    });
  });

  test('getUrl() builds from publicBaseUrl, stripping a trailing slash', () => {
    const { provider } = buildProvider({
      publicBaseUrl: 'https://media.desavii.com/',
    });
    expect(provider.getUrl('a/b.png')).toBe(
      'https://media.desavii.com/a/b.png',
    );
  });

  test('getUrl() throws ExternalServiceError when no publicBaseUrl is configured', () => {
    const { provider } = buildProvider({ publicBaseUrl: '' });
    expect(() => provider.getUrl('a/b.png')).toThrow(ExternalServiceError);
  });

  test('delete() sends a real DeleteObjectCommand for the given key', async () => {
    const { provider, s3Client } = buildProvider();
    await provider.delete('listings/42/cover.jpg');
    expect(s3Client.send).toHaveBeenCalledTimes(1);
    const command = s3Client.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: 'desavii-media',
      Key: 'listings/42/cover.jpg',
    });
  });

  test('put() wraps a real S3 failure in ExternalServiceError, never leaking the raw AWS error', async () => {
    const s3Client = {
      send: jest.fn().mockRejectedValue(new Error('NoSuchBucket')),
    };
    const provider = new S3StorageProvider({
      bucket: 'desavii-media',
      publicBaseUrl: 'https://media.desavii.com',
      s3Client,
    });
    await expect(
      provider.put('key.jpg', Buffer.from('x'), {}),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });

  test('delete() wraps a real S3 failure in ExternalServiceError', async () => {
    const s3Client = {
      send: jest.fn().mockRejectedValue(new Error('AccessDenied')),
    };
    const provider = new S3StorageProvider({
      bucket: 'desavii-media',
      publicBaseUrl: 'https://media.desavii.com',
      s3Client,
    });
    await expect(provider.delete('key.jpg')).rejects.toBeInstanceOf(
      ExternalServiceError,
    );
  });

  // Step L3.1 (brief §10): `getKeyFromUrl` is the inverse of `getUrl` —
  // lets a caller that only ever persisted `url` (never `key`) recover
  // the key for a later delete.
  describe('getKeyFromUrl (Step L3.1)', () => {
    test('recovers the exact key a matching getUrl() produced', () => {
      const { provider } = buildProvider();
      const key = 'listings/42/cover.jpg';
      expect(provider.getKeyFromUrl(provider.getUrl(key))).toBe(key);
    });

    test('returns null when no publicBaseUrl is configured', () => {
      const { provider } = buildProvider({ publicBaseUrl: '' });
      expect(
        provider.getKeyFromUrl('https://media.desavii.com/a/b.png'),
      ).toBeNull();
    });

    test("returns null for a URL that does not match this bucket's base URL", () => {
      const { provider } = buildProvider();
      expect(
        provider.getKeyFromUrl('https://other-cdn.example/a/b.png'),
      ).toBeNull();
    });
  });
});
