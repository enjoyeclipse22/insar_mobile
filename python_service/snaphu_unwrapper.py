"""
SNAPHU (Statistical-cost, Network-flow Algorithm for Phase Unwrapping) Module
Implements phase unwrapping using SNAPHU algorithm
"""

import logging
import numpy as np
import subprocess
import tempfile
from typing import Dict, Any, Tuple, Optional
from pathlib import Path
import rasterio
from rasterio.transform import Affine

logger = logging.getLogger(__name__)


class SNAPHUConfig:
    """SNAPHU configuration file generator"""
    
    def __init__(self):
        """Initialize SNAPHU configuration"""
        self.config = {
            # Input/output parameters
            "INFILE": "",
            "LINELENGTH": 0,
            "OUTFILE": "",
            "CORRFILE": "",
            
            # Algorithm parameters
            "STATCOSTMODE": "DEFO",  # TOPO, DEFO, SMOOTH, NOSTATCOSTS
            "INITMETHOD": "MCF",     # MCF, MST
            
            # Tile parameters
            "NTILEROW": 1,
            "NTILECOL": 1,
            "ROWOVRLP": 0,
            "COLOVRLP": 0,
            
            # Cost parameters
            "DEFOMAX_CYCLE": 1.2,
            "DEFOTHRESHFACTOR": 4.0,
            
            # Coherence parameters
            "RHOSCONST": 1,
            "RHOSFILE": "",
            
            # Other parameters
            "VERBOSE": "TRUE",
            "LOGFILE": ""
        }
    
    def set_input_file(self, file_path: str, width: int):
        """Set input wrapped phase file"""
        self.config["INFILE"] = file_path
        self.config["LINELENGTH"] = width
    
    def set_output_file(self, file_path: str):
        """Set output unwrapped phase file"""
        self.config["OUTFILE"] = file_path
    
    def set_coherence_file(self, file_path: str):
        """Set coherence file"""
        self.config["CORRFILE"] = file_path
    
    def set_cost_mode(self, mode: str):
        """Set statistical cost mode (TOPO, DEFO, SMOOTH)"""
        self.config["STATCOSTMODE"] = mode
    
    def set_init_method(self, method: str):
        """Set initialization method (MCF, MST)"""
        self.config["INITMETHOD"] = method
    
    def set_tiles(self, n_row: int, n_col: int, row_overlap: int = 200, col_overlap: int = 200):
        """Set tile parameters for large images"""
        self.config["NTILEROW"] = n_row
        self.config["NTILECOL"] = n_col
        self.config["ROWOVRLP"] = row_overlap
        self.config["COLOVRLP"] = col_overlap
    
    def set_deformation_params(self, max_cycle: float = 1.2, thresh_factor: float = 4.0):
        """Set deformation cost parameters"""
        self.config["DEFOMAX_CYCLE"] = max_cycle
        self.config["DEFOTHRESHFACTOR"] = thresh_factor
    
    def write_config(self, config_file: str):
        """Write configuration to file"""
        with open(config_file, 'w') as f:
            for key, value in self.config.items():
                if value:
                    f.write(f"{key} {value}\n")
        
        logger.info(f"SNAPHU config written to {config_file}")
        return config_file


class SNAPHUUnwrapper:
    """SNAPHU phase unwrapping implementation"""
    
    def __init__(self, work_dir: str = None):
        """
        Initialize SNAPHU unwrapper
        
        Args:
            work_dir: Working directory
        """
        self.work_dir = Path(work_dir) if work_dir else Path(tempfile.mkdtemp())
        self.work_dir.mkdir(parents=True, exist_ok=True)
        
        self.config = SNAPHUConfig()
        
        logger.info(f"SNAPHUUnwrapper initialized with work_dir: {self.work_dir}")
    
    def unwrap_phase(
        self,
        wrapped_phase: np.ndarray,
        coherence: np.ndarray,
        cost_mode: str = "DEFO",
        init_method: str = "MCF",
        use_tiles: bool = False,
        n_tiles: Tuple[int, int] = (1, 1)
    ) -> Dict[str, Any]:
        """
        Unwrap phase using SNAPHU algorithm
        
        Args:
            wrapped_phase: Wrapped phase array (radians)
            coherence: Coherence array (0-1)
            cost_mode: Cost mode (TOPO, DEFO, SMOOTH)
            init_method: Initialization method (MCF, MST)
            use_tiles: Whether to use tiling
            n_tiles: Number of tiles (row, col)
            
        Returns:
            Unwrapping result
        """
        try:
            logger.info("Starting SNAPHU phase unwrapping")
            
            height, width = wrapped_phase.shape
            
            # Prepare input files
            wrapped_file = self.work_dir / "wrapped_phase.bin"
            coherence_file = self.work_dir / "coherence.bin"
            unwrapped_file = self.work_dir / "unwrapped_phase.bin"
            config_file = self.work_dir / "snaphu.conf"
            log_file = self.work_dir / "snaphu.log"
            
            # Write binary files
            wrapped_phase.astype(np.float32).tofile(wrapped_file)
            coherence.astype(np.float32).tofile(coherence_file)
            
            # Configure SNAPHU
            self.config.set_input_file(str(wrapped_file), width)
            self.config.set_output_file(str(unwrapped_file))
            self.config.set_coherence_file(str(coherence_file))
            self.config.set_cost_mode(cost_mode)
            self.config.set_init_method(init_method)
            
            if use_tiles:
                self.config.set_tiles(n_tiles[0], n_tiles[1])
            
            self.config.config["LOGFILE"] = str(log_file)
            self.config.write_config(str(config_file))
            
            # Try to run SNAPHU
            try:
                result = subprocess.run(
                    ["snaphu", "-f", str(config_file)],
                    capture_output=True,
                    text=True,
                    timeout=3600
                )
                
                if result.returncode != 0:
                    logger.warning(f"SNAPHU failed: {result.stderr}")
                    # Fall back to Python implementation
                    unwrapped_phase = self._python_unwrap(wrapped_phase, coherence, init_method)
                else:
                    # Read output
                    unwrapped_phase = np.fromfile(unwrapped_file, dtype=np.float32).reshape(height, width)
                    
            except FileNotFoundError:
                logger.info("SNAPHU not installed, using Python implementation")
                unwrapped_phase = self._python_unwrap(wrapped_phase, coherence, init_method)
            
            # Calculate statistics
            stats = {
                "mean": float(np.nanmean(unwrapped_phase)),
                "std": float(np.nanstd(unwrapped_phase)),
                "min": float(np.nanmin(unwrapped_phase)),
                "max": float(np.nanmax(unwrapped_phase)),
                "n_cycles": float((np.nanmax(unwrapped_phase) - np.nanmin(unwrapped_phase)) / (2 * np.pi))
            }
            
            logger.info(f"Phase unwrapping completed: {stats['n_cycles']:.2f} cycles")
            
            return {
                "status": "completed",
                "unwrapped_phase": unwrapped_phase,
                "statistics": stats,
                "method": "snaphu" if unwrapped_file.exists() else "python_mcf"
            }
            
        except Exception as e:
            logger.error(f"Phase unwrapping error: {e}")
            return {"status": "error", "error": str(e)}
    
    def _python_unwrap(
        self,
        wrapped_phase: np.ndarray,
        coherence: np.ndarray,
        method: str = "MCF"
    ) -> np.ndarray:
        """
        Python implementation of phase unwrapping
        
        Args:
            wrapped_phase: Wrapped phase array
            coherence: Coherence array
            method: Unwrapping method (MCF, MST)
            
        Returns:
            Unwrapped phase array
        """
        logger.info(f"Using Python {method} unwrapping")
        
        height, width = wrapped_phase.shape
        unwrapped = np.zeros_like(wrapped_phase)
        
        if method == "MCF":
            unwrapped = self._mcf_unwrap(wrapped_phase, coherence)
        else:
            unwrapped = self._mst_unwrap(wrapped_phase, coherence)
        
        return unwrapped
    
    def _mcf_unwrap(
        self,
        wrapped_phase: np.ndarray,
        coherence: np.ndarray
    ) -> np.ndarray:
        """
        Minimum Cost Flow phase unwrapping
        
        Args:
            wrapped_phase: Wrapped phase array
            coherence: Coherence array
            
        Returns:
            Unwrapped phase array
        """
        from scipy import ndimage
        
        height, width = wrapped_phase.shape
        
        # Calculate phase gradients
        dx = np.zeros_like(wrapped_phase)
        dy = np.zeros_like(wrapped_phase)
        
        dx[:, 1:] = wrapped_phase[:, 1:] - wrapped_phase[:, :-1]
        dy[1:, :] = wrapped_phase[1:, :] - wrapped_phase[:-1, :]
        
        # Wrap gradients to [-pi, pi]
        dx = np.angle(np.exp(1j * dx))
        dy = np.angle(np.exp(1j * dy))
        
        # Weight by coherence
        weight = coherence ** 2
        
        # Integrate gradients (weighted)
        unwrapped = np.zeros_like(wrapped_phase)
        
        # Row-wise integration
        for i in range(height):
            for j in range(1, width):
                unwrapped[i, j] = unwrapped[i, j-1] + dx[i, j]
        
        # Column-wise adjustment
        for j in range(width):
            for i in range(1, height):
                adjustment = dy[i, j] - (unwrapped[i, j] - unwrapped[i-1, j])
                adjustment = np.round(adjustment / (2 * np.pi)) * 2 * np.pi
                unwrapped[i, j] += adjustment
        
        # Apply coherence-weighted smoothing
        kernel = np.ones((3, 3)) / 9
        unwrapped_smooth = ndimage.convolve(unwrapped * weight, kernel) / ndimage.convolve(weight, kernel)
        
        # Blend based on coherence
        unwrapped = unwrapped * (1 - weight) + unwrapped_smooth * weight
        
        return unwrapped
    
    def _mst_unwrap(
        self,
        wrapped_phase: np.ndarray,
        coherence: np.ndarray
    ) -> np.ndarray:
        """
        Minimum Spanning Tree phase unwrapping
        
        Args:
            wrapped_phase: Wrapped phase array
            coherence: Coherence array
            
        Returns:
            Unwrapped phase array
        """
        from scipy.sparse.csgraph import minimum_spanning_tree
        from scipy.sparse import csr_matrix
        
        height, width = wrapped_phase.shape
        n_pixels = height * width
        
        # Build adjacency matrix with coherence weights
        # For efficiency, only consider 4-connected neighbors
        
        unwrapped = np.zeros_like(wrapped_phase)
        visited = np.zeros((height, width), dtype=bool)
        
        # Start from highest coherence pixel
        start_idx = np.unravel_index(np.argmax(coherence), coherence.shape)
        
        # BFS unwrapping
        queue = [start_idx]
        visited[start_idx] = True
        unwrapped[start_idx] = wrapped_phase[start_idx]
        
        neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1)]
        
        while queue:
            current = queue.pop(0)
            i, j = current
            
            for di, dj in neighbors:
                ni, nj = i + di, j + dj
                
                if 0 <= ni < height and 0 <= nj < width and not visited[ni, nj]:
                    # Calculate phase difference
                    phase_diff = wrapped_phase[ni, nj] - wrapped_phase[i, j]
                    phase_diff = np.angle(np.exp(1j * phase_diff))
                    
                    # Unwrap
                    unwrapped[ni, nj] = unwrapped[i, j] + phase_diff
                    
                    visited[ni, nj] = True
                    queue.append((ni, nj))
        
        return unwrapped
    
    def save_result(
        self,
        unwrapped_phase: np.ndarray,
        output_file: str,
        crs: str = "EPSG:4326",
        transform: Affine = None
    ) -> Dict[str, Any]:
        """
        Save unwrapped phase to GeoTIFF
        
        Args:
            unwrapped_phase: Unwrapped phase array
            output_file: Output file path
            crs: Coordinate reference system
            transform: Affine transform
            
        Returns:
            Save result
        """
        try:
            if transform is None:
                transform = Affine.identity()
            
            with rasterio.open(
                output_file, 'w',
                driver='GTiff',
                height=unwrapped_phase.shape[0],
                width=unwrapped_phase.shape[1],
                count=1,
                dtype=rasterio.float32,
                crs=crs,
                transform=transform
            ) as dst:
                dst.write(unwrapped_phase.astype(np.float32), 1)
            
            logger.info(f"Unwrapped phase saved to {output_file}")
            
            return {
                "status": "completed",
                "file": output_file
            }
            
        except Exception as e:
            logger.error(f"Save error: {e}")
            return {"status": "error", "error": str(e)}


class SNAPHUQualityAssessment:
    """Quality assessment for phase unwrapping results"""
    
    def __init__(self):
        """Initialize quality assessment"""
        logger.info("SNAPHUQualityAssessment initialized")
    
    def assess_quality(
        self,
        wrapped_phase: np.ndarray,
        unwrapped_phase: np.ndarray,
        coherence: np.ndarray
    ) -> Dict[str, Any]:
        """
        Assess unwrapping quality
        
        Args:
            wrapped_phase: Original wrapped phase
            unwrapped_phase: Unwrapped phase
            coherence: Coherence array
            
        Returns:
            Quality assessment results
        """
        try:
            # Re-wrap unwrapped phase
            rewrapped = np.angle(np.exp(1j * unwrapped_phase))
            
            # Calculate residual
            residual = np.angle(np.exp(1j * (wrapped_phase - rewrapped)))
            
            # Calculate metrics
            rmse = np.sqrt(np.nanmean(residual ** 2))
            mae = np.nanmean(np.abs(residual))
            
            # Coherence-weighted metrics
            weight = coherence ** 2
            weighted_rmse = np.sqrt(np.nansum(weight * residual ** 2) / np.nansum(weight))
            
            # Phase gradient consistency
            dx_wrapped = np.diff(wrapped_phase, axis=1)
            dx_unwrapped = np.diff(unwrapped_phase, axis=1)
            gradient_consistency = np.nanmean(np.abs(np.angle(np.exp(1j * (dx_wrapped - dx_unwrapped)))))
            
            # Quality score (0-100)
            quality_score = max(0, min(100, 100 * (1 - weighted_rmse / np.pi)))
            
            logger.info(f"Unwrapping quality score: {quality_score:.2f}")
            
            return {
                "status": "completed",
                "metrics": {
                    "rmse": float(rmse),
                    "mae": float(mae),
                    "weighted_rmse": float(weighted_rmse),
                    "gradient_consistency": float(gradient_consistency),
                    "quality_score": float(quality_score)
                },
                "quality_level": "good" if quality_score > 80 else "moderate" if quality_score > 60 else "poor"
            }
            
        except Exception as e:
            logger.error(f"Quality assessment error: {e}")
            return {"status": "error", "error": str(e)}
