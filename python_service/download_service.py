"""
Data Download Service Module
Provides complete data download workflow with progress tracking
"""

import logging
import os
import json
import time
import hashlib
import asyncio
from typing import Dict, Any, List, Optional, Callable
from pathlib import Path
from datetime import datetime
import requests
from concurrent.futures import ThreadPoolExecutor
import threading

logger = logging.getLogger(__name__)


class DownloadProgress:
    """Track download progress for a single file"""
    
    def __init__(self, file_id: str, filename: str, total_size: int):
        self.file_id = file_id
        self.filename = filename
        self.total_size = total_size
        self.downloaded_size = 0
        self.start_time = time.time()
        self.status = "pending"  # pending, downloading, paused, completed, failed
        self.error_message = None
        self.speed = 0.0  # bytes per second
        self.eta = 0  # estimated time remaining in seconds
        
    def update(self, downloaded: int):
        """Update download progress"""
        self.downloaded_size = downloaded
        elapsed = time.time() - self.start_time
        if elapsed > 0:
            self.speed = downloaded / elapsed
            remaining = self.total_size - downloaded
            self.eta = int(remaining / self.speed) if self.speed > 0 else 0
    
    @property
    def progress_percent(self) -> float:
        if self.total_size == 0:
            return 0.0
        return (self.downloaded_size / self.total_size) * 100
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "file_id": self.file_id,
            "filename": self.filename,
            "total_size": self.total_size,
            "downloaded_size": self.downloaded_size,
            "progress_percent": round(self.progress_percent, 2),
            "speed": self.speed,
            "speed_formatted": self._format_speed(),
            "eta": self.eta,
            "eta_formatted": self._format_eta(),
            "status": self.status,
            "error_message": self.error_message
        }
    
    def _format_speed(self) -> str:
        if self.speed < 1024:
            return f"{self.speed:.1f} B/s"
        elif self.speed < 1024 * 1024:
            return f"{self.speed / 1024:.1f} KB/s"
        else:
            return f"{self.speed / (1024 * 1024):.1f} MB/s"
    
    def _format_eta(self) -> str:
        if self.eta < 60:
            return f"{self.eta}s"
        elif self.eta < 3600:
            return f"{self.eta // 60}m {self.eta % 60}s"
        else:
            hours = self.eta // 3600
            minutes = (self.eta % 3600) // 60
            return f"{hours}h {minutes}m"


class DownloadManager:
    """Manage multiple file downloads with progress tracking"""
    
    def __init__(self, download_dir: str = "./data/downloads"):
        self.download_dir = Path(download_dir)
        self.download_dir.mkdir(parents=True, exist_ok=True)
        
        self.downloads: Dict[str, DownloadProgress] = {}
        self.callbacks: List[Callable] = []
        self._lock = threading.Lock()
        self._executor = ThreadPoolExecutor(max_workers=3)
        self._paused_downloads = set()
        
        # ASF API configuration
        self.asf_token = os.environ.get("ASF_API_TOKEN")
        self.asf_search_url = "https://api.daac.asf.alaska.edu/services/search/param"
        self.asf_download_url = "https://datapool.asf.alaska.edu"
        
        logger.info(f"DownloadManager initialized, download_dir: {self.download_dir}")
    
    def add_progress_callback(self, callback: Callable):
        """Add callback for progress updates"""
        self.callbacks.append(callback)
    
    def _notify_progress(self, progress: DownloadProgress):
        """Notify all callbacks of progress update"""
        for callback in self.callbacks:
            try:
                callback(progress.to_dict())
            except Exception as e:
                logger.error(f"Progress callback error: {e}")
    
    def search_sentinel1_data(
        self,
        bbox: tuple,
        start_date: str,
        end_date: str,
        max_results: int = 10
    ) -> Dict[str, Any]:
        """
        Search for Sentinel-1 data in specified region
        
        Args:
            bbox: Bounding box (west, south, east, north)
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            max_results: Maximum number of results
            
        Returns:
            Search results with product metadata
        """
        try:
            params = {
                "platform": "Sentinel-1",
                "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
                "start": start_date,
                "end": end_date,
                "processingLevel": "SLC",
                "beamMode": "IW",
                "maxResults": str(max_results),
                "output": "json"
            }
            
            headers = {
                "Authorization": f"Bearer {self.asf_token}",
                "Accept": "application/json"
            }
            
            response = requests.get(
                self.asf_search_url,
                params=params,
                headers=headers,
                timeout=60
            )
            
            if response.status_code == 200:
                results = response.json()
                
                # Parse results
                products = []
                if isinstance(results, list):
                    for item in results:
                        product = {
                            "granule_name": item.get("granuleName", ""),
                            "platform": item.get("platform", ""),
                            "start_time": item.get("startTime", ""),
                            "end_time": item.get("stopTime", ""),
                            "path": item.get("pathNumber", ""),
                            "frame": item.get("frameNumber", ""),
                            "polarization": item.get("polarization", ""),
                            "beam_mode": item.get("beamModeType", ""),
                            "processing_level": item.get("processingLevel", ""),
                            "file_size": item.get("sizeMB", 0),
                            "download_url": item.get("downloadUrl", ""),
                            "browse_url": item.get("browseUrl", ""),
                            "geometry": item.get("stringFootprint", "")
                        }
                        products.append(product)
                
                return {
                    "success": True,
                    "count": len(products),
                    "products": products
                }
            else:
                return {
                    "success": False,
                    "error": f"Search failed with status {response.status_code}",
                    "count": 0,
                    "products": []
                }
                
        except Exception as e:
            logger.error(f"Search error: {e}")
            return {
                "success": False,
                "error": str(e),
                "count": 0,
                "products": []
            }
    
    def start_download(
        self,
        download_url: str,
        filename: str,
        file_id: str = None
    ) -> str:
        """
        Start downloading a file
        
        Args:
            download_url: URL to download from
            filename: Name for the downloaded file
            file_id: Optional unique ID for tracking
            
        Returns:
            Download ID for tracking
        """
        if file_id is None:
            file_id = hashlib.md5(download_url.encode()).hexdigest()[:12]
        
        # Create progress tracker
        progress = DownloadProgress(file_id, filename, 0)
        progress.status = "pending"
        
        with self._lock:
            self.downloads[file_id] = progress
        
        # Start download in background
        self._executor.submit(self._download_file, file_id, download_url, filename)
        
        return file_id
    
    def _download_file(self, file_id: str, url: str, filename: str):
        """Download file with progress tracking"""
        progress = self.downloads.get(file_id)
        if not progress:
            return
        
        try:
            progress.status = "downloading"
            self._notify_progress(progress)
            
            # Setup headers with auth
            headers = {
                "Authorization": f"Bearer {self.asf_token}"
            }
            
            # Start download with streaming
            response = requests.get(
                url,
                headers=headers,
                stream=True,
                timeout=300
            )
            
            if response.status_code != 200:
                progress.status = "failed"
                progress.error_message = f"HTTP {response.status_code}"
                self._notify_progress(progress)
                return
            
            # Get total size
            total_size = int(response.headers.get('content-length', 0))
            progress.total_size = total_size
            
            # Download file
            file_path = self.download_dir / filename
            downloaded = 0
            chunk_size = 1024 * 1024  # 1MB chunks
            
            with open(file_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    # Check if paused
                    if file_id in self._paused_downloads:
                        progress.status = "paused"
                        self._notify_progress(progress)
                        return
                    
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        progress.update(downloaded)
                        self._notify_progress(progress)
            
            progress.status = "completed"
            progress.downloaded_size = total_size
            self._notify_progress(progress)
            
            logger.info(f"Download completed: {filename}")
            
        except Exception as e:
            logger.error(f"Download error: {e}")
            progress.status = "failed"
            progress.error_message = str(e)
            self._notify_progress(progress)
    
    def pause_download(self, file_id: str) -> bool:
        """Pause a download"""
        if file_id in self.downloads:
            self._paused_downloads.add(file_id)
            return True
        return False
    
    def resume_download(self, file_id: str) -> bool:
        """Resume a paused download"""
        if file_id in self._paused_downloads:
            self._paused_downloads.discard(file_id)
            progress = self.downloads.get(file_id)
            if progress:
                # TODO: Implement resume with range headers
                progress.status = "downloading"
                self._notify_progress(progress)
            return True
        return False
    
    def cancel_download(self, file_id: str) -> bool:
        """Cancel a download"""
        if file_id in self.downloads:
            self._paused_downloads.add(file_id)
            progress = self.downloads[file_id]
            progress.status = "failed"
            progress.error_message = "Cancelled by user"
            self._notify_progress(progress)
            return True
        return False
    
    def get_download_status(self, file_id: str) -> Optional[Dict[str, Any]]:
        """Get status of a download"""
        progress = self.downloads.get(file_id)
        if progress:
            return progress.to_dict()
        return None
    
    def get_all_downloads(self) -> List[Dict[str, Any]]:
        """Get status of all downloads"""
        return [p.to_dict() for p in self.downloads.values()]


class DataCacheManager:
    """Manage downloaded data cache"""
    
    def __init__(self, cache_dir: str = "./data"):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.cache_index_file = self.cache_dir / "cache_index.json"
        self.cache_index = self._load_cache_index()
        
        logger.info(f"DataCacheManager initialized, cache_dir: {self.cache_dir}")
    
    def _load_cache_index(self) -> Dict[str, Any]:
        """Load cache index from file"""
        if self.cache_index_file.exists():
            try:
                with open(self.cache_index_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load cache index: {e}")
        return {"files": {}, "total_size": 0}
    
    def _save_cache_index(self):
        """Save cache index to file"""
        try:
            with open(self.cache_index_file, 'w') as f:
                json.dump(self.cache_index, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save cache index: {e}")
    
    def add_to_cache(
        self,
        file_path: str,
        metadata: Dict[str, Any] = None
    ) -> str:
        """
        Add a file to cache
        
        Args:
            file_path: Path to the file
            metadata: Optional metadata about the file
            
        Returns:
            Cache ID
        """
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        file_size = path.stat().st_size
        cache_id = hashlib.md5(str(path).encode()).hexdigest()[:12]
        
        self.cache_index["files"][cache_id] = {
            "path": str(path),
            "filename": path.name,
            "size": file_size,
            "size_formatted": self._format_size(file_size),
            "added_at": datetime.now().isoformat(),
            "metadata": metadata or {}
        }
        
        self.cache_index["total_size"] = sum(
            f["size"] for f in self.cache_index["files"].values()
        )
        
        self._save_cache_index()
        return cache_id
    
    def remove_from_cache(self, cache_id: str, delete_file: bool = True) -> bool:
        """
        Remove a file from cache
        
        Args:
            cache_id: Cache ID
            delete_file: Whether to delete the actual file
            
        Returns:
            True if successful
        """
        if cache_id not in self.cache_index["files"]:
            return False
        
        file_info = self.cache_index["files"][cache_id]
        
        if delete_file:
            try:
                path = Path(file_info["path"])
                if path.exists():
                    path.unlink()
            except Exception as e:
                logger.error(f"Failed to delete file: {e}")
        
        del self.cache_index["files"][cache_id]
        self.cache_index["total_size"] = sum(
            f["size"] for f in self.cache_index["files"].values()
        )
        
        self._save_cache_index()
        return True
    
    def clear_cache(self, delete_files: bool = True) -> int:
        """
        Clear all cached files
        
        Args:
            delete_files: Whether to delete actual files
            
        Returns:
            Number of files cleared
        """
        count = len(self.cache_index["files"])
        
        if delete_files:
            for file_info in self.cache_index["files"].values():
                try:
                    path = Path(file_info["path"])
                    if path.exists():
                        path.unlink()
                except Exception as e:
                    logger.error(f"Failed to delete file: {e}")
        
        self.cache_index = {"files": {}, "total_size": 0}
        self._save_cache_index()
        
        return count
    
    def get_cache_info(self) -> Dict[str, Any]:
        """Get cache information"""
        return {
            "total_files": len(self.cache_index["files"]),
            "total_size": self.cache_index["total_size"],
            "total_size_formatted": self._format_size(self.cache_index["total_size"]),
            "files": list(self.cache_index["files"].values())
        }
    
    def get_file_info(self, cache_id: str) -> Optional[Dict[str, Any]]:
        """Get information about a cached file"""
        return self.cache_index["files"].get(cache_id)
    
    def file_exists(self, filename: str) -> bool:
        """Check if a file is already cached"""
        for file_info in self.cache_index["files"].values():
            if file_info["filename"] == filename:
                return True
        return False
    
    def _format_size(self, size: int) -> str:
        """Format file size for display"""
        if size < 1024:
            return f"{size} B"
        elif size < 1024 * 1024:
            return f"{size / 1024:.1f} KB"
        elif size < 1024 * 1024 * 1024:
            return f"{size / (1024 * 1024):.1f} MB"
        else:
            return f"{size / (1024 * 1024 * 1024):.2f} GB"


# Global instances
download_manager = DownloadManager()
cache_manager = DataCacheManager()


def search_turkey_earthquake_data(max_results: int = 10) -> Dict[str, Any]:
    """
    Search for Sentinel-1 data in Turkey earthquake region (Feb 2023)
    
    Args:
        max_results: Maximum number of results
        
    Returns:
        Search results
    """
    # Turkey earthquake region (Feb 6, 2023)
    bbox = (36.5, 37.0, 38.0, 38.5)  # west, south, east, north
    start_date = "2023-02-01"
    end_date = "2023-02-28"
    
    return download_manager.search_sentinel1_data(
        bbox=bbox,
        start_date=start_date,
        end_date=end_date,
        max_results=max_results
    )


def download_product(product: Dict[str, Any]) -> str:
    """
    Start downloading a product
    
    Args:
        product: Product metadata from search results
        
    Returns:
        Download ID
    """
    filename = f"{product['granule_name']}.zip"
    
    # Check if already cached
    if cache_manager.file_exists(filename):
        logger.info(f"File already cached: {filename}")
        return "cached"
    
    return download_manager.start_download(
        download_url=product["download_url"],
        filename=filename,
        file_id=product["granule_name"][:12]
    )
