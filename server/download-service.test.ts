import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock download service types
interface DownloadProgress {
  file_id: string;
  filename: string;
  total_size: number;
  downloaded_size: number;
  progress_percent: number;
  speed: number;
  speed_formatted: string;
  eta: number;
  eta_formatted: string;
  status: "pending" | "downloading" | "paused" | "completed" | "failed";
  error_message?: string;
}

interface CacheInfo {
  total_files: number;
  total_size: number;
  total_size_formatted: string;
  files: Array<{
    path: string;
    filename: string;
    size: number;
    size_formatted: string;
    added_at: string;
    metadata: Record<string, any>;
  }>;
}

// Mock download manager
class MockDownloadManager {
  private downloads: Map<string, DownloadProgress> = new Map();
  private callbacks: Array<(progress: DownloadProgress) => void> = [];

  addProgressCallback(callback: (progress: DownloadProgress) => void) {
    this.callbacks.push(callback);
  }

  searchSentinel1Data(bbox: [number, number, number, number], startDate: string, endDate: string, maxResults: number) {
    // Simulate search results
    return {
      success: true,
      count: 2,
      products: [
        {
          granule_name: "S1A_IW_SLC__1SDV_20230206T034512",
          platform: "Sentinel-1A",
          start_time: "2023-02-06T03:45:12Z",
          file_size: 4500,
          download_url: "https://datapool.asf.alaska.edu/SLC/SA/S1A_IW_SLC__1SDV_20230206T034512.zip",
        },
        {
          granule_name: "S1A_IW_SLC__1SDV_20230218T034512",
          platform: "Sentinel-1A",
          start_time: "2023-02-18T03:45:12Z",
          file_size: 4200,
          download_url: "https://datapool.asf.alaska.edu/SLC/SA/S1A_IW_SLC__1SDV_20230218T034512.zip",
        },
      ],
    };
  }

  startDownload(downloadUrl: string, filename: string, fileId?: string): string {
    const id = fileId || Math.random().toString(36).substring(7);
    const progress: DownloadProgress = {
      file_id: id,
      filename,
      total_size: 4500000000,
      downloaded_size: 0,
      progress_percent: 0,
      speed: 0,
      speed_formatted: "0 B/s",
      eta: 0,
      eta_formatted: "--",
      status: "pending",
    };
    this.downloads.set(id, progress);
    return id;
  }

  pauseDownload(fileId: string): boolean {
    const download = this.downloads.get(fileId);
    if (download) {
      download.status = "paused";
      return true;
    }
    return false;
  }

  resumeDownload(fileId: string): boolean {
    const download = this.downloads.get(fileId);
    if (download && download.status === "paused") {
      download.status = "downloading";
      return true;
    }
    return false;
  }

  cancelDownload(fileId: string): boolean {
    const download = this.downloads.get(fileId);
    if (download) {
      download.status = "failed";
      download.error_message = "Cancelled by user";
      return true;
    }
    return false;
  }

  getDownloadStatus(fileId: string): DownloadProgress | undefined {
    return this.downloads.get(fileId);
  }

  getAllDownloads(): DownloadProgress[] {
    return Array.from(this.downloads.values());
  }
}

// Mock cache manager
class MockCacheManager {
  private cache: Map<string, any> = new Map();
  private totalSize = 0;

  addToCache(filePath: string, metadata?: Record<string, any>): string {
    const cacheId = Math.random().toString(36).substring(7);
    const fileInfo = {
      path: filePath,
      filename: filePath.split("/").pop() || "",
      size: 4500000000,
      size_formatted: "4.19 GB",
      added_at: new Date().toISOString(),
      metadata: metadata || {},
    };
    this.cache.set(cacheId, fileInfo);
    this.totalSize += fileInfo.size;
    return cacheId;
  }

  removeFromCache(cacheId: string, deleteFile = true): boolean {
    const fileInfo = this.cache.get(cacheId);
    if (fileInfo) {
      this.totalSize -= fileInfo.size;
      this.cache.delete(cacheId);
      return true;
    }
    return false;
  }

  clearCache(deleteFiles = true): number {
    const count = this.cache.size;
    this.cache.clear();
    this.totalSize = 0;
    return count;
  }

  getCacheInfo(): CacheInfo {
    return {
      total_files: this.cache.size,
      total_size: this.totalSize,
      total_size_formatted: this.formatSize(this.totalSize),
      files: Array.from(this.cache.values()),
    };
  }

  fileExists(filename: string): boolean {
    for (const fileInfo of this.cache.values()) {
      if (fileInfo.filename === filename) {
        return true;
      }
    }
    return false;
  }

  private formatSize(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

describe("Download Service", () => {
  let downloadManager: MockDownloadManager;
  let cacheManager: MockCacheManager;

  beforeEach(() => {
    downloadManager = new MockDownloadManager();
    cacheManager = new MockCacheManager();
  });

  describe("Search Sentinel-1 Data", () => {
    it("should search for Turkey earthquake data", () => {
      const bbox: [number, number, number, number] = [36.5, 37.0, 38.0, 38.5];
      const result = downloadManager.searchSentinel1Data(bbox, "2023-02-01", "2023-02-28", 10);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.products.length).toBe(2);
      expect(result.products[0].platform).toBe("Sentinel-1A");
    });

    it("should return product metadata", () => {
      const bbox: [number, number, number, number] = [36.5, 37.0, 38.0, 38.5];
      const result = downloadManager.searchSentinel1Data(bbox, "2023-02-01", "2023-02-28", 10);

      const product = result.products[0];
      expect(product.granule_name).toBeDefined();
      expect(product.download_url).toBeDefined();
      expect(product.file_size).toBeGreaterThan(0);
    });
  });

  describe("Download Management", () => {
    it("should start a download", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip",
        "test123"
      );

      expect(fileId).toBe("test123");
      const status = downloadManager.getDownloadStatus(fileId);
      expect(status).toBeDefined();
      expect(status?.status).toBe("pending");
    });

    it("should pause a download", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip"
      );

      const result = downloadManager.pauseDownload(fileId);
      expect(result).toBe(true);

      const status = downloadManager.getDownloadStatus(fileId);
      expect(status?.status).toBe("paused");
    });

    it("should resume a paused download", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip"
      );

      downloadManager.pauseDownload(fileId);
      const result = downloadManager.resumeDownload(fileId);
      expect(result).toBe(true);

      const status = downloadManager.getDownloadStatus(fileId);
      expect(status?.status).toBe("downloading");
    });

    it("should cancel a download", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip"
      );

      const result = downloadManager.cancelDownload(fileId);
      expect(result).toBe(true);

      const status = downloadManager.getDownloadStatus(fileId);
      expect(status?.status).toBe("failed");
      expect(status?.error_message).toBe("Cancelled by user");
    });

    it("should get all downloads", () => {
      downloadManager.startDownload("https://example.com/test1.zip", "test1.zip");
      downloadManager.startDownload("https://example.com/test2.zip", "test2.zip");

      const downloads = downloadManager.getAllDownloads();
      expect(downloads.length).toBe(2);
    });
  });

  describe("Cache Management", () => {
    it("should add file to cache", () => {
      const cacheId = cacheManager.addToCache("/data/test.zip", { type: "SLC" });

      expect(cacheId).toBeDefined();
      const info = cacheManager.getCacheInfo();
      expect(info.total_files).toBe(1);
    });

    it("should remove file from cache", () => {
      const cacheId = cacheManager.addToCache("/data/test.zip");
      const result = cacheManager.removeFromCache(cacheId);

      expect(result).toBe(true);
      const info = cacheManager.getCacheInfo();
      expect(info.total_files).toBe(0);
    });

    it("should clear all cache", () => {
      cacheManager.addToCache("/data/test1.zip");
      cacheManager.addToCache("/data/test2.zip");

      const count = cacheManager.clearCache();
      expect(count).toBe(2);

      const info = cacheManager.getCacheInfo();
      expect(info.total_files).toBe(0);
      expect(info.total_size).toBe(0);
    });

    it("should check if file exists", () => {
      cacheManager.addToCache("/data/test.zip");

      expect(cacheManager.fileExists("test.zip")).toBe(true);
      expect(cacheManager.fileExists("nonexistent.zip")).toBe(false);
    });

    it("should format cache size correctly", () => {
      cacheManager.addToCache("/data/test.zip");
      const info = cacheManager.getCacheInfo();

      expect(info.total_size_formatted).toMatch(/GB$/);
    });
  });

  describe("Progress Tracking", () => {
    it("should track download progress", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip"
      );

      const status = downloadManager.getDownloadStatus(fileId);
      expect(status?.progress_percent).toBe(0);
      expect(status?.downloaded_size).toBe(0);
    });

    it("should format speed correctly", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip"
      );

      const status = downloadManager.getDownloadStatus(fileId);
      expect(status?.speed_formatted).toBeDefined();
    });

    it("should format ETA correctly", () => {
      const fileId = downloadManager.startDownload(
        "https://example.com/test.zip",
        "test.zip"
      );

      const status = downloadManager.getDownloadStatus(fileId);
      expect(status?.eta_formatted).toBeDefined();
    });
  });
});
