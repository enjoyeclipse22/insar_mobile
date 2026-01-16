"""
Unit tests for atmospheric correction module
"""

import pytest
import numpy as np
import tempfile
from pathlib import Path
from atmospheric_correction import AtmosphericCorrection, AtmosphericCorrectionPipeline
import rasterio
from rasterio.transform import Affine


@pytest.fixture
def temp_dir():
    """Create temporary directory"""
    with tempfile.TemporaryDirectory() as tmpdir:
        yield tmpdir


@pytest.fixture
def synthetic_dem(temp_dir):
    """Create synthetic DEM file"""
    dem_data = np.random.randn(256, 256) * 500 + 1000
    dem_file = Path(temp_dir) / "dem.tif"
    
    with rasterio.open(
        dem_file,
        'w',
        driver='GTiff',
        height=256,
        width=256,
        count=1,
        dtype=rasterio.float32,
        transform=Affine.identity(),
        crs='EPSG:4326'
    ) as dst:
        dst.write(dem_data.astype(np.float32), 1)
    
    return str(dem_file)


@pytest.fixture
def synthetic_interferogram(temp_dir):
    """Create synthetic interferogram file"""
    # Create phase with fringe pattern
    x, y = np.meshgrid(np.linspace(0, 4*np.pi, 256), np.linspace(0, 4*np.pi, 256))
    phase = np.sin(x) * np.cos(y)
    
    # Add noise
    phase += np.random.randn(256, 256) * 0.1
    
    ifg_file = Path(temp_dir) / "interferogram.tif"
    
    with rasterio.open(
        ifg_file,
        'w',
        driver='GTiff',
        height=256,
        width=256,
        count=1,
        dtype=rasterio.float32,
        transform=Affine.identity(),
        crs='EPSG:4326'
    ) as dst:
        dst.write(phase.astype(np.float32), 1)
    
    return str(ifg_file)


class TestAtmosphericCorrection:
    """Test atmospheric correction methods"""

    def test_initialization(self, synthetic_dem, synthetic_interferogram):
        """Test initialization"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        
        assert corrector.dem_data is not None
        assert corrector.ifg_data is not None
        assert corrector.dem_data.shape == (256, 256)
        assert corrector.ifg_data.shape == (256, 256)

    def test_dem_correlation_aps(self, synthetic_dem, synthetic_interferogram):
        """Test DEM correlation APS estimation"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        aps = corrector.estimate_aps_dem_correlation()
        
        assert aps is not None
        assert aps.shape == (256, 256)
        assert not np.all(np.isnan(aps))
        assert np.abs(np.nanmean(aps)) < 1.0  # Should be relatively small

    def test_high_pass_filter_aps(self, synthetic_dem, synthetic_interferogram):
        """Test high-pass filter APS estimation"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        aps = corrector.estimate_aps_high_pass_filter(wavelength=1000)
        
        assert aps is not None
        assert aps.shape == (256, 256)
        assert not np.all(np.isnan(aps))

    def test_height_dependent_aps(self, synthetic_dem, synthetic_interferogram):
        """Test height-dependent APS estimation"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        aps = corrector.estimate_aps_height_dependent(scale_factor=0.0001)
        
        assert aps is not None
        assert aps.shape == (256, 256)
        assert not np.all(np.isnan(aps))
        
        # APS should correlate with elevation
        dem_norm = (corrector.dem_data - np.nanmean(corrector.dem_data)) / np.nanstd(corrector.dem_data)
        correlation = np.corrcoef(aps.flatten(), dem_norm.flatten())[0, 1]
        assert correlation < 0  # Negative correlation (higher elevation = lower APS)

    def test_spatial_correlation_aps(self, synthetic_dem, synthetic_interferogram):
        """Test spatial correlation APS estimation"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        aps = corrector.estimate_aps_spatial_correlation(window_size=64)
        
        assert aps is not None
        assert aps.shape == (256, 256)

    def test_linear_height_correction(self, synthetic_dem, synthetic_interferogram):
        """Test linear height correction"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        
        # Create synthetic phase
        phase = np.angle(np.exp(1j * (corrector.dem_data * 0.001 + np.random.randn(256, 256) * 0.1)))
        
        phase_corrected = corrector.linear_height_correction(phase)
        
        assert phase_corrected is not None
        assert phase_corrected.shape == phase.shape
        # Corrected phase should have lower correlation with DEM
        dem_norm = (corrector.dem_data - np.nanmean(corrector.dem_data)) / np.nanstd(corrector.dem_data)
        
        corr_original = np.corrcoef(phase.flatten(), dem_norm.flatten())[0, 1]
        corr_corrected = np.corrcoef(phase_corrected.flatten(), dem_norm.flatten())[0, 1]
        
        assert np.abs(corr_corrected) < np.abs(corr_original)

    def test_nonlinear_height_correction(self, synthetic_dem, synthetic_interferogram):
        """Test polynomial height correction"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        
        # Create synthetic phase with polynomial trend
        phase = (corrector.dem_data * 0.001 + (corrector.dem_data ** 2) * 1e-6 + 
                 np.random.randn(256, 256) * 0.1)
        
        phase_corrected = corrector.nonlinear_height_correction(phase, order=2)
        
        assert phase_corrected is not None
        assert phase_corrected.shape == phase.shape
        assert np.nanstd(phase_corrected) < np.nanstd(phase)

    def test_water_vapor_correction(self, synthetic_dem, synthetic_interferogram):
        """Test water vapor correction"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        pwd = corrector.water_vapor_correction()
        
        assert pwd is not None
        assert pwd.shape == (256, 256)
        assert not np.all(np.isnan(pwd))

    def test_tropospheric_delay_correction(self, synthetic_dem, synthetic_interferogram):
        """Test tropospheric delay correction"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        ztd = corrector.tropospheric_delay_correction(temperature=15.0, pressure=1013.25)
        
        assert ztd is not None
        assert ztd.shape == (256, 256)
        assert not np.all(np.isnan(ztd))

    def test_apply_correction(self, synthetic_dem, synthetic_interferogram, temp_dir):
        """Test correction application"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        
        phase = np.angle(np.exp(1j * corrector.ifg_data))
        aps = corrector.estimate_aps_dem_correlation()
        
        output_file = Path(temp_dir) / "corrected_phase.tif"
        result = corrector.apply_correction(phase, aps, str(output_file))
        
        assert result["status"] == "completed"
        assert "statistics" in result
        assert output_file.exists()

    def test_evaluate_correction(self, synthetic_dem, synthetic_interferogram):
        """Test correction evaluation"""
        corrector = AtmosphericCorrection(synthetic_dem, synthetic_interferogram)
        
        phase_original = np.angle(np.exp(1j * corrector.ifg_data))
        aps = corrector.estimate_aps_dem_correlation()
        phase_corrected = phase_original - aps
        
        metrics = corrector.evaluate_correction(phase_original, phase_corrected)
        
        assert "original_std" in metrics
        assert "corrected_std" in metrics
        assert "std_reduction" in metrics
        assert metrics["std_reduction"] >= 0  # Correction should reduce std


class TestAtmosphericCorrectionPipeline:
    """Test complete correction pipeline"""

    def test_pipeline_initialization(self, synthetic_dem, synthetic_interferogram, temp_dir):
        """Test pipeline initialization"""
        pipeline = AtmosphericCorrectionPipeline(
            synthetic_dem,
            synthetic_interferogram,
            temp_dir
        )
        
        assert pipeline.dem_file == synthetic_dem
        assert pipeline.interferogram_file == synthetic_interferogram
        assert pipeline.output_dir.exists()

    def test_full_correction_pipeline(self, synthetic_dem, synthetic_interferogram, temp_dir):
        """Test full correction pipeline"""
        pipeline = AtmosphericCorrectionPipeline(
            synthetic_dem,
            synthetic_interferogram,
            temp_dir
        )
        
        result = pipeline.run_full_correction()
        
        assert result["status"] == "completed"
        assert "results" in result
        assert "corrections" in result["results"]
        
        # Check that all correction methods were applied
        corrections = result["results"]["corrections"]
        assert "dem_correlation" in corrections
        assert "high_pass_filter" in corrections
        assert "height_dependent" in corrections
        assert "combined" in corrections

    def test_correction_output_files(self, synthetic_dem, synthetic_interferogram, temp_dir):
        """Test that correction output files are created"""
        pipeline = AtmosphericCorrectionPipeline(
            synthetic_dem,
            synthetic_interferogram,
            temp_dir
        )
        
        result = pipeline.run_full_correction()
        
        # Check that output files exist
        output_dir = Path(temp_dir)
        assert (output_dir / "phase_corrected_dem.tif").exists()
        assert (output_dir / "phase_corrected_hp.tif").exists()
        assert (output_dir / "phase_corrected_height.tif").exists()
        assert (output_dir / "phase_corrected_combined.tif").exists()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
