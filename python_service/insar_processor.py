"""
InSAR Processing Engine - Updated with Atmospheric Correction
Main orchestrator for InSAR processing workflow
"""

import logging
from typing import Dict, Any, Optional
from pathlib import Path
from datetime import datetime
import json

logger = logging.getLogger(__name__)


class InSARProcessingEngine:
    """
    Main InSAR processing engine
    Orchestrates the complete workflow from data download to deformation inversion
    """
    
    def __init__(self, task_id: str, request):
        self.task_id = task_id
        self.request = request
        self.project_id = request.project_id
        
        # Processing steps
        self.steps = [
            "data_download",
            "dem_download",
            "coregistration",
            "interferogram_generation",
            "phase_unwrapping",
            "atmospheric_correction",
            "deformation_inversion"
        ]
        
        # Output directory
        self.output_dir = Path(f"./data/projects/{self.project_id}")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Metadata
        self.metadata = {
            "task_id": task_id,
            "project_id": self.project_id,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "satellite": request.satellite,
            "orbit_direction": request.orbit_direction,
            "polarization": request.polarization,
            "coherence_threshold": request.coherence_threshold,
            "output_resolution": request.output_resolution,
            "start_time": datetime.now().isoformat(),
            "steps": []
        }
        
        logger.info(f"InSARProcessingEngine initialized for task {task_id}, project {self.project_id}")
    
    def get_processing_steps(self) -> list:
        """Get list of processing steps"""
        return self.steps
    
    def get_step_description(self, step: str) -> Dict[str, str]:
        """Get description of a processing step"""
        descriptions = {
            "data_download": {
                "name": "Data Download",
                "description": "Downloading Sentinel-1 SLC products from Copernicus Data Hub",
                "inputs": ["Date range", "Orbit direction", "Polarization"],
                "outputs": ["SLC products", "Orbit files"]
            },
            "dem_download": {
                "name": "DEM Download",
                "description": "Downloading SRTM 30m digital elevation model",
                "inputs": ["AOI bounds"],
                "outputs": ["DEM GeoTIFF"]
            },
            "coregistration": {
                "name": "Coregistration",
                "description": "Coregistering SAR images to common reference geometry",
                "inputs": ["SLC products"],
                "outputs": ["Coregistered SLC images"]
            },
            "interferogram_generation": {
                "name": "Interferogram Generation",
                "description": "Generating interferogram and coherence map",
                "inputs": ["Coregistered SLC", "DEM"],
                "outputs": ["Interferogram", "Coherence map"]
            },
            "phase_unwrapping": {
                "name": "Phase Unwrapping",
                "description": "Unwrapping interferometric phase using MCF algorithm",
                "inputs": ["Interferogram"],
                "outputs": ["Unwrapped phase"]
            },
            "atmospheric_correction": {
                "name": "Atmospheric Correction",
                "description": "Estimating and removing atmospheric phase delays using DEM-based methods",
                "inputs": ["Interferogram", "DEM"],
                "outputs": ["Corrected interferogram", "APS estimates"]
            },
            "deformation_inversion": {
                "name": "Deformation Inversion",
                "description": "Converting unwrapped phase to LOS deformation",
                "inputs": ["Unwrapped phase"],
                "outputs": ["Deformation map"]
            }
        }
        
        return descriptions.get(step, {})
    
    def save_metadata(self):
        """Save processing metadata to JSON"""
        metadata_file = self.output_dir / "metadata.json"
        
        with open(metadata_file, 'w') as f:
            json.dump(self.metadata, f, indent=2)
        
        logger.info(f"Metadata saved to {metadata_file}")
    
    def add_step_result(self, step: str, result: Dict[str, Any]):
        """Add result for a processing step"""
        self.metadata["steps"].append({
            "name": step,
            "timestamp": datetime.now().isoformat(),
            "result": result
        })
        
        logger.info(f"Step {step} result recorded")
    
    def get_summary(self) -> Dict[str, Any]:
        """Get processing summary"""
        return {
            "task_id": self.task_id,
            "project_id": self.project_id,
            "total_steps": len(self.steps),
            "completed_steps": len(self.metadata["steps"]),
            "start_time": self.metadata["start_time"],
            "end_time": datetime.now().isoformat(),
            "steps": self.metadata["steps"]
        }


class ProcessingConfig:
    """Configuration for InSAR processing"""
    
    def __init__(self, **kwargs):
        self.project_id = kwargs.get("project_id")
        self.start_date = kwargs.get("start_date")
        self.end_date = kwargs.get("end_date")
        self.satellite = kwargs.get("satellite", "Sentinel-1")
        self.orbit_direction = kwargs.get("orbit_direction", "ascending")
        self.polarization = kwargs.get("polarization", "VV")
        self.aoi_bounds = kwargs.get("aoi_bounds")
        self.coherence_threshold = kwargs.get("coherence_threshold", 0.4)
        self.output_resolution = kwargs.get("output_resolution", 30)
        
        # Validation
        self._validate()
    
    def _validate(self):
        """Validate configuration"""
        if not self.project_id:
            raise ValueError("project_id is required")
        
        if not self.start_date or not self.end_date:
            raise ValueError("start_date and end_date are required")
        
        if self.orbit_direction not in ["ascending", "descending"]:
            raise ValueError("orbit_direction must be 'ascending' or 'descending'")
        
        if not 0 <= self.coherence_threshold <= 1:
            raise ValueError("coherence_threshold must be between 0 and 1")
        
        logger.info("Configuration validation passed")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "project_id": self.project_id,
            "start_date": self.start_date,
            "end_date": self.end_date,
            "satellite": self.satellite,
            "orbit_direction": self.orbit_direction,
            "polarization": self.polarization,
            "aoi_bounds": self.aoi_bounds,
            "coherence_threshold": self.coherence_threshold,
            "output_resolution": self.output_resolution
        }


class ProcessingResult:
    """Result of InSAR processing"""
    
    def __init__(self, task_id: str, project_id: int):
        self.task_id = task_id
        self.project_id = project_id
        self.status = "pending"
        self.results = {}
        self.errors = []
        self.logs = []
        self.start_time = datetime.now()
        self.end_time = None
    
    def set_success(self):
        """Mark processing as successful"""
        self.status = "completed"
        self.end_time = datetime.now()
        logger.info(f"Processing {self.task_id} completed successfully")
    
    def set_error(self, error: str):
        """Mark processing as failed"""
        self.status = "failed"
        self.end_time = datetime.now()
        self.errors.append(error)
        logger.error(f"Processing {self.task_id} failed: {error}")
    
    def add_result(self, key: str, value: Any):
        """Add a result"""
        self.results[key] = value
    
    def add_log(self, level: str, message: str):
        """Add a log entry"""
        self.logs.append({
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message
        })
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            "task_id": self.task_id,
            "project_id": self.project_id,
            "status": self.status,
            "results": self.results,
            "errors": self.errors,
            "logs": self.logs,
            "start_time": self.start_time.isoformat(),
            "end_time": self.end_time.isoformat() if self.end_time else None,
            "duration_seconds": (self.end_time - self.start_time).total_seconds() if self.end_time else None
        }
