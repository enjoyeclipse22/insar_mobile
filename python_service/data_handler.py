"""
Data Handler Module
Handles downloading and preprocessing of Sentinel-1 data, DEM, and orbit information
"""

import os
import logging
from typing import List, Dict, Optional
from datetime import datetime
import asyncio
from pathlib import Path

import requests
import numpy as np
import rasterio
from rasterio.transform import from_bounds

logger = logging.getLogger(__name__)


class DataDownloader:
    """Handle downloading Sentinel-1 SAR data from various sources"""
    
    def __init__(self, request):
        self.request = request
        self.data_dir = Path("./data/raw")
        self.data_dir.mkdir(parents=True, exist_ok=True)
        
        # ASF API endpoint for Sentinel-1 data
        self.asf_api = "https://api.daac.asf.alaska.edu/services/search/param"
        
    async def download_sentinel1_data(
        self,
        start_date: str,
        end_date: str,
        orbit_direction: str,
        polarization: str
    ) -> List[str]:
        """
        Download Sentinel-1 SLC products from ASF
        
        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            orbit_direction: 'ascending' or 'descending'
            polarization: 'VV', 'HH', 'VV+VH', etc.
            
        Returns:
            List of downloaded file paths
        """
        logger.info(f"Downloading Sentinel-1 data from {start_date} to {end_date}")
        
        try:
            # Query ASF API for available products
            params = {
                "platform": "Sentinel-1",
                "processingLevel": "SLC",
                "beamMode": "IW",
                "polarization": polarization,
                "orbitDirection": orbit_direction.upper(),
                "start": start_date,
                "end": end_date,
                "output": "json"
            }
            
            # Add AOI bounds if provided
            if self.request.aoi_bounds:
                bounds = self.request.aoi_bounds
                params["bbox"] = f"{bounds['west']},{bounds['south']},{bounds['east']},{bounds['north']}"
            
            # Query available products
            logger.info(f"Querying ASF API with params: {params}")
            response = requests.get(self.asf_api, params=params, timeout=30)
            response.raise_for_status()
            
            results = response.json()
            products = results.get("results", [])
            
            logger.info(f"Found {len(products)} Sentinel-1 products")
            
            # In production, download actual products from ASF
            # For now, simulate with mock data
            downloaded_files = []
            
            for i, product in enumerate(products[:2]):  # Limit to 2 products for demo
                filename = f"S1_{product['granuleName']}.zip"
                filepath = self.data_dir / filename
                
                # Simulate download
                logger.info(f"Downloading {filename}...")
                await asyncio.sleep(0.5)  # Simulate download time
                
                # Create mock file
                filepath.touch()
                downloaded_files.append(str(filepath))
                
                logger.info(f"Downloaded: {filepath}")
            
            return downloaded_files
            
        except Exception as e:
            logger.error(f"Error downloading Sentinel-1 data: {str(e)}")
            raise
    
    async def download_orbit_data(self, start_date: str, end_date: str) -> List[str]:
        """
        Download precise orbit ephemeris (POE) data
        
        Args:
            start_date: Start date
            end_date: End date
            
        Returns:
            List of orbit file paths
        """
        logger.info("Downloading precise orbit ephemeris...")
        
        # In production, download from ESA GNSS Data Centre
        # For now, simulate
        orbit_files = []
        
        for i in range(2):
            filename = f"S1_POE_{start_date}_{i}.EOF"
            filepath = self.data_dir / filename
            filepath.touch()
            orbit_files.append(str(filepath))
        
        logger.info(f"Downloaded {len(orbit_files)} orbit files")
        return orbit_files


class DEMHandler:
    """Handle downloading and processing DEM data"""
    
    def __init__(self, request):
        self.request = request
        self.dem_dir = Path("./data/dem")
        self.dem_dir.mkdir(parents=True, exist_ok=True)
        
        # USGS API for SRTM data
        self.usgs_api = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/query"
        
    async def download_srtm_dem(self) -> str:
        """
        Download SRTM 30m DEM data
        
        Returns:
            Path to downloaded DEM file
        """
        logger.info("Downloading SRTM DEM data...")
        
        try:
            # Get DEM bounds from request
            bounds = self.request.aoi_bounds or {
                "west": -120.0,
                "south": 35.0,
                "east": -119.0,
                "north": 36.0
            }
            
            # In production, query USGS API and download tiles
            # For now, create mock DEM
            dem_file = self.dem_dir / "srtm_dem_30m.tif"
            
            # Create synthetic DEM data
            await self._create_synthetic_dem(dem_file, bounds)
            
            logger.info(f"DEM saved to: {dem_file}")
            return str(dem_file)
            
        except Exception as e:
            logger.error(f"Error downloading DEM: {str(e)}")
            raise
    
    async def _create_synthetic_dem(self, filepath: Path, bounds: Dict):
        """Create synthetic DEM for testing"""
        # Create a simple elevation pattern
        width, height = 512, 512
        dem_data = np.random.randint(0, 3000, (height, width), dtype=np.int16)
        
        # Add some topographic features
        x, y = np.meshgrid(np.linspace(0, 1, width), np.linspace(0, 1, height))
        dem_data = (1000 + 500 * np.sin(x * 4 * np.pi) * np.cos(y * 4 * np.pi)).astype(np.int16)
        
        # Create geotransform
        west = bounds["west"]
        south = bounds["south"]
        east = bounds["east"]
        north = bounds["north"]
        
        transform = from_bounds(west, south, east, north, width, height)
        
        # Write to GeoTIFF
        with rasterio.open(
            filepath,
            'w',
            driver='GTiff',
            height=height,
            width=width,
            count=1,
            dtype=dem_data.dtype,
            crs='EPSG:4326',
            transform=transform,
        ) as dst:
            dst.write(dem_data, 1)
        
        logger.info(f"Created synthetic DEM: {filepath}")
    
    async def download_aster_dem(self) -> str:
        """
        Download ASTER DEM data (higher resolution alternative)
        
        Returns:
            Path to downloaded DEM file
        """
        logger.info("Downloading ASTER DEM data...")
        # Similar to SRTM but with different resolution
        dem_file = self.dem_dir / "aster_dem.tif"
        
        bounds = self.request.aoi_bounds or {
            "west": -120.0,
            "south": 35.0,
            "east": -119.0,
            "north": 36.0
        }
        
        await self._create_synthetic_dem(dem_file, bounds)
        return str(dem_file)


class DataValidator:
    """Validate downloaded data"""
    
    @staticmethod
    def validate_slc_data(filepath: str) -> bool:
        """Validate SLC product"""
        logger.info(f"Validating SLC data: {filepath}")
        # Check file exists and has expected structure
        return os.path.exists(filepath) and os.path.getsize(filepath) > 0
    
    @staticmethod
    def validate_dem_data(filepath: str) -> bool:
        """Validate DEM file"""
        logger.info(f"Validating DEM data: {filepath}")
        try:
            with rasterio.open(filepath) as src:
                # Check valid raster
                return src.count > 0 and src.width > 0 and src.height > 0
        except Exception as e:
            logger.error(f"DEM validation failed: {str(e)}")
            return False
