"""
InSAR Processing Python Backend Service
Handles all SAR data processing using MintPy-compatible algorithms
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
import logging
from datetime import datetime
import json

from insar_processor import InSARProcessingEngine
from data_handler import DataDownloader, DEMHandler
from sar_algorithms import SARProcessor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="InSAR Processing Service", version="1.0.0")

# Global state for processing tasks
processing_tasks: Dict[str, Dict[str, Any]] = {}


class ProcessingRequest(BaseModel):
    """Request model for InSAR processing"""
    project_id: int
    start_date: str
    end_date: str
    satellite: str = "Sentinel-1"
    orbit_direction: str = "ascending"
    polarization: str = "VV"
    aoi_bounds: Optional[Dict[str, float]] = None
    coherence_threshold: float = 0.4
    output_resolution: int = 30


class ProcessingStatus(BaseModel):
    """Response model for processing status"""
    task_id: str
    project_id: int
    status: str
    progress: float
    current_step: str
    message: str
    timestamp: str


class ProcessingResult(BaseModel):
    """Response model for processing results"""
    task_id: str
    project_id: int
    status: str
    results: Dict[str, Any]
    logs: list
    timestamp: str


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "InSAR Processing Backend",
        "timestamp": datetime.now().isoformat()
    }


@app.post("/process", response_model=Dict[str, Any])
async def start_processing(request: ProcessingRequest, background_tasks: BackgroundTasks):
    """
    Start an InSAR processing task
    
    Args:
        request: Processing request parameters
        background_tasks: FastAPI background tasks
        
    Returns:
        Task ID and initial status
    """
    try:
        # Generate task ID
        task_id = f"task_{request.project_id}_{int(datetime.now().timestamp() * 1000)}"
        
        # Initialize task state
        processing_tasks[task_id] = {
            "project_id": request.project_id,
            "status": "queued",
            "progress": 0,
            "current_step": "initializing",
            "message": "Processing task queued",
            "logs": [],
            "start_time": datetime.now(),
            "request": request.dict()
        }
        
        # Add background task
        background_tasks.add_task(process_insar_task, task_id, request)
        
        logger.info(f"Processing task {task_id} started for project {request.project_id}")
        
        return {
            "task_id": task_id,
            "project_id": request.project_id,
            "status": "queued",
            "message": "Processing task started"
        }
        
    except Exception as e:
        logger.error(f"Error starting processing task: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/status/{task_id}", response_model=ProcessingStatus)
async def get_processing_status(task_id: str):
    """
    Get the status of a processing task
    
    Args:
        task_id: Task identifier
        
    Returns:
        Current processing status
    """
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = processing_tasks[task_id]
    
    return ProcessingStatus(
        task_id=task_id,
        project_id=task["project_id"],
        status=task["status"],
        progress=task["progress"],
        current_step=task["current_step"],
        message=task["message"],
        timestamp=datetime.now().isoformat()
    )


@app.get("/results/{task_id}", response_model=ProcessingResult)
async def get_processing_results(task_id: str):
    """
    Get the results of a completed processing task
    
    Args:
        task_id: Task identifier
        
    Returns:
        Processing results and logs
    """
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = processing_tasks[task_id]
    
    if task["status"] not in ["completed", "failed"]:
        raise HTTPException(status_code=400, detail="Task is still processing")
    
    return ProcessingResult(
        task_id=task_id,
        project_id=task["project_id"],
        status=task["status"],
        results=task.get("results", {}),
        logs=task.get("logs", []),
        timestamp=datetime.now().isoformat()
    )


@app.get("/logs/{task_id}")
async def get_processing_logs(task_id: str, limit: int = 100):
    """
    Get processing logs for a task
    
    Args:
        task_id: Task identifier
        limit: Maximum number of logs to return
        
    Returns:
        List of processing logs
    """
    if task_id not in processing_tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    task = processing_tasks[task_id]
    logs = task.get("logs", [])
    
    return {
        "task_id": task_id,
        "logs": logs[-limit:],
        "total": len(logs)
    }


async def process_insar_task(task_id: str, request: ProcessingRequest):
    """
    Background task for processing InSAR data
    
    Args:
        task_id: Task identifier
        request: Processing request parameters
    """
    task = processing_tasks[task_id]
    
    try:
        # Initialize processor
        processor = InSARProcessingEngine(task_id, request)
        
        # Step 1: Download data
        await update_task_status(
            task_id, "downloading", 10, "Downloading Sentinel-1 data",
            "Starting data download from Copernicus Data Hub"
        )
        
        downloader = DataDownloader(request)
        data_files = await downloader.download_sentinel1_data(
            request.start_date, request.end_date,
            request.orbit_direction, request.polarization
        )
        
        await log_task(task_id, "info", f"Downloaded {len(data_files)} Sentinel-1 products")
        
        # Step 2: Download DEM
        await update_task_status(
            task_id, "downloading", 20, "Downloading DEM",
            "Fetching SRTM DEM data"
        )
        
        dem_handler = DEMHandler(request)
        dem_file = await dem_handler.download_srtm_dem()
        
        await log_task(task_id, "info", f"Downloaded DEM: {dem_file}")
        
        # Step 3: Coregistration
        await update_task_status(
            task_id, "processing", 35, "Coregistration",
            "Coregistering SAR images to common reference"
        )
        
        sar_processor = SARProcessor(request)
        coreg_files = await sar_processor.coregister_images(data_files)
        
        await log_task(task_id, "info", "Coregistration completed")
        
        # Step 4: Interferogram generation
        await update_task_status(
            task_id, "processing", 55, "Interferogram generation",
            "Generating interferogram from coregistered images"
        )
        
        ifg_file = await sar_processor.generate_interferogram(coreg_files, dem_file)
        
        await log_task(task_id, "info", f"Interferogram generated: {ifg_file}")
        
        # Step 5: Phase unwrapping
        await update_task_status(
            task_id, "processing", 75, "Phase unwrapping",
            "Unwrapping interferometric phase"
        )
        
        unwrapped_file = await sar_processor.unwrap_phase(ifg_file)
        
        await log_task(task_id, "info", f"Phase unwrapping completed: {unwrapped_file}")
        
        # Step 6: Deformation inversion
        await update_task_status(
            task_id, "processing", 90, "Deformation inversion",
            "Inverting unwrapped phase to deformation"
        )
        
        deformation_file = await sar_processor.invert_deformation(unwrapped_file)
        
        await log_task(task_id, "info", f"Deformation inversion completed: {deformation_file}")
        
        # Complete processing
        await update_task_status(
            task_id, "completed", 100, "Processing complete",
            "All processing steps completed successfully"
        )
        
        # Store results
        task["results"] = {
            "interferogram": ifg_file,
            "unwrapped_phase": unwrapped_file,
            "deformation": deformation_file,
            "dem": dem_file,
            "data_files": data_files,
            "coregistered_files": coreg_files
        }
        
        await log_task(task_id, "info", "Processing task completed successfully")
        logger.info(f"Processing task {task_id} completed")
        
    except Exception as e:
        logger.error(f"Error in processing task {task_id}: {str(e)}")
        await update_task_status(
            task_id, "failed", 0, "Processing failed",
            f"Error: {str(e)}"
        )
        await log_task(task_id, "error", f"Processing failed: {str(e)}")


async def update_task_status(task_id: str, status: str, progress: float, step: str, message: str):
    """Update task status and progress"""
    if task_id in processing_tasks:
        task = processing_tasks[task_id]
        task["status"] = status
        task["progress"] = progress
        task["current_step"] = step
        task["message"] = message
        task["last_update"] = datetime.now()
        
        logger.info(f"Task {task_id}: {step} ({progress}%) - {message}")


async def log_task(task_id: str, level: str, message: str):
    """Add a log entry to a task"""
    if task_id in processing_tasks:
        task = processing_tasks[task_id]
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message
        }
        task["logs"].append(log_entry)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
