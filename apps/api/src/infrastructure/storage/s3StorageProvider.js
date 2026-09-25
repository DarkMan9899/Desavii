/**
 * S3-compatible StorageProvider — P0.7 (Master Roadmap).
 *
 * Implements the same `StorageProvider` port `LocalStorageProvider`
 * already establishes (Sprint 5 §8) — `put`/`getUrl`/`delete`, nothing
 * more, so every existing caller (listings media, message attachments,
 * user avatars) needs zero changes to use this instead. Genuinely works
 * against real AWS S3 *and* any S3-compatible provider (Cloudflare R2,
 * DigitalOcean Spaces, MinIO) via the AWS SDK's own `endpoint`/
 * `forcePathStyle` options — this app is never coupled to AWS
 * specifically, only to the S3 API shape every one of those providers
 * implements.
 *
 * MIME/size validation stays exactly where it already lives
 * (`modules/media/validators/mediaConstraints.js`) — this provider only
 * ever receives bytes a caller has already validated, the same
 * separation `LocalStorageProvider` already follows.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { StorageProvider } from '../../core/interfaces/StorageProvider.js';
import { ExternalServiceError } from '../../errors/AppError.js';
import { getModuleLogger } from '../../logging/logger.js';

const log = getModuleLogger('infrastructure:storage:s3');

export class S3StorageProvider extends StorageProvider {
  #client;

  #bucket;

  #publicBaseUrl;

  constructor({
    bucket,
    region,
    endpoint,
    accessKeyId,
    secretAccessKey,
    forcePathStyle,
    publicBaseUrl,
    s3Client,
  } = {}) {
    super();
    if (!bucket) {
      throw new ExternalServiceError(
        'The s3 storage provider is selected but STORAGE_S3_BUCKET is not configured.',
      );
    }
    this.#bucket = bucket;
    this.#publicBaseUrl = publicBaseUrl
      ? publicBaseUrl.replace(/\/+$/, '')
      : '';
    this.#client =
      s3Client ??
      new S3Client({
        region,
        endpoint,
        forcePathStyle,
        ...(accessKeyId && secretAccessKey
          ? { credentials: { accessKeyId, secretAccessKey } }
          : {}),
      });
  }

  async put(key, data, options = {}) {
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: key,
          Body: data,
          ContentType: options.contentType,
        }),
      );
    } catch (err) {
      log.error({ err, key }, 'S3 put failed');
      throw new ExternalServiceError(
        'Failed to store the file in object storage.',
      );
    }
    log.info(
      { key, contentType: options.contentType, bytes: data.length },
      'File stored in S3-compatible storage',
    );
    return { key, url: this.getUrl(key) };
  }

  getUrl(key) {
    if (!this.#publicBaseUrl) {
      throw new ExternalServiceError(
        'STORAGE_S3_PUBLIC_BASE_URL is not configured — cannot build a public URL for an S3 object.',
      );
    }
    return `${this.#publicBaseUrl}/${key}`;
  }

  getKeyFromUrl(url) {
    if (!this.#publicBaseUrl || typeof url !== 'string') return null;
    const prefix = `${this.#publicBaseUrl}/`;
    if (!url.startsWith(prefix)) return null;
    return url.slice(prefix.length);
  }

  async delete(key) {
    try {
      await this.#client.send(
        new DeleteObjectCommand({ Bucket: this.#bucket, Key: key }),
      );
    } catch (err) {
      log.error({ err, key }, 'S3 delete failed');
      throw new ExternalServiceError(
        'Failed to delete the file from object storage.',
      );
    }
  }
}

export default S3StorageProvider;
