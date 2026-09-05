/**
 * Local-disk StorageProvider — development only.
 *
 * Implements Sprint 5 §8: an abstraction that can later support cloud
 * object storage without production cloud storage being wired up this
 * sprint. A future S3-compatible adapter implements the same
 * StorageProvider port and is selected at the composition root based on
 * configuration — zero changes to any caller.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StorageProvider } from '../../core/interfaces/StorageProvider.js';
import { getModuleLogger } from '../../logging/logger.js';

const log = getModuleLogger('infrastructure:storage:local');

export class LocalStorageProvider extends StorageProvider {
  #rootDir;

  #publicPathPrefix;

  constructor({ rootDir = 'uploads', publicPathPrefix = '/uploads' } = {}) {
    super();
    this.#rootDir = path.resolve(rootDir);
    this.#publicPathPrefix = publicPathPrefix;
  }

  /**
   * The real, resolved absolute directory this instance writes to and
   * `getUrl()` builds URLs relative to — `app.js`'s static-serving route
   * reads these two accessors instead of re-deriving/hardcoding the same
   * `'uploads'`/`'/uploads'` defaults a second time, so the route it
   * mounts always matches whatever this provider actually persists to,
   * even if these constructor defaults ever change.
   */
  get rootDir() {
    return this.#rootDir;
  }

  get publicPathPrefix() {
    return this.#publicPathPrefix;
  }

  /** Resolves a logical key to a real path, rejecting any attempt to escape rootDir. */
  #resolvePath(key) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new TypeError('Storage key must be a non-empty string.');
    }
    const resolved = path.resolve(this.#rootDir, key);
    if (
      resolved !== this.#rootDir &&
      !resolved.startsWith(this.#rootDir + path.sep)
    ) {
      throw new TypeError(`Storage key "${key}" escapes the storage root.`);
    }
    return resolved;
  }

  async put(key, data, options = {}) {
    const filePath = this.#resolvePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    log.info(
      { key, contentType: options.contentType, bytes: data.length },
      'File stored locally',
    );
    return { key, url: this.getUrl(key) };
  }

  getUrl(key) {
    return `${this.#publicPathPrefix}/${key}`;
  }

  async delete(key) {
    const filePath = this.#resolvePath(key);
    await fs.rm(filePath, { force: true });
  }
}

export default LocalStorageProvider;
