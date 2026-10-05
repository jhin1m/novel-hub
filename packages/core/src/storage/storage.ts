/** Object storage as story services need it. Implemented by `createS3Storage`; tests use an in-memory fake. */
export interface StoragePort {
  put(
    key: string,
    body: Uint8Array,
    opts: { contentType: string; cacheControl: string },
  ): Promise<void>;
  /** Only test cleanup uses it: old covers are kept so cached HTML and restored backups keep working. */
  delete(key: string): Promise<void>;
  /** Public URL of an object, as stored in the database and shown to readers. */
  publicUrl(key: string): string;
}
