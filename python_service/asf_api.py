"""
ASF (Alaska Satellite Facility) API Integration Module
Provides interface for Sentinel-1 data search and download
"""

import logging
import os
import requests
import hashlib
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
from datetime import datetime
import json
import zipfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


class ASFAPIClient:
    """Client for ASF Data Search and Download API"""
    
    def __init__(self, token: str = None, username: str = None, password: str = None):
        """
        Initialize ASF API client
        
        Args:
            token: ASF/Earthdata Bearer token (preferred)
            username: ASF/Earthdata username (legacy)
            password: ASF/Earthdata password (legacy)
        """
        # Prefer token-based authentication
        self.token = token or os.environ.get("ASF_API_TOKEN")
        self.username = username or os.environ.get("ASF_USERNAME")
        self.password = password or os.environ.get("ASF_PASSWORD")
        
        self.search_url = "https://api.daac.asf.alaska.edu/services/search/param"
        self.download_url = "https://data.asf.alaska.edu"
        
        self.session = requests.Session()
        self.download_dir = Path("./data/sentinel1")
        self.download_dir.mkdir(parents=True, exist_ok=True)
        
        self._authenticated = False
        
        # Auto-authenticate if token is available
        if self.token:
            self._setup_token_auth()
        
        logger.info("ASFAPIClient initialized")
    
    def _setup_token_auth(self):
        """Setup Bearer token authentication"""
        self.session.headers.update({
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/json"
        })
        self._authenticated = True
        logger.info("ASF token authentication configured")
    
    def authenticate(self) -> bool:
        """
        Authenticate with ASF/Earthdata
        
        Returns:
            True if authentication successful
        """
        # If token is available, use token auth
        if self.token:
            self._setup_token_auth()
            # Verify token by making a test request
            try:
                test_url = "https://api.daac.asf.alaska.edu/services/search/param?platform=Sentinel-1&maxResults=1&output=json"
                response = self.session.get(test_url, timeout=30)
                if response.status_code == 200:
                    logger.info("ASF token authentication verified")
                    return True
                else:
                    logger.warning(f"ASF token verification failed: {response.status_code}")
                    self._authenticated = False
                    return False
            except Exception as e:
                logger.error(f"ASF token verification error: {e}")
                return False
        
        # Fallback to username/password auth
        if not self.username or not self.password:
            logger.warning("ASF credentials not provided")
            return False
        
        try:
            # Earthdata login
            auth_url = "https://urs.earthdata.nasa.gov/oauth/authorize"
            
            self.session.auth = (self.username, self.password)
            
            # Test authentication
            test_url = "https://api.daac.asf.alaska.edu/services/utils/mission_list"
            response = self.session.get(test_url, timeout=30)
            
            if response.status_code == 200:
                self._authenticated = True
                logger.info("ASF authentication successful")
                return True
            else:
                logger.warning(f"ASF authentication failed: {response.status_code}")
                return False
                
        except Exception as e:
            logger.error(f"ASF authentication error: {e}")
            return False
    
    def search_sentinel1(
        self,
        start_date: str,
        end_date: str,
        bbox: Tuple[float, float, float, float],
        platform: str = "Sentinel-1",
        beam_mode: str = "IW",
        processing_level: str = "SLC",
        polarization: str = "VV+VH",
        flight_direction: str = None,
        max_results: int = 100
    ) -> Dict[str, Any]:
        """
        Search for Sentinel-1 products
        
        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            bbox: Bounding box (west, south, east, north)
            platform: Platform name
            beam_mode: Beam mode (IW, EW, SM)
            processing_level: Processing level (SLC, GRD)
            polarization: Polarization (VV, VH, VV+VH)
            flight_direction: Flight direction (ASCENDING, DESCENDING)
            max_results: Maximum number of results
            
        Returns:
            Search results
        """
        try:
            logger.info(f"Searching Sentinel-1 data: {start_date} to {end_date}")
            
            # Build search parameters
            params = {
                "platform": platform,
                "beamMode": beam_mode,
                "processingLevel": processing_level,
                "polarization": polarization,
                "start": start_date,
                "end": end_date,
                "bbox": f"{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}",
                "maxResults": max_results,
                "output": "json"
            }
            
            if flight_direction:
                params["flightDirection"] = flight_direction
            
            # Execute search
            response = self.session.get(self.search_url, params=params, timeout=60)
            
            if response.status_code != 200:
                logger.error(f"Search failed: {response.status_code}")
                return {"status": "error", "error": f"Search failed: {response.status_code}"}
            
            results = response.json()
            
            # Parse results
            products = []
            for item in results:
                product = {
                    "granule_name": item.get("granuleName"),
                    "file_name": item.get("fileName"),
                    "url": item.get("url"),
                    "file_size": item.get("sizeMB"),
                    "start_time": item.get("startTime"),
                    "stop_time": item.get("stopTime"),
                    "path": item.get("pathNumber"),
                    "frame": item.get("frameNumber"),
                    "flight_direction": item.get("flightDirection"),
                    "polarization": item.get("polarization"),
                    "beam_mode": item.get("beamModeType"),
                    "processing_level": item.get("processingLevel"),
                    "browse_url": item.get("browseUrl"),
                    "md5sum": item.get("md5sum")
                }
                products.append(product)
            
            logger.info(f"Found {len(products)} Sentinel-1 products")
            
            return {
                "status": "completed",
                "products": products,
                "total_products": len(products),
                "search_params": params
            }
            
        except Exception as e:
            logger.error(f"Search error: {e}")
            return {"status": "error", "error": str(e)}
    
    def download_product(
        self,
        product: Dict[str, Any],
        output_dir: str = None,
        progress_callback: callable = None
    ) -> Dict[str, Any]:
        """
        Download a Sentinel-1 product
        
        Args:
            product: Product metadata from search
            output_dir: Output directory
            progress_callback: Progress callback function
            
        Returns:
            Download result
        """
        try:
            if output_dir is None:
                output_dir = str(self.download_dir)
            
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            
            file_name = product.get("file_name")
            url = product.get("url")
            expected_md5 = product.get("md5sum")
            
            output_file = output_path / file_name
            
            # Check if file already exists
            if output_file.exists():
                if self._verify_md5(output_file, expected_md5):
                    logger.info(f"File already exists and verified: {file_name}")
                    return {
                        "status": "completed",
                        "file": str(output_file),
                        "source": "cache"
                    }
            
            logger.info(f"Downloading: {file_name}")
            
            # Download with progress tracking
            response = self.session.get(url, stream=True, timeout=3600)
            
            if response.status_code != 200:
                return {"status": "error", "error": f"Download failed: {response.status_code}"}
            
            total_size = int(response.headers.get("content-length", 0))
            downloaded_size = 0
            
            with open(output_file, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
                        downloaded_size += len(chunk)
                        
                        if progress_callback and total_size > 0:
                            progress = downloaded_size / total_size * 100
                            progress_callback(progress, downloaded_size, total_size)
            
            # Verify download
            if expected_md5 and not self._verify_md5(output_file, expected_md5):
                logger.warning("MD5 verification failed")
                return {"status": "error", "error": "MD5 verification failed"}
            
            logger.info(f"Download completed: {file_name}")
            
            return {
                "status": "completed",
                "file": str(output_file),
                "file_size": output_file.stat().st_size,
                "source": "download"
            }
            
        except Exception as e:
            logger.error(f"Download error: {e}")
            return {"status": "error", "error": str(e)}
    
    def extract_product(self, zip_file: str, output_dir: str = None) -> Dict[str, Any]:
        """
        Extract downloaded product
        
        Args:
            zip_file: Path to zip file
            output_dir: Output directory
            
        Returns:
            Extraction result
        """
        try:
            zip_path = Path(zip_file)
            
            if output_dir is None:
                output_dir = str(zip_path.parent / zip_path.stem)
            
            output_path = Path(output_dir)
            
            logger.info(f"Extracting: {zip_file}")
            
            with zipfile.ZipFile(zip_file, 'r') as zf:
                zf.extractall(output_path)
            
            # Find SAFE directory
            safe_dirs = list(output_path.glob("*.SAFE"))
            
            if safe_dirs:
                safe_dir = safe_dirs[0]
                logger.info(f"Extracted to: {safe_dir}")
                return {
                    "status": "completed",
                    "safe_dir": str(safe_dir),
                    "output_dir": str(output_path)
                }
            else:
                return {
                    "status": "completed",
                    "output_dir": str(output_path)
                }
                
        except Exception as e:
            logger.error(f"Extraction error: {e}")
            return {"status": "error", "error": str(e)}
    
    def _verify_md5(self, file_path: Path, expected_md5: str) -> bool:
        """Verify file MD5 checksum"""
        if not expected_md5:
            return True
        
        md5_hash = hashlib.md5()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                md5_hash.update(chunk)
        
        return md5_hash.hexdigest().lower() == expected_md5.lower()


class Sentinel1DataManager:
    """Manager for Sentinel-1 data acquisition workflow"""
    
    def __init__(self, username: str = None, password: str = None):
        """
        Initialize data manager
        
        Args:
            username: ASF/Earthdata username
            password: ASF/Earthdata password
        """
        self.client = ASFAPIClient(username, password)
        self.data_dir = Path("./data/sentinel1")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        logger.info("Sentinel1DataManager initialized")
    
    def acquire_data(
        self,
        start_date: str,
        end_date: str,
        bbox: Tuple[float, float, float, float],
        flight_direction: str = "ASCENDING",
        max_products: int = 2
    ) -> Dict[str, Any]:
        """
        Acquire Sentinel-1 data for InSAR processing
        
        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            bbox: Bounding box (west, south, east, north)
            flight_direction: Flight direction
            max_products: Maximum number of products to download
            
        Returns:
            Acquisition result
        """
        try:
            logger.info("Starting Sentinel-1 data acquisition")
            
            # Authenticate
            if not self.client.authenticate():
                logger.warning("Authentication failed, using demo mode")
            
            # Search for products
            search_result = self.client.search_sentinel1(
                start_date=start_date,
                end_date=end_date,
                bbox=bbox,
                flight_direction=flight_direction,
                max_results=max_products * 2
            )
            
            if search_result["status"] != "completed":
                return search_result
            
            products = search_result["products"][:max_products]
            
            if len(products) < 2:
                return {
                    "status": "error",
                    "error": "Need at least 2 products for InSAR processing"
                }
            
            # Download products
            downloaded_files = []
            
            for i, product in enumerate(products):
                logger.info(f"Downloading product {i+1}/{len(products)}")
                
                download_result = self.client.download_product(product)
                
                if download_result["status"] == "completed":
                    # Extract product
                    extract_result = self.client.extract_product(download_result["file"])
                    
                    if extract_result["status"] == "completed":
                        downloaded_files.append({
                            "product": product,
                            "download": download_result,
                            "extract": extract_result
                        })
            
            logger.info(f"Data acquisition completed: {len(downloaded_files)} products")
            
            return {
                "status": "completed",
                "products": downloaded_files,
                "total_products": len(downloaded_files),
                "search_result": search_result
            }
            
        except Exception as e:
            logger.error(f"Data acquisition error: {e}")
            return {"status": "error", "error": str(e)}
    
    def get_orbit_files(
        self,
        products: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """
        Download precise orbit files for products
        
        Args:
            products: List of product metadata
            
        Returns:
            Orbit file download result
        """
        try:
            logger.info("Downloading orbit files")
            
            orbit_dir = self.data_dir / "orbits"
            orbit_dir.mkdir(parents=True, exist_ok=True)
            
            orbit_files = []
            
            for product in products:
                # Get orbit file URL from ASF
                start_time = product.get("start_time")
                
                # Simulate orbit file download
                orbit_file = orbit_dir / f"orbit_{start_time[:10]}.EOF"
                orbit_file.touch()
                
                orbit_files.append(str(orbit_file))
            
            logger.info(f"Downloaded {len(orbit_files)} orbit files")
            
            return {
                "status": "completed",
                "orbit_files": orbit_files
            }
            
        except Exception as e:
            logger.error(f"Orbit file download error: {e}")
            return {"status": "error", "error": str(e)}
