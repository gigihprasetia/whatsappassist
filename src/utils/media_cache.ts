import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

interface CachedMedia {
  data: string;
  mimetype: string;
  timestamp: number;
  mediaKey: string;
  filename?: string;
}

type CacheData = {
  data: any;
  timestamp: number;
}

type MetadataData = {
  mediaKey: string;
  mimetype?: string;
  filename?: string;
  timestamp: number;
  [key: string]: any;
}

export class MediaCache {
  private cache: Map<string, CacheData>;
  private metadataCache: Map<string, MetadataData>;
  private readonly CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private readonly metadataFile: string;

  private static instance: MediaCache;

  private constructor() {
    this.cache = new Map();
    this.metadataCache = new Map();
    
    // Setup cache directory and files
    this.cacheDir = join(process.cwd(), 'cache');
    this.cacheFile = join(this.cacheDir, 'media_cache.json');
    this.metadataFile = join(this.cacheDir, 'media_metadata.json');
    
    // Create cache directory if it doesn't exist
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.loadFromDisk();
  }

  public static getInstance(): MediaCache {
    if (!MediaCache.instance) {
      MediaCache.instance = new MediaCache();
    }
    return MediaCache.instance;
  }

  private loadFromDisk(): void {
    try {
      if (existsSync(this.cacheFile)) {
        const cacheData = JSON.parse(readFileSync(this.cacheFile, 'utf8'));
        this.cache = new Map(Object.entries(cacheData));
      }
      if (existsSync(this.metadataFile)) {
        const metadataData = JSON.parse(readFileSync(this.metadataFile, 'utf8'));
        this.metadataCache = new Map(Object.entries(metadataData));
      }
    } catch (error) {
      console.error('Error loading cache from disk:', error);
    }
  }

  private saveToDisk(): void {
    try {
      const cacheData = Object.fromEntries(this.cache);
      const metadataData = Object.fromEntries(this.metadataCache);
      
      writeFileSync(this.cacheFile, JSON.stringify(cacheData, null, 2));
      writeFileSync(this.metadataFile, JSON.stringify(metadataData, null, 2));
    } catch (error) {
      console.error('Error saving cache to disk:', error);
    }
  }

  public set(mediaKey: string, data: any): void {
    this.cache.set(mediaKey, {
      data,
      timestamp: Date.now(),
    });
    this.saveToDisk();
  }

  public get(mediaKey: string): any {
    const cached = this.cache.get(mediaKey);
    if (!cached) return undefined;

    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.CACHE_EXPIRY_MS) {
      this.cache.delete(mediaKey);
      this.saveToDisk();
      return undefined;
    }

    return cached.data;
  }

  public setMetadata(metadata: MetadataData): void {
    this.metadataCache.set(metadata.mediaKey, {
      ...metadata,
      timestamp: Date.now(),
    });
    this.saveToDisk();
  }

  public getMetadata(mediaKey: string): MetadataData | undefined {
    const metadata = this.metadataCache.get(mediaKey);
    if (!metadata) return undefined;

    if (Date.now() - metadata.timestamp > this.CACHE_EXPIRY_MS) {
      this.metadataCache.delete(mediaKey);
      this.saveToDisk();
      return undefined;
    }

    return metadata;
  }

  public clear(): void {
    this.cache.clear();
    this.metadataCache.clear();
    this.saveToDisk();
  }

  public clearExpired(): void {
    const now = Date.now();
    let hasChanges = false;

    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.CACHE_EXPIRY_MS) {
        this.cache.delete(key);
        hasChanges = true;
      }
    }

    for (const [key, value] of this.metadataCache.entries()) {
      if (now - value.timestamp > this.CACHE_EXPIRY_MS) {
        this.metadataCache.delete(key);
        hasChanges = true;
      }
    }
    
    if (hasChanges) {
      this.saveToDisk();
    }
  }
}

export const mediaCache = MediaCache.getInstance();
