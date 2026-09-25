/**
 * StorageProvider port.
 *
 * Abstraction over "where an uploaded file's bytes actually live"
 * (Sprint 5 §8): a concrete implementation lives in
 * src/infrastructure/storage/ (e.g. localStorageProvider.js for
 * development). A future S3-compatible adapter is a second
 * implementation of this same port, selected at the composition root —
 * no caller-side code changes when production cloud storage is added in
 * a later sprint.
 *
 * `key` is always a logical, forward-slash-delimited storage path (e.g.
 * "media/2024/06/abc123.jpg"), independent of the host OS — a concrete
 * adapter is responsible for translating it into whatever addressing its
 * backing store actually uses.
 */

/* eslint-disable class-methods-use-this, no-unused-vars */
export class StorageProvider {
  /**
   * @param {string} key
   * @param {Buffer} data
   * @param {{ contentType?: string }} [options]
   * @returns {Promise<{ key: string, url: string }>}
   */
  async put(key, data, options) {
    throw new Error(
      'StorageProvider.put must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} key @returns {string} a URL the client can fetch */
  getUrl(key) {
    throw new Error(
      'StorageProvider.getUrl must be implemented by a concrete adapter.',
    );
  }

  /**
   * The inverse of `getUrl` — recovers the logical key from a URL this
   * same adapter previously produced. Step L3.1: lets a caller that only
   * ever persisted `url` (never `key`) still delete the right object
   * later, without a schema change to store `key` redundantly.
   * @param {string} url
   * @returns {string | null} the key, or `null` if `url` wasn't produced
   *   by this adapter (a stale/foreign URL — never guess).
   */
  getKeyFromUrl(url) {
    throw new Error(
      'StorageProvider.getKeyFromUrl must be implemented by a concrete adapter.',
    );
  }

  /** @param {string} key @returns {Promise<void>} */
  async delete(key) {
    throw new Error(
      'StorageProvider.delete must be implemented by a concrete adapter.',
    );
  }
}
/* eslint-enable class-methods-use-this, no-unused-vars */

export default StorageProvider;
