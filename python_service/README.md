# InSAR Processing Python Backend

This is the Python backend service for the InSAR Pro mobile application. It handles all complex SAR data processing using MintPy-compatible algorithms.

## Architecture

The Python backend is organized into several modules:

- **main.py**: FastAPI application with REST endpoints for processing tasks
- **insar_processor.py**: Main InSAR processing engine and configuration classes
- **data_handler.py**: Data download and preprocessing (Sentinel-1, DEM, orbits)
- **sar_algorithms.py**: Core SAR processing algorithms (coregistration, interferogram, unwrapping, inversion)

## Processing Workflow

The complete InSAR processing workflow consists of 6 steps:

1. **Data Download**: Download Sentinel-1 SLC products from ASF Data Hub
2. **DEM Download**: Download SRTM 30m digital elevation model
3. **Coregistration**: Coregister SAR images to common reference geometry
4. **Interferogram Generation**: Generate interferogram and coherence map
5. **Phase Unwrapping**: Unwrap interferometric phase using MCF algorithm
6. **Deformation Inversion**: Convert unwrapped phase to LOS deformation

## API Endpoints

### Health Check
```
GET /health
```

### Start Processing
```
POST /process
Content-Type: application/json

{
  "project_id": 1,
  "start_date": "2024-01-01",
  "end_date": "2024-01-31",
  "satellite": "Sentinel-1",
  "orbit_direction": "ascending",
  "polarization": "VV",
  "aoi_bounds": {
    "west": -120.0,
    "south": 35.0,
    "east": -119.0,
    "north": 36.0
  },
  "coherence_threshold": 0.4,
  "output_resolution": 30
}
```

Response:
```json
{
  "task_id": "task_1_1705139200000",
  "project_id": 1,
  "status": "queued",
  "message": "Processing task started"
}
```

### Get Processing Status
```
GET /status/{task_id}
```

Response:
```json
{
  "task_id": "task_1_1705139200000",
  "project_id": 1,
  "status": "processing",
  "progress": 35.0,
  "current_step": "coregistration",
  "message": "Coregistering SAR images to common reference",
  "timestamp": "2024-01-13T11:06:00.000Z"
}
```

### Get Processing Results
```
GET /results/{task_id}
```

Response:
```json
{
  "task_id": "task_1_1705139200000",
  "project_id": 1,
  "status": "completed",
  "results": {
    "interferogram": "./data/processed/interferogram.tif",
    "unwrapped_phase": "./data/processed/unwrapped_phase.tif",
    "deformation": "./data/processed/los_displacement.tif",
    "dem": "./data/dem/srtm_dem_30m.tif",
    "data_files": ["./data/raw/S1_...zip"],
    "coregistered_files": ["./data/processed/coreg_slave_1.tif"]
  },
  "logs": [
    {
      "timestamp": "2024-01-13T11:05:00.000Z",
      "level": "info",
      "message": "Downloading Sentinel-1 data from 2024-01-01 to 2024-01-31"
    }
  ],
  "timestamp": "2024-01-13T11:07:00.000Z"
}
```

### Get Processing Logs
```
GET /logs/{task_id}?limit=100
```

Response:
```json
{
  "task_id": "task_1_1705139200000",
  "logs": [
    {
      "timestamp": "2024-01-13T11:05:00.000Z",
      "level": "info",
      "message": "Downloading Sentinel-1 data..."
    },
    {
      "timestamp": "2024-01-13T11:05:30.000Z",
      "level": "info",
      "message": "Downloaded 2 Sentinel-1 products"
    }
  ],
  "total": 42
}
```

## Installation

### Prerequisites

- Python 3.8+
- GDAL/GEOS libraries (for rasterio)
- numpy, scipy

### Setup

1. Create virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
python main.py
```

The server will start on `http://localhost:8000`

## Integration with Node.js Backend

The Python service communicates with the Node.js backend via HTTP/REST API. The Node.js backend:

1. Receives processing requests from the mobile app
2. Calls the Python backend's `/process` endpoint
3. Polls `/status/{task_id}` to track progress
4. Retrieves results from `/results/{task_id}` when complete
5. Stores results in the database

## Data Storage

- **Raw data**: `./data/raw/` - Downloaded Sentinel-1 products
- **DEM data**: `./data/dem/` - Digital elevation models
- **Processed data**: `./data/processed/` - Intermediate and final results
- **Project data**: `./data/projects/{project_id}/` - Project-specific outputs

## Key Features

### Sentinel-1 Data Download
- Queries ASF Data Hub for available products
- Filters by date range, orbit direction, polarization
- Supports area of interest (AOI) bounds

### DEM Handling
- Downloads SRTM 30m data (default)
- Alternative ASTER DEM support
- Automatic tile merging for large areas

### SAR Processing
- **Coregistration**: Aligns slave images to reference using cross-correlation
- **Interferogram**: Multiplies master by conjugate slave, applies multilook
- **Phase Unwrapping**: Implements MCF (Minimum Cost Flow) algorithm
- **Deformation Inversion**: Converts phase to LOS displacement

### Error Handling
- Comprehensive logging at each step
- Graceful error recovery
- Detailed error messages returned to client

## Performance Considerations

- Processing times depend on data size and computational resources
- Typical processing for 30x30 km area: 10-30 minutes
- Memory usage: 2-8 GB depending on resolution
- Disk space: 50-200 GB for raw and processed data

## Future Enhancements

- Integration with real MintPy library for production-grade algorithms
- Support for additional satellites (ALOS-2, TerraSAR-X)
- Atmospheric phase screen (APS) estimation and correction
- Orbital error correction
- Time series analysis for multiple interferograms
- WebSocket support for real-time progress streaming
- GPU acceleration for phase unwrapping

## License

Part of InSAR Pro Mobile Application
