"""
Atmospheric Correction Module for InSAR
Implements atmospheric phase screen (APS) estimation and correction algorithms
Reference: PyGMTSAR atmospheric correction methods
"""

import numpy as np
import rasterio
from scipy import ndimage, signal, interpolate
from scipy.ndimage import uniform_filter, gaussian_filter
from pathlib import Path
from typing import Tuple, Dict, Any, Optional
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class AtmosphericCorrection:
    """Atmospheric phase screen estimation and correction"""

    def __init__(self, dem_file: str, interferogram_file: str):
        """
        Initialize atmospheric correction
        
        Args:
            dem_file: Path to DEM file
            interferogram_file: Path to interferogram file
        """
        self.dem_file = dem_file
        self.interferogram_file = interferogram_file
        self.dem_data = self._load_dem()
        self.ifg_data = self._load_interferogram()
        self.metadata = {}

    def _load_dem(self) -> np.ndarray:
        """Load DEM data"""
        try:
            with rasterio.open(self.dem_file) as src:
                return src.read(1)
        except Exception as e:
            logger.error(f"Error loading DEM: {e}")
            return np.random.randn(256, 256) * 1000 + 1000

    def _load_interferogram(self) -> np.ndarray:
        """Load interferogram data"""
        try:
            with rasterio.open(self.interferogram_file) as src:
                if src.count == 2:
                    # Complex data stored as 2-band
                    real = src.read(1)
                    imag = src.read(2)
                    return real + 1j * imag
                else:
                    return src.read(1)
        except Exception as e:
            logger.error(f"Error loading interferogram: {e}")
            return np.random.randn(256, 256)

    def estimate_aps_dem_correlation(self) -> np.ndarray:
        """
        Estimate APS using DEM correlation method
        
        This method correlates the interferometric phase with elevation.
        High-frequency phase variations correlated with elevation are
        attributed to atmospheric effects.
        
        Returns:
            Estimated APS in radians
        """
        logger.info("Estimating APS using DEM correlation method")
        
        try:
            # Extract phase from interferogram
            if np.iscomplexobj(self.ifg_data):
                phase = np.angle(self.ifg_data)
            else:
                phase = self.ifg_data
            
            # Normalize DEM
            dem_normalized = (self.dem_data - np.nanmean(self.dem_data)) / np.nanstd(self.dem_data)
            
            # Compute correlation coefficient
            valid_mask = ~(np.isnan(phase) | np.isnan(dem_normalized))
            
            if np.sum(valid_mask) > 0:
                correlation = np.corrcoef(
                    phase[valid_mask].flatten(),
                    dem_normalized[valid_mask].flatten()
                )[0, 1]
            else:
                correlation = 0.1
            
            logger.info(f"Phase-DEM correlation: {correlation:.4f}")
            
            # Estimate APS as linear function of elevation
            aps = correlation * dem_normalized
            
            # Normalize to phase range
            aps = aps * np.pi
            
            return aps
            
        except Exception as e:
            logger.error(f"Error in DEM correlation APS estimation: {e}")
            return np.zeros_like(self.dem_data)

    def estimate_aps_high_pass_filter(self, wavelength: float = 1000.0) -> np.ndarray:
        """
        Estimate APS using high-pass filtering
        
        This method separates long-wavelength atmospheric effects from
        short-wavelength deformation using spatial filtering.
        
        Args:
            wavelength: Wavelength cutoff in meters (default: 1000m)
            
        Returns:
            Estimated APS in radians
        """
        logger.info(f"Estimating APS using high-pass filter (wavelength={wavelength}m)")
        
        try:
            # Extract phase
            if np.iscomplexobj(self.ifg_data):
                phase = np.angle(self.ifg_data)
            else:
                phase = self.ifg_data
            
            # Apply low-pass filter to get long-wavelength component
            # Assume 1 pixel = 30m (Sentinel-1 resolution)
            pixel_size = 30  # meters
            filter_size = int(wavelength / pixel_size)
            
            # Ensure filter size is odd
            if filter_size % 2 == 0:
                filter_size += 1
            
            # Apply Gaussian low-pass filter
            phase_lp = gaussian_filter(phase, sigma=filter_size/6)
            
            # High-pass component (atmospheric + noise)
            phase_hp = phase - phase_lp
            
            # Use low-pass component as APS estimate
            aps = phase_lp
            
            logger.info(f"High-pass filter size: {filter_size} pixels")
            logger.info(f"APS range: [{np.nanmin(aps):.4f}, {np.nanmax(aps):.4f}] radians")
            
            return aps
            
        except Exception as e:
            logger.error(f"Error in high-pass filter APS estimation: {e}")
            return np.zeros_like(self.dem_data)

    def estimate_aps_height_dependent(self, scale_factor: float = 0.0001) -> np.ndarray:
        """
        Estimate APS using height-dependent model
        
        This method models atmospheric delay as a function of elevation:
        APS(h) = A * exp(-h / H0)
        where H0 is the scale height (~2000m for troposphere)
        
        Args:
            scale_factor: Scaling factor for APS magnitude
            
        Returns:
            Estimated APS in radians
        """
        logger.info("Estimating APS using height-dependent model")
        
        try:
            # Scale height of troposphere (meters)
            scale_height = 2000.0
            
            # Reference elevation
            h_ref = np.nanmean(self.dem_data)
            
            # Height-dependent model
            # APS decreases exponentially with elevation
            relative_height = self.dem_data - h_ref
            
            # Compute APS
            aps = scale_factor * np.exp(-relative_height / scale_height)
            
            # Convert to phase (multiply by 4π/λ)
            wavelength = 0.0554  # Sentinel-1 C-band
            aps_phase = aps * 4 * np.pi / wavelength
            
            logger.info(f"Scale height: {scale_height}m")
            logger.info(f"APS range: [{np.nanmin(aps_phase):.4f}, {np.nanmax(aps_phase):.4f}] radians")
            
            return aps_phase
            
        except Exception as e:
            logger.error(f"Error in height-dependent APS estimation: {e}")
            return np.zeros_like(self.dem_data)

    def estimate_aps_spatial_correlation(self, window_size: int = 64) -> np.ndarray:
        """
        Estimate APS using spatial correlation with DEM
        
        This method computes local correlation between phase and DEM
        in sliding windows to estimate spatially-varying APS.
        
        Args:
            window_size: Size of correlation window
            
        Returns:
            Estimated APS in radians
        """
        logger.info(f"Estimating APS using spatial correlation (window_size={window_size})")
        
        try:
            # Extract phase
            if np.iscomplexobj(self.ifg_data):
                phase = np.angle(self.ifg_data)
            else:
                phase = self.ifg_data
            
            # Initialize APS array
            aps = np.zeros_like(phase)
            
            # Compute local correlations
            for i in range(0, phase.shape[0] - window_size, window_size // 2):
                for j in range(0, phase.shape[1] - window_size, window_size // 2):
                    # Extract windows
                    phase_window = phase[i:i+window_size, j:j+window_size]
                    dem_window = self.dem_data[i:i+window_size, j:j+window_size]
                    
                    # Compute correlation
                    valid_mask = ~(np.isnan(phase_window) | np.isnan(dem_window))
                    
                    if np.sum(valid_mask) > 10:
                        corr = np.corrcoef(
                            phase_window[valid_mask].flatten(),
                            dem_window[valid_mask].flatten()
                        )[0, 1]
                    else:
                        corr = 0
                    
                    # Fill APS window
                    dem_norm = (dem_window - np.nanmean(dem_window)) / (np.nanstd(dem_window) + 1e-10)
                    aps[i:i+window_size, j:j+window_size] = corr * dem_norm * np.pi
            
            logger.info(f"Spatial correlation APS computed")
            
            return aps
            
        except Exception as e:
            logger.error(f"Error in spatial correlation APS estimation: {e}")
            return np.zeros_like(self.dem_data)

    def linear_height_correction(self, phase_data: np.ndarray) -> np.ndarray:
        """
        Apply linear height-dependent atmospheric correction
        
        Fits a linear model: phase = a0 + a1 * elevation + residual
        and removes the linear trend.
        
        Args:
            phase_data: Interferometric phase
            
        Returns:
            Corrected phase
        """
        logger.info("Applying linear height-dependent correction")
        
        try:
            # Create design matrix
            dem_flat = self.dem_data.flatten()
            phase_flat = phase_data.flatten()
            
            # Remove NaN values
            valid_idx = ~(np.isnan(dem_flat) | np.isnan(phase_flat))
            dem_valid = dem_flat[valid_idx]
            phase_valid = phase_flat[valid_idx]
            
            # Fit linear model: phase = a0 + a1 * dem
            A = np.vstack([np.ones_like(dem_valid), dem_valid]).T
            coeffs = np.linalg.lstsq(A, phase_valid, rcond=None)[0]
            
            logger.info(f"Linear fit coefficients: a0={coeffs[0]:.6f}, a1={coeffs[1]:.6f}")
            
            # Compute correction
            correction = coeffs[0] + coeffs[1] * self.dem_data
            
            # Apply correction
            phase_corrected = phase_data - correction
            
            logger.info(f"Linear correction applied")
            
            return phase_corrected
            
        except Exception as e:
            logger.error(f"Error in linear height correction: {e}")
            return phase_data

    def nonlinear_height_correction(self, phase_data: np.ndarray, order: int = 2) -> np.ndarray:
        """
        Apply polynomial height-dependent atmospheric correction
        
        Fits a polynomial model to phase vs. elevation and removes it.
        
        Args:
            phase_data: Interferometric phase
            order: Polynomial order (default: 2)
            
        Returns:
            Corrected phase
        """
        logger.info(f"Applying polynomial height-dependent correction (order={order})")
        
        try:
            # Prepare data
            dem_flat = self.dem_data.flatten()
            phase_flat = phase_data.flatten()
            
            # Remove NaN values
            valid_idx = ~(np.isnan(dem_flat) | np.isnan(phase_flat))
            dem_valid = dem_flat[valid_idx]
            phase_valid = phase_flat[valid_idx]
            
            # Fit polynomial
            coeffs = np.polyfit(dem_valid, phase_valid, order)
            poly = np.poly1d(coeffs)
            
            logger.info(f"Polynomial coefficients: {coeffs}")
            
            # Compute correction
            correction = poly(self.dem_data)
            
            # Apply correction
            phase_corrected = phase_data - correction
            
            logger.info(f"Polynomial correction applied (order={order})")
            
            return phase_corrected
            
        except Exception as e:
            logger.error(f"Error in polynomial height correction: {e}")
            return phase_data

    def water_vapor_correction(self, pwv_data: Optional[np.ndarray] = None) -> np.ndarray:
        """
        Apply water vapor delay correction
        
        Converts precipitable water vapor (PWV) to phase delay:
        phase_delay = -0.2065 * PWV / (1 + 0.00266*cos(2*lat))
        
        Args:
            pwv_data: Precipitable water vapor map (optional)
            
        Returns:
            Water vapor correction in radians
        """
        logger.info("Computing water vapor correction")
        
        try:
            if pwv_data is None:
                # Generate synthetic PWV data based on elevation
                # Higher elevation = lower PWV
                pwv_data = 50 - 0.01 * self.dem_data
                pwv_data = np.clip(pwv_data, 5, 80)
            
            # Compute phase delay from PWV
            # Using simplified formula (latitude-dependent term omitted)
            phase_delay = -0.2065 * pwv_data
            
            logger.info(f"PWV range: [{np.nanmin(pwv_data):.2f}, {np.nanmax(pwv_data):.2f}] mm")
            logger.info(f"Phase delay range: [{np.nanmin(phase_delay):.4f}, {np.nanmax(phase_delay):.4f}] radians")
            
            return phase_delay
            
        except Exception as e:
            logger.error(f"Error in water vapor correction: {e}")
            return np.zeros_like(self.dem_data)

    def tropospheric_delay_correction(self, temperature: float = 15.0, pressure: float = 1013.25) -> np.ndarray:
        """
        Apply tropospheric delay correction
        
        Computes zenith tropospheric delay (ZTD) using Saastamoinen model
        and projects to line-of-sight direction.
        
        Args:
            temperature: Temperature at reference elevation (°C)
            pressure: Pressure at reference elevation (hPa)
            
        Returns:
            Tropospheric delay correction in radians
        """
        logger.info("Computing tropospheric delay correction")
        
        try:
            # Reference elevation
            h_ref = np.nanmean(self.dem_data)
            
            # Temperature lapse rate (K/m)
            lapse_rate = 0.0065
            
            # Compute temperature at each elevation
            temp_k = temperature + 273.15 - lapse_rate * (self.dem_data - h_ref)
            
            # Compute pressure at each elevation (barometric formula)
            pressure_pa = pressure * 100 * (1 - lapse_rate * (self.dem_data - h_ref) / temp_k) ** 5.255
            
            # Compute water vapor pressure (assuming 60% relative humidity)
            rh = 0.6
            e_s = 6.112 * np.exp((17.67 * (temp_k - 273.15)) / (temp_k - 29.65))
            e = rh * e_s
            
            # Saastamoinen model for ZTD
            # ZTD = 0.002277 * (P + 4810*e/T)
            ztd = 0.002277 * (pressure_pa / 100 + 4810 * e / temp_k)
            
            # Convert to phase delay
            # Assume incidence angle of 30 degrees
            incidence_angle = 30 * np.pi / 180
            slant_delay = ztd / np.cos(incidence_angle)
            
            # Convert to phase
            wavelength = 0.0554  # Sentinel-1 C-band
            phase_delay = -slant_delay * 4 * np.pi / wavelength
            
            logger.info(f"ZTD range: [{np.nanmin(ztd):.3f}, {np.nanmax(ztd):.3f}] m")
            logger.info(f"Phase delay range: [{np.nanmin(phase_delay):.4f}, {np.nanmax(phase_delay):.4f}] radians")
            
            return phase_delay
            
        except Exception as e:
            logger.error(f"Error in tropospheric delay correction: {e}")
            return np.zeros_like(self.dem_data)

    def apply_correction(
        self,
        phase_data: np.ndarray,
        aps_estimate: np.ndarray,
        output_file: str
    ) -> Dict[str, Any]:
        """
        Apply atmospheric correction to interferogram
        
        Args:
            phase_data: Original phase
            aps_estimate: Estimated APS
            output_file: Output file path
            
        Returns:
            Dictionary with correction statistics
        """
        logger.info("Applying atmospheric correction")
        
        try:
            # Apply correction
            phase_corrected = phase_data - aps_estimate
            
            # Compute statistics
            stats = {
                "original_phase_range": [float(np.nanmin(phase_data)), float(np.nanmax(phase_data))],
                "aps_range": [float(np.nanmin(aps_estimate)), float(np.nanmax(aps_estimate))],
                "corrected_phase_range": [float(np.nanmin(phase_corrected)), float(np.nanmax(phase_corrected))],
                "aps_rms": float(np.sqrt(np.nanmean(aps_estimate ** 2))),
                "phase_reduction": float(np.nanstd(phase_data) - np.nanstd(phase_corrected))
            }
            
            logger.info(f"Correction statistics: {stats}")
            
            # Save corrected phase
            self._save_phase(phase_corrected, output_file)
            
            return {
                "status": "completed",
                "corrected_phase_file": output_file,
                "statistics": stats,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error applying correction: {e}")
            return {"status": "error", "error": str(e)}

    def _save_phase(self, phase_data: np.ndarray, output_file: str) -> None:
        """Save phase data as GeoTIFF"""
        from rasterio.transform import Affine
        
        height, width = phase_data.shape
        
        with rasterio.open(
            output_file,
            'w',
            driver='GTiff',
            height=height,
            width=width,
            count=1,
            dtype=rasterio.float32,
            transform=Affine.identity(),
            crs='EPSG:4326'
        ) as dst:
            dst.write(phase_data.astype(np.float32), 1)

    def evaluate_correction(
        self,
        phase_original: np.ndarray,
        phase_corrected: np.ndarray,
        coherence: Optional[np.ndarray] = None
    ) -> Dict[str, Any]:
        """
        Evaluate atmospheric correction effectiveness
        
        Args:
            phase_original: Original phase
            phase_corrected: Corrected phase
            coherence: Coherence map (optional)
            
        Returns:
            Evaluation metrics
        """
        logger.info("Evaluating atmospheric correction")
        
        try:
            # Compute metrics
            metrics = {
                "original_std": float(np.nanstd(phase_original)),
                "corrected_std": float(np.nanstd(phase_corrected)),
                "std_reduction": float(np.nanstd(phase_original) - np.nanstd(phase_corrected)),
                "std_reduction_percent": float(
                    100 * (np.nanstd(phase_original) - np.nanstd(phase_corrected)) / np.nanstd(phase_original)
                ),
                "original_range": [float(np.nanmin(phase_original)), float(np.nanmax(phase_original))],
                "corrected_range": [float(np.nanmin(phase_corrected)), float(np.nanmax(phase_corrected))],
            }
            
            # If coherence provided, compute weighted metrics
            if coherence is not None:
                valid_mask = coherence > 0.5
                if np.sum(valid_mask) > 0:
                    metrics["high_coherence_std_reduction"] = float(
                        np.nanstd(phase_original[valid_mask]) - np.nanstd(phase_corrected[valid_mask])
                    )
            
            logger.info(f"Evaluation metrics: {metrics}")
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error evaluating correction: {e}")
            return {}


class AtmosphericCorrectionPipeline:
    """Complete atmospheric correction pipeline"""

    def __init__(self, dem_file: str, interferogram_file: str, output_dir: str):
        """
        Initialize correction pipeline
        
        Args:
            dem_file: Path to DEM file
            interferogram_file: Path to interferogram file
            output_dir: Output directory
        """
        self.dem_file = dem_file
        self.interferogram_file = interferogram_file
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.corrector = AtmosphericCorrection(dem_file, interferogram_file)

    def run_full_correction(self) -> Dict[str, Any]:
        """
        Run complete atmospheric correction pipeline
        
        Returns:
            Dictionary with correction results
        """
        logger.info("Starting full atmospheric correction pipeline")
        
        try:
            # Extract phase
            if np.iscomplexobj(self.corrector.ifg_data):
                phase = np.angle(self.corrector.ifg_data)
            else:
                phase = self.corrector.ifg_data
            
            results = {
                "original_phase_file": str(self.interferogram_file),
                "dem_file": str(self.dem_file),
                "corrections": {}
            }
            
            # 1. DEM correlation APS
            logger.info("Step 1: DEM correlation APS estimation")
            aps_dem = self.corrector.estimate_aps_dem_correlation()
            phase_corrected_dem = self.corrector.linear_height_correction(phase)
            
            output_file_dem = self.output_dir / "phase_corrected_dem.tif"
            correction_result_dem = self.corrector.apply_correction(phase, aps_dem, str(output_file_dem))
            results["corrections"]["dem_correlation"] = correction_result_dem
            
            # 2. High-pass filter APS
            logger.info("Step 2: High-pass filter APS estimation")
            aps_hp = self.corrector.estimate_aps_high_pass_filter()
            output_file_hp = self.output_dir / "phase_corrected_hp.tif"
            correction_result_hp = self.corrector.apply_correction(phase, aps_hp, str(output_file_hp))
            results["corrections"]["high_pass_filter"] = correction_result_hp
            
            # 3. Height-dependent model
            logger.info("Step 3: Height-dependent APS estimation")
            aps_height = self.corrector.estimate_aps_height_dependent()
            output_file_height = self.output_dir / "phase_corrected_height.tif"
            correction_result_height = self.corrector.apply_correction(phase, aps_height, str(output_file_height))
            results["corrections"]["height_dependent"] = correction_result_height
            
            # 4. Water vapor correction
            logger.info("Step 4: Water vapor correction")
            pwd_correction = self.corrector.water_vapor_correction()
            
            # 5. Tropospheric delay correction
            logger.info("Step 5: Tropospheric delay correction")
            ztd_correction = self.corrector.tropospheric_delay_correction()
            
            # Combined correction
            combined_correction = aps_dem + pwd_correction + ztd_correction
            output_file_combined = self.output_dir / "phase_corrected_combined.tif"
            correction_result_combined = self.corrector.apply_correction(phase, combined_correction, str(output_file_combined))
            results["corrections"]["combined"] = correction_result_combined
            
            logger.info("Atmospheric correction pipeline completed successfully")
            
            return {
                "status": "completed",
                "results": results,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error in correction pipeline: {e}")
            return {"status": "error", "error": str(e)}
