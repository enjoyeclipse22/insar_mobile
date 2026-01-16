"""
Spatiotemporal Filtering for Atmospheric Correction
Separates atmospheric signals from deformation in time series InSAR data
"""

import logging
import numpy as np
from typing import Dict, Any, List, Tuple
from pathlib import Path
from datetime import datetime
import rasterio
from rasterio.transform import Affine
from scipy import signal, ndimage

logger = logging.getLogger(__name__)


class TimeSeriesAtmosphericCorrection:
    """Spatiotemporal filtering for time series InSAR data"""
    
    def __init__(self, interferogram_files: List[str], output_dir: str):
        """
        Initialize time series atmospheric correction
        
        Args:
            interferogram_files: List of interferogram file paths
            output_dir: Output directory
        """
        self.interferogram_files = interferogram_files
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Load all interferograms
        self.ifg_stack = []
        self.dates = []
        
        for ifg_file in interferogram_files:
            with rasterio.open(ifg_file) as src:
                self.ifg_stack.append(src.read(1))
                # Extract date from filename (assumes format: ifg_YYYYMMDD.tif)
                date_str = Path(ifg_file).stem.split('_')[-1]
                self.dates.append(datetime.strptime(date_str, "%Y%m%d"))
        
        self.ifg_stack = np.array(self.ifg_stack)
        self.n_ifg = len(self.ifg_stack)
        self.height, self.width = self.ifg_stack[0].shape
        
        logger.info(f"Loaded {self.n_ifg} interferograms")
    
    def estimate_atmospheric_phase_screen(
        self,
        spatial_wavelength: float = 1000,
        temporal_wavelength: float = 30
    ) -> np.ndarray:
        """
        Estimate atmospheric phase screen using spatiotemporal filtering
        
        Args:
            spatial_wavelength: Spatial wavelength for high-pass filter (m)
            temporal_wavelength: Temporal wavelength for high-pass filter (days)
            
        Returns:
            Estimated APS array (n_ifg, height, width)
        """
        try:
            logger.info("Estimating atmospheric phase screen from time series")
            
            # Apply spatial high-pass filter
            aps_spatial = np.zeros_like(self.ifg_stack)
            
            for i in range(self.n_ifg):
                aps_spatial[i] = self._spatial_high_pass_filter(
                    self.ifg_stack[i],
                    spatial_wavelength
                )
            
            # Apply temporal high-pass filter
            aps_spatiotemporal = np.zeros_like(aps_spatial)
            
            for i in range(self.height):
                for j in range(self.width):
                    time_series = aps_spatial[:, i, j]
                    aps_spatiotemporal[:, i, j] = self._temporal_high_pass_filter(
                        time_series,
                        temporal_wavelength
                    )
            
            logger.info(f"APS estimation completed: mean={np.nanmean(aps_spatiotemporal):.6f}")
            
            return aps_spatiotemporal
            
        except Exception as e:
            logger.error(f"Error estimating APS: {e}")
            return np.zeros_like(self.ifg_stack)
    
    def separate_deformation_and_atmosphere(
        self,
        spatial_wavelength: float = 1000,
        temporal_wavelength: float = 30
    ) -> Dict[str, np.ndarray]:
        """
        Separate deformation and atmospheric signals
        
        Args:
            spatial_wavelength: Spatial wavelength for high-pass filter (m)
            temporal_wavelength: Temporal wavelength for high-pass filter (days)
            
        Returns:
            Dictionary with separated signals
        """
        try:
            logger.info("Separating deformation and atmospheric signals")
            
            # Estimate APS
            aps = self.estimate_atmospheric_phase_screen(
                spatial_wavelength,
                temporal_wavelength
            )
            
            # Separate deformation
            deformation = self.ifg_stack - aps
            
            # Calculate statistics
            aps_stats = {
                "mean": float(np.nanmean(aps)),
                "std": float(np.nanstd(aps)),
                "min": float(np.nanmin(aps)),
                "max": float(np.nanmax(aps))
            }
            
            deformation_stats = {
                "mean": float(np.nanmean(deformation)),
                "std": float(np.nanstd(deformation)),
                "min": float(np.nanmin(deformation)),
                "max": float(np.nanmax(deformation))
            }
            
            logger.info(f"Separation completed: APS std={aps_stats['std']:.6f}, Deformation std={deformation_stats['std']:.6f}")
            
            return {
                "aps": aps,
                "deformation": deformation,
                "aps_statistics": aps_stats,
                "deformation_statistics": deformation_stats
            }
            
        except Exception as e:
            logger.error(f"Error separating signals: {e}")
            return {}
    
    def _spatial_high_pass_filter(
        self,
        data: np.ndarray,
        wavelength: float
    ) -> np.ndarray:
        """
        Apply spatial high-pass filter
        
        Args:
            data: Input data
            wavelength: Wavelength for filter (m)
            
        Returns:
            Filtered data
        """
        # Estimate filter kernel size
        kernel_size = max(3, int(wavelength / 30))  # Assume 30m pixel size
        if kernel_size % 2 == 0:
            kernel_size += 1
        
        # Apply Gaussian low-pass filter
        low_pass = ndimage.gaussian_filter(data, sigma=kernel_size/2)
        
        # High-pass = original - low-pass
        high_pass = data - low_pass
        
        return high_pass
    
    def _temporal_high_pass_filter(
        self,
        time_series: np.ndarray,
        wavelength: float
    ) -> np.ndarray:
        """
        Apply temporal high-pass filter
        
        Args:
            time_series: Time series data
            wavelength: Wavelength for filter (days)
            
        Returns:
            Filtered time series
        """
        # Create temporal kernel
        n_points = len(time_series)
        kernel_size = max(3, int(n_points * 1 / wavelength))
        if kernel_size % 2 == 0:
            kernel_size += 1
        
        # Apply Savitzky-Golay filter for smoothing
        if kernel_size <= n_points:
            low_pass = signal.savgol_filter(time_series, kernel_size, 2)
        else:
            low_pass = np.mean(time_series) * np.ones_like(time_series)
        
        # High-pass
        high_pass = time_series - low_pass
        
        return high_pass
    
    def estimate_velocity_map(
        self,
        deformation: np.ndarray,
        time_intervals: List[float]
    ) -> np.ndarray:
        """
        Estimate deformation velocity map from time series
        
        Args:
            deformation: Separated deformation signal
            time_intervals: Time intervals between interferograms (days)
            
        Returns:
            Velocity map (rad/day)
        """
        try:
            logger.info("Estimating deformation velocity map")
            
            # Fit linear trend to each pixel
            velocity = np.zeros((self.height, self.width))
            
            for i in range(self.height):
                for j in range(self.width):
                    time_series = deformation[:, i, j]
                    
                    # Skip if too many NaNs
                    if np.sum(~np.isnan(time_series)) < 3:
                        velocity[i, j] = np.nan
                        continue
                    
                    # Fit linear trend
                    valid_idx = ~np.isnan(time_series)
                    if np.sum(valid_idx) > 1:
                        coeffs = np.polyfit(
                            np.array(time_intervals)[valid_idx],
                            time_series[valid_idx],
                            1
                        )
                        velocity[i, j] = coeffs[0]
                    else:
                        velocity[i, j] = np.nan
            
            logger.info(f"Velocity map estimated: mean={np.nanmean(velocity):.6f} rad/day")
            
            return velocity
            
        except Exception as e:
            logger.error(f"Error estimating velocity map: {e}")
            return np.zeros((self.height, self.width))
    
    def save_results(
        self,
        aps: np.ndarray,
        deformation: np.ndarray,
        velocity: np.ndarray = None
    ) -> Dict[str, str]:
        """
        Save correction results to files
        
        Args:
            aps: Atmospheric phase screen
            deformation: Separated deformation
            velocity: Velocity map (optional)
            
        Returns:
            Dictionary with output file paths
        """
        try:
            output_files = {}
            
            # Save APS stack
            aps_file = self.output_dir / "aps_stack.tif"
            with rasterio.open(
                aps_file, 'w',
                driver='GTiff',
                height=aps.shape[1],
                width=aps.shape[2],
                count=aps.shape[0],
                dtype=rasterio.float32,
                crs='EPSG:4326',
                transform=Affine.identity()
            ) as dst:
                for i in range(aps.shape[0]):
                    dst.write(aps[i].astype(np.float32), i+1)
            
            output_files["aps_stack"] = str(aps_file)
            
            # Save deformation stack
            deformation_file = self.output_dir / "deformation_stack.tif"
            with rasterio.open(
                deformation_file, 'w',
                driver='GTiff',
                height=deformation.shape[1],
                width=deformation.shape[2],
                count=deformation.shape[0],
                dtype=rasterio.float32,
                crs='EPSG:4326',
                transform=Affine.identity()
            ) as dst:
                for i in range(deformation.shape[0]):
                    dst.write(deformation[i].astype(np.float32), i+1)
            
            output_files["deformation_stack"] = str(deformation_file)
            
            # Save velocity map if provided
            if velocity is not None:
                velocity_file = self.output_dir / "velocity_map.tif"
                with rasterio.open(
                    velocity_file, 'w',
                    driver='GTiff',
                    height=velocity.shape[0],
                    width=velocity.shape[1],
                    count=1,
                    dtype=rasterio.float32,
                    crs='EPSG:4326',
                    transform=Affine.identity()
                ) as dst:
                    dst.write(velocity.astype(np.float32), 1)
                
                output_files["velocity_map"] = str(velocity_file)
            
            logger.info(f"Results saved to {self.output_dir}")
            
            return output_files
            
        except Exception as e:
            logger.error(f"Error saving results: {e}")
            return {}


class TimeSeriesCorrectionPipeline:
    """Complete time series atmospheric correction pipeline"""
    
    def __init__(
        self,
        interferogram_files: List[str],
        output_dir: str
    ):
        """
        Initialize pipeline
        
        Args:
            interferogram_files: List of interferogram file paths
            output_dir: Output directory
        """
        self.interferogram_files = interferogram_files
        self.output_dir = Path(output_dir)
        self.corrector = TimeSeriesAtmosphericCorrection(interferogram_files, str(self.output_dir))
        
        logger.info("TimeSeriesCorrectionPipeline initialized")
    
    def run_full_correction(
        self,
        spatial_wavelength: float = 1000,
        temporal_wavelength: float = 30
    ) -> Dict[str, Any]:
        """
        Run complete time series correction pipeline
        
        Args:
            spatial_wavelength: Spatial wavelength for high-pass filter (m)
            temporal_wavelength: Temporal wavelength for high-pass filter (days)
            
        Returns:
            Pipeline results
        """
        try:
            logger.info("Starting time series atmospheric correction pipeline")
            
            # Separate signals
            separation_result = self.corrector.separate_deformation_and_atmosphere(
                spatial_wavelength,
                temporal_wavelength
            )
            
            if not separation_result:
                return {"status": "error", "error": "Failed to separate signals"}
            
            aps = separation_result["aps"]
            deformation = separation_result["deformation"]
            
            # Calculate time intervals
            dates = self.corrector.dates
            time_intervals = [(dates[i] - dates[0]).days for i in range(len(dates))]
            
            # Estimate velocity
            velocity = self.corrector.estimate_velocity_map(deformation, time_intervals)
            
            # Save results
            output_files = self.corrector.save_results(aps, deformation, velocity)
            
            logger.info("Time series correction pipeline completed")
            
            return {
                "status": "completed",
                "output_files": output_files,
                "statistics": {
                    "aps": separation_result["aps_statistics"],
                    "deformation": separation_result["deformation_statistics"],
                    "velocity": {
                        "mean": float(np.nanmean(velocity)),
                        "std": float(np.nanstd(velocity)),
                        "min": float(np.nanmin(velocity)),
                        "max": float(np.nanmax(velocity))
                    }
                },
                "n_interferograms": len(self.interferogram_files),
                "time_span_days": time_intervals[-1] if time_intervals else 0
            }
            
        except Exception as e:
            logger.error(f"Error in time series correction pipeline: {e}")
            return {"status": "error", "error": str(e)}
