import { LRUCache } from 'lru-cache';
import { createHash } from 'crypto';
import { promises as fsPromises, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { CacheEntry, CacheOptions, CacheConfig, CacheStats } from './types.js';

/**
 * S3 Download Cache with hybrid storage (memory index + disk files)
 *
 * Features:
 * - LRU eviction policy
 * - TTL-based expiration
 * - Content-addressed storage with SHA-256 hashing
 * - Sharded directory structure to avoid filesystem bloat
 * - ETag validation support
 * - Automatic cleanup of orphaned files
 */
export class S3DownloadCache {
  private cache: LRUCache<string, CacheEntry>;
  private config: CacheConfig;
  private stats: CacheStats;
  private currentSize: number = 0;
  private isShuttingDown: boolean = false;

  constructor(options: CacheOptions = {}) {
    // Apply defaults
    this.config = {
      maxSize: options.maxSize ?? 500 * 1024 * 1024, // 500MB
      maxEntries: options.maxEntries ?? 200,
      ttl: options.ttl ?? 24 * 60 * 60 * 1000, // 24 hours
      cacheDir: options.cacheDir ?? join(homedir(), '.media-wizard', 'cache'),
      enabled: options.enabled ?? true,
    };

    // Initialize stats
    this.stats = {
      hits: 0,
      misses: 0,
      entryCount: 0,
      totalSize: 0,
      evictions: 0,
      hitRate: 0,
      filesCleanedUp: 0,
    };

    // Initialize LRU cache with custom disposal function
    this.cache = new LRUCache<string, CacheEntry>({
      max: this.config.maxEntries,
      ttl: this.config.ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: false,
      dispose: (value: CacheEntry, key: string) => {
        // Clean up file when entry is evicted
        this.cleanupFile(value.filePath).catch(() => {
          // Silently ignore cleanup errors
        });
        this.currentSize -= value.size;
        this.stats.evictions++;
        this.stats.entryCount--;
      },
    });
  }

  /**
   * Initialize the cache (create directories)
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Create cache directory structure with sharding (00-ff)
      await fsPromises.mkdir(this.config.cacheDir, { recursive: true });

      // Create shard directories (256 shards for even distribution)
      const shardPromises: Promise<void>[] = [];
      for (let i = 0; i < 256; i++) {
        const shardDir = this.getShardDir(i.toString(16).padStart(2, '0'));
        const createShardPromise = fsPromises
          .mkdir(shardDir, { recursive: true })
          .catch(() => {
            // Ignore errors if directory already exists
            return undefined;
          })
          .then(() => {
            // Convert to void
          });
        shardPromises.push(createShardPromise);
      }

      await Promise.all(shardPromises);

      // Clean up orphaned files on initialization
      await this.cleanupOrphanedFiles();
    } catch (error) {
      // If initialization fails, disable cache
      this.config.enabled = false;
      console.error('Failed to initialize S3 cache:', error);
    }
  }

  /**
   * Generate a cache key using SHA-256 hash of S3 URL and profile
   */
  generateCacheKey(s3Url: string, profile?: string): string {
    const input = `${s3Url}|${profile || 'default'}`;
    return createHash('sha256').update(input).digest('hex');
  }

  /**
   * Get the shard directory for a cache key
   */
  private getShardDir(shardPrefix: string): string {
    return join(this.config.cacheDir, shardPrefix);
  }

  /**
   * Get the file path for a cache entry
   */
  private getFilePath(cacheKey: string): string {
    const shardPrefix = cacheKey.substring(0, 2);
    return join(this.getShardDir(shardPrefix), cacheKey);
  }

  /**
   * Check if a file exists in the cache
   */
  async get(s3Url: string, profile?: string, validateETag?: string): Promise<CacheEntry | null> {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = this.generateCacheKey(s3Url, profile);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Validate ETag if provided
    if (validateETag && entry.etag && entry.etag !== validateETag) {
      // ETag mismatch - remove stale entry
      await this.delete(cacheKey);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Verify file still exists on disk
    if (!existsSync(entry.filePath)) {
      // File was deleted externally - remove from cache
      this.cache.delete(cacheKey);
      this.currentSize -= entry.size;
      this.stats.entryCount--;
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access metadata
    entry.lastAccessedAt = Date.now();
    entry.hitCount++;

    this.stats.hits++;
    this.updateHitRate();

    return entry;
  }

  /**
   * Store a downloaded file in the cache
   */
  async set(
    s3Url: string,
    tempFilePath: string,
    profile?: string,
    etag?: string
  ): Promise<CacheEntry | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      // Get file stats
      const fileStats = await fsPromises.stat(tempFilePath);
      const fileSize = fileStats.size;

      // Check if file would exceed max size
      if (fileSize > this.config.maxSize) {
        // File too large to cache
        return null;
      }

      // Evict entries if needed to make room
      await this.evictToFit(fileSize);

      const cacheKey = this.generateCacheKey(s3Url, profile);
      const cacheFilePath = this.getFilePath(cacheKey);

      // Copy file to cache location
      await fsPromises.copyFile(tempFilePath, cacheFilePath);

      // Create cache entry
      const entry: CacheEntry = {
        key: cacheKey,
        s3Url,
        filePath: cacheFilePath,
        size: fileSize,
        ...(etag !== undefined && { etag }),
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        hitCount: 0,
      };

      // Store in cache
      this.cache.set(cacheKey, entry);
      this.currentSize += fileSize;
      this.stats.entryCount++;
      this.stats.totalSize = this.currentSize;

      return entry;
    } catch (error) {
      console.error('Failed to cache S3 download:', error);
      return null;
    }
  }

  /**
   * Delete a cache entry
   */
  async delete(cacheKey: string): Promise<void> {
    const entry = this.cache.get(cacheKey);
    if (entry) {
      await this.cleanupFile(entry.filePath);
      this.cache.delete(cacheKey);
      this.currentSize -= entry.size;
      this.stats.entryCount--;
      this.stats.totalSize = this.currentSize;
    }
  }

  /**
   * Evict entries to make room for a new file
   */
  private async evictToFit(requiredSize: number): Promise<void> {
    if (this.currentSize + requiredSize <= this.config.maxSize) {
      return;
    }

    // Get all entries sorted by last access time (oldest first)
    const entries = Array.from(this.cache.entries())
      .map(([key, entry]) => ({ key, entry }))
      .sort((a, b) => a.entry.lastAccessedAt - b.entry.lastAccessedAt);

    // Evict oldest entries until we have enough space
    for (const { key } of entries) {
      if (this.currentSize + requiredSize <= this.config.maxSize) {
        break;
      }
      await this.delete(key);
    }
  }

  /**
   * Clean up a cached file
   */
  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await fsPromises.unlink(filePath);
      this.stats.filesCleanedUp++;
    } catch {
      // Silently ignore cleanup errors
    }
  }

  /**
   * Clean up orphaned files (files in cache directory not in index)
   */
  private async cleanupOrphanedFiles(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    try {
      const validFiles = new Set<string>();

      // Collect all valid file paths from cache
      for (const entry of this.cache.values()) {
        validFiles.add(entry.filePath);
      }

      // Scan all shard directories
      for (let i = 0; i < 256; i++) {
        const shardPrefix = i.toString(16).padStart(2, '0');
        const shardDir = this.getShardDir(shardPrefix);

        try {
          const files = await fsPromises.readdir(shardDir);

          for (const file of files) {
            const filePath = join(shardDir, file);

            // Delete if not in valid files set
            if (!validFiles.has(filePath)) {
              await this.cleanupFile(filePath);
            }
          }
        } catch {
          // Ignore errors reading shard directory
        }
      }
    } catch (error) {
      console.error('Failed to cleanup orphaned cache files:', error);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      entryCount: this.cache.size,
      totalSize: this.currentSize,
    };
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }

  /**
   * Clear the entire cache
   */
  async clear(): Promise<void> {
    const entries = Array.from(this.cache.keys());

    for (const key of entries) {
      await this.delete(key);
    }

    this.cache.clear();
    this.currentSize = 0;
    this.stats.entryCount = 0;
    this.stats.totalSize = 0;
  }

  /**
   * Shutdown the cache (cleanup resources)
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Optionally clean up orphaned files on shutdown
    await this.cleanupOrphanedFiles();

    // Clear the cache
    this.cache.clear();
    this.currentSize = 0;
  }

  /**
   * Get cache configuration
   */
  getConfig(): CacheConfig {
    return { ...this.config };
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}
