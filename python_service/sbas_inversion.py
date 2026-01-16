"""
SBAS (Small Baseline Subset) Time Series Inversion Module
Implements SBAS algorithm for InSAR time series analysis
"""

import logging
import numpy as np
from typing import Dict, Any, List, Tuple, Optional
from pathlib import Path
from datetime import datetime
import rasterio
from rasterio.transform import Affine
from scipy import linalg
from scipy.sparse import csr_matrix
from scipy.sparse.linalg import lsqr

logger = logging.getLogger(__name__)


class SBASNetwork:
    """Build and manage SBAS interferogram network"""
    
    def __init__(self, dates: List[str], baseline_threshold: float = 150.0):
        """
        Initialize SBAS network
        
        Args:
            dates: List of acquisition dates (YYYY-MM-DD)
            baseline_threshold: Maximum perpendicular baseline (m)
        """
        self.dates = sorted([datetime.strptime(d, "%Y-%m-%d") for d in dates])
        self.n_dates = len(self.dates)
        self.baseline_threshold = baseline_threshold
        
        self.pairs = []
        self.baselines = {}
        
        logger.info(f"SBASNetwork initialized with {self.n_dates} dates")
    
    def build_network(
        self,
        max_temporal_baseline: int = 365,
        max_perpendicular_baseline: float = 150.0
    ) -> Dict[str, Any]:
        """
        Build interferogram network
        
        Args:
            max_temporal_baseline: Maximum temporal baseline (days)
            max_perpendicular_baseline: Maximum perpendicular baseline (m)
            
        Returns:
            Network information
        """
        try:
            logger.info("Building SBAS network")
            
            self.pairs = []
            
            for i in range(self.n_dates):
                for j in range(i + 1, self.n_dates):
                    # Calculate temporal baseline
                    temporal_baseline = (self.dates[j] - self.dates[i]).days
                    
                    if temporal_baseline > max_temporal_baseline:
                        continue
                    
                    # Simulate perpendicular baseline
                    perp_baseline = np.random.uniform(0, max_perpendicular_baseline)
                    
                    if perp_baseline > max_perpendicular_baseline:
                        continue
                    
                    pair = {
                        "master_idx": i,
                        "slave_idx": j,
                        "master_date": self.dates[i].strftime("%Y-%m-%d"),
                        "slave_date": self.dates[j].strftime("%Y-%m-%d"),
                        "temporal_baseline": temporal_baseline,
                        "perpendicular_baseline": perp_baseline
                    }
                    
                    self.pairs.append(pair)
                    self.baselines[(i, j)] = {
                        "temporal": temporal_baseline,
                        "perpendicular": perp_baseline
                    }
            
            logger.info(f"Built network with {len(self.pairs)} pairs")
            
            return {
                "status": "completed",
                "n_dates": self.n_dates,
                "n_pairs": len(self.pairs),
                "pairs": self.pairs,
                "connectivity": self._check_connectivity()
            }
            
        except Exception as e:
            logger.error(f"Network building error: {e}")
            return {"status": "error", "error": str(e)}
    
    def _check_connectivity(self) -> Dict[str, Any]:
        """Check network connectivity"""
        # Build adjacency matrix
        adj = np.zeros((self.n_dates, self.n_dates))
        
        for pair in self.pairs:
            i, j = pair["master_idx"], pair["slave_idx"]
            adj[i, j] = 1
            adj[j, i] = 1
        
        # Check connectivity using BFS
        visited = np.zeros(self.n_dates, dtype=bool)
        queue = [0]
        visited[0] = True
        
        while queue:
            node = queue.pop(0)
            for neighbor in range(self.n_dates):
                if adj[node, neighbor] and not visited[neighbor]:
                    visited[neighbor] = True
                    queue.append(neighbor)
        
        is_connected = np.all(visited)
        
        return {
            "is_connected": bool(is_connected),
            "n_connected": int(np.sum(visited)),
            "n_disconnected": int(np.sum(~visited))
        }
    
    def get_design_matrix(self) -> np.ndarray:
        """
        Build SBAS design matrix
        
        Returns:
            Design matrix (n_pairs x n_dates-1)
        """
        n_pairs = len(self.pairs)
        n_unknowns = self.n_dates - 1  # Velocity between consecutive dates
        
        A = np.zeros((n_pairs, n_unknowns))
        
        for k, pair in enumerate(self.pairs):
            i, j = pair["master_idx"], pair["slave_idx"]
            
            # Fill design matrix
            for m in range(i, j):
                A[k, m] = (self.dates[m + 1] - self.dates[m]).days
        
        return A


class SBASInversion:
    """SBAS time series inversion"""
    
    def __init__(self, network: SBASNetwork):
        """
        Initialize SBAS inversion
        
        Args:
            network: SBAS network object
        """
        self.network = network
        self.design_matrix = network.get_design_matrix()
        
        logger.info("SBASInversion initialized")
    
    def invert_velocity(
        self,
        unwrapped_phases: np.ndarray,
        coherence_stack: np.ndarray = None,
        regularization: float = 0.01
    ) -> Dict[str, Any]:
        """
        Invert for velocity time series
        
        Args:
            unwrapped_phases: Stack of unwrapped phases (n_pairs, height, width)
            coherence_stack: Stack of coherence values (n_pairs, height, width)
            regularization: Regularization parameter
            
        Returns:
            Inversion results
        """
        try:
            logger.info("Starting SBAS velocity inversion")
            
            n_pairs, height, width = unwrapped_phases.shape
            n_dates = self.network.n_dates
            
            # Initialize output arrays
            velocity = np.zeros((height, width))
            displacement_ts = np.zeros((n_dates, height, width))
            residual = np.zeros((height, width))
            
            # Design matrix
            A = self.design_matrix
            
            # Add regularization
            A_reg = np.vstack([A, regularization * np.eye(A.shape[1])])
            
            # Process each pixel
            for i in range(height):
                for j in range(width):
                    # Get phase values for this pixel
                    phase_values = unwrapped_phases[:, i, j]
                    
                    # Skip if too many NaNs
                    valid_mask = ~np.isnan(phase_values)
                    if np.sum(valid_mask) < 3:
                        velocity[i, j] = np.nan
                        continue
                    
                    # Get weights from coherence
                    if coherence_stack is not None:
                        weights = coherence_stack[:, i, j] ** 2
                    else:
                        weights = np.ones(n_pairs)
                    
                    # Weighted least squares
                    W = np.diag(np.sqrt(weights[valid_mask]))
                    A_valid = A[valid_mask, :]
                    b_valid = phase_values[valid_mask]
                    
                    # Add regularization
                    A_weighted = np.vstack([W @ A_valid, regularization * np.eye(A_valid.shape[1])])
                    b_weighted = np.concatenate([W @ b_valid, np.zeros(A_valid.shape[1])])
                    
                    # Solve
                    try:
                        v, _, _, _ = np.linalg.lstsq(A_weighted, b_weighted, rcond=None)
                        
                        # Calculate cumulative displacement
                        displacement_ts[0, i, j] = 0
                        for k in range(len(v)):
                            displacement_ts[k + 1, i, j] = displacement_ts[k, i, j] + v[k]
                        
                        # Calculate mean velocity
                        total_days = (self.network.dates[-1] - self.network.dates[0]).days
                        velocity[i, j] = displacement_ts[-1, i, j] / total_days * 365  # rad/year
                        
                        # Calculate residual
                        residual[i, j] = np.sqrt(np.mean((A_valid @ v - b_valid) ** 2))
                        
                    except Exception:
                        velocity[i, j] = np.nan
            
            # Calculate statistics
            stats = {
                "velocity_mean": float(np.nanmean(velocity)),
                "velocity_std": float(np.nanstd(velocity)),
                "velocity_min": float(np.nanmin(velocity)),
                "velocity_max": float(np.nanmax(velocity)),
                "residual_mean": float(np.nanmean(residual)),
                "residual_std": float(np.nanstd(residual))
            }
            
            logger.info(f"SBAS inversion completed: velocity mean={stats['velocity_mean']:.4f} rad/year")
            
            return {
                "status": "completed",
                "velocity": velocity,
                "displacement_ts": displacement_ts,
                "residual": residual,
                "statistics": stats
            }
            
        except Exception as e:
            logger.error(f"SBAS inversion error: {e}")
            return {"status": "error", "error": str(e)}
    
    def convert_to_displacement(
        self,
        phase: np.ndarray,
        wavelength: float = 0.0555,
        incidence_angle: float = 34.0
    ) -> np.ndarray:
        """
        Convert phase to LOS displacement
        
        Args:
            phase: Phase array (radians)
            wavelength: Radar wavelength (m)
            incidence_angle: Incidence angle (degrees)
            
        Returns:
            Displacement array (m)
        """
        # LOS displacement = phase * wavelength / (4 * pi)
        displacement = phase * wavelength / (4 * np.pi)
        
        return displacement
    
    def convert_to_vertical(
        self,
        los_displacement: np.ndarray,
        incidence_angle: float = 34.0
    ) -> np.ndarray:
        """
        Convert LOS displacement to vertical displacement
        
        Args:
            los_displacement: LOS displacement array (m)
            incidence_angle: Incidence angle (degrees)
            
        Returns:
            Vertical displacement array (m)
        """
        # Vertical = LOS / cos(incidence)
        vertical = los_displacement / np.cos(np.radians(incidence_angle))
        
        return vertical


class SBASProcessor:
    """Complete SBAS processing pipeline"""
    
    def __init__(self, interferogram_files: List[str], output_dir: str):
        """
        Initialize SBAS processor
        
        Args:
            interferogram_files: List of interferogram file paths
            output_dir: Output directory
        """
        self.interferogram_files = interferogram_files
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Extract dates from filenames
        self.dates = []
        for f in interferogram_files:
            # Assume format: ifg_YYYYMMDD_YYYYMMDD.tif
            parts = Path(f).stem.split('_')
            if len(parts) >= 3:
                self.dates.append(parts[1])
                self.dates.append(parts[2])
        
        self.dates = sorted(list(set(self.dates)))
        
        logger.info(f"SBASProcessor initialized with {len(interferogram_files)} interferograms")
    
    def run_sbas(
        self,
        max_temporal_baseline: int = 365,
        max_perpendicular_baseline: float = 150.0,
        regularization: float = 0.01,
        wavelength: float = 0.0555
    ) -> Dict[str, Any]:
        """
        Run complete SBAS processing
        
        Args:
            max_temporal_baseline: Maximum temporal baseline (days)
            max_perpendicular_baseline: Maximum perpendicular baseline (m)
            regularization: Regularization parameter
            wavelength: Radar wavelength (m)
            
        Returns:
            SBAS processing results
        """
        try:
            logger.info("Starting SBAS processing")
            
            # Build network
            network = SBASNetwork([d[:4] + "-" + d[4:6] + "-" + d[6:8] for d in self.dates])
            network_result = network.build_network(max_temporal_baseline, max_perpendicular_baseline)
            
            if network_result["status"] != "completed":
                return network_result
            
            if not network_result["connectivity"]["is_connected"]:
                logger.warning("Network is not fully connected")
            
            # Load interferograms
            unwrapped_phases = []
            coherence_stack = []
            
            for ifg_file in self.interferogram_files:
                with rasterio.open(ifg_file) as src:
                    unwrapped_phases.append(src.read(1))
                
                # Try to load coherence
                coh_file = ifg_file.replace("unwrapped", "coherence").replace("phase", "coherence")
                if Path(coh_file).exists():
                    with rasterio.open(coh_file) as src:
                        coherence_stack.append(src.read(1))
                else:
                    coherence_stack.append(np.ones_like(unwrapped_phases[-1]))
            
            unwrapped_phases = np.array(unwrapped_phases)
            coherence_stack = np.array(coherence_stack)
            
            # Run inversion
            inversion = SBASInversion(network)
            inversion_result = inversion.invert_velocity(
                unwrapped_phases,
                coherence_stack,
                regularization
            )
            
            if inversion_result["status"] != "completed":
                return inversion_result
            
            # Convert to displacement
            velocity_phase = inversion_result["velocity"]
            velocity_los = inversion.convert_to_displacement(velocity_phase, wavelength)
            velocity_vertical = inversion.convert_to_vertical(velocity_los)
            
            # Save results
            output_files = self._save_results(
                velocity_los,
                velocity_vertical,
                inversion_result["displacement_ts"],
                inversion_result["residual"]
            )
            
            logger.info("SBAS processing completed")
            
            return {
                "status": "completed",
                "network": network_result,
                "inversion": inversion_result["statistics"],
                "output_files": output_files,
                "n_dates": len(self.dates),
                "n_interferograms": len(self.interferogram_files),
                "time_span_days": (network.dates[-1] - network.dates[0]).days
            }
            
        except Exception as e:
            logger.error(f"SBAS processing error: {e}")
            return {"status": "error", "error": str(e)}
    
    def _save_results(
        self,
        velocity_los: np.ndarray,
        velocity_vertical: np.ndarray,
        displacement_ts: np.ndarray,
        residual: np.ndarray
    ) -> Dict[str, str]:
        """Save SBAS results to files"""
        output_files = {}
        
        # Save velocity (LOS)
        velocity_los_file = self.output_dir / "velocity_los.tif"
        with rasterio.open(
            velocity_los_file, 'w',
            driver='GTiff',
            height=velocity_los.shape[0],
            width=velocity_los.shape[1],
            count=1,
            dtype=rasterio.float32,
            crs='EPSG:4326',
            transform=Affine.identity()
        ) as dst:
            dst.write(velocity_los.astype(np.float32), 1)
        output_files["velocity_los"] = str(velocity_los_file)
        
        # Save velocity (vertical)
        velocity_vertical_file = self.output_dir / "velocity_vertical.tif"
        with rasterio.open(
            velocity_vertical_file, 'w',
            driver='GTiff',
            height=velocity_vertical.shape[0],
            width=velocity_vertical.shape[1],
            count=1,
            dtype=rasterio.float32,
            crs='EPSG:4326',
            transform=Affine.identity()
        ) as dst:
            dst.write(velocity_vertical.astype(np.float32), 1)
        output_files["velocity_vertical"] = str(velocity_vertical_file)
        
        # Save displacement time series
        displacement_file = self.output_dir / "displacement_ts.tif"
        with rasterio.open(
            displacement_file, 'w',
            driver='GTiff',
            height=displacement_ts.shape[1],
            width=displacement_ts.shape[2],
            count=displacement_ts.shape[0],
            dtype=rasterio.float32,
            crs='EPSG:4326',
            transform=Affine.identity()
        ) as dst:
            for i in range(displacement_ts.shape[0]):
                dst.write(displacement_ts[i].astype(np.float32), i + 1)
        output_files["displacement_ts"] = str(displacement_file)
        
        # Save residual
        residual_file = self.output_dir / "residual.tif"
        with rasterio.open(
            residual_file, 'w',
            driver='GTiff',
            height=residual.shape[0],
            width=residual.shape[1],
            count=1,
            dtype=rasterio.float32,
            crs='EPSG:4326',
            transform=Affine.identity()
        ) as dst:
            dst.write(residual.astype(np.float32), 1)
        output_files["residual"] = str(residual_file)
        
        logger.info(f"SBAS results saved to {self.output_dir}")
        
        return output_files
