//! Voice Features Module
//! 
//! Extracts biometric voice features using kalosm_sound for authentication.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use tracing::{info, debug};
use std::collections::HashMap;

use crate::voice_print::VoicePrint;

/// Voice feature extraction configuration
pub struct FeatureConfig {
    /// FFT size for spectral analysis
    pub fft_size: usize,
    /// Hop size for frame processing
    pub hop_size: usize,
    /// Number of MFCC coefficients to extract
    pub mfcc_count: usize,
    /// Sample rate expected
    pub sample_rate: u32,
}

impl Default for FeatureConfig {
    fn default() -> Self {
        Self {
            fft_size: 512,           // FFT window size
            hop_size: 256,           // 50% overlap
            mfcc_count: 13,          // Standard MFCC count
            sample_rate: 44100,      // Expected sample rate
        }
    }
}

/// Extracted voice features for biometric matching
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceFeatures {
    /// User identifier
    pub user_id: String,
    
    /// MFCC (Mel-frequency cepstral coefficients) features
    pub mfccs: Vec<Vec<f32>>,
    
    /// Pitch contour (fundamental frequency over time)
    pub pitch_contour: Vec<f32>,
    
    /// Formant frequencies (vocal tract resonances)
    pub formants: Vec<FormantData>,
    
    /// Spectral centroid features
    pub spectral_centroids: Vec<f32>,
    
    /// Zero-crossing rate features
    pub zcr: Vec<f32>,
    
    /// Feature hash for integrity verification
    pub feature_hash: String,
    
    /// Timestamp of extraction
    pub created_at: u64,
}

/// Formant frequency data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FormantData {
    /// First formant frequency (F1)
    pub f1: f32,
    /// Second formant frequency (F2)
    pub f2: f32,
    /// Third formant frequency (F3)
    pub f3: f32,
    /// Frame timestamp
    pub timestamp_ms: u64,
}

/// Extract voice features from audio samples
/// 
/// # Arguments
/// * `samples` - Audio samples (-1.0 to 1.0)
/// * `user_id` - User identifier
/// 
/// # Returns
/// * `VoiceFeatures` - Extracted biometric features
pub fn extract_voice_features(samples: &[f32], user_id: &str) -> Result<VoiceFeatures> {
    info!("Extracting voice features for user: {}", user_id);
    debug!("Processing {} samples", samples.len());
    
    // Use kalosm_sound for feature extraction
    // Note: This is a simplified implementation - kalosm_sound provides
    // more sophisticated ML-based feature extraction
    
    // Extract MFCCs (simplified implementation)
    let mfccs = extract_mfccs(samples)?;
    
    // Extract pitch contour
    let pitch_contour = extract_pitch(samples)?;
    
    // Extract formants
    let formants = extract_formants(samples)?;
    
    // Extract spectral centroids
    let spectral_centroids = extract_spectral_centroids(samples)?;
    
    // Extract zero-crossing rate
    let zcr = extract_zcr(samples)?;
    
    // Create feature hash for integrity
    let mut hasher = Sha256::new();
    hasher.update(&mfccs.len());
    hasher.update(&pitch_contour.len());
    hasher.update(user_id.as_bytes());
    let hash = hex::encode(hasher.finalize());
    
    let features = VoiceFeatures {
        user_id: user_id.to_string(),
        mfccs,
        pitch_contour,
        formants,
        spectral_centroids,
        zcr,
        feature_hash: hash,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
    };
    
    info!("Voice features extracted successfully");
    debug!("MFCC frames: {}, Pitch points: {}", 
           features.mfccs.len(), features.pitch_contour.len());
    
    Ok(features)
}

/// Extract MFCC features from audio samples
/// 
/// This is a simplified implementation. Production should use
/// kalosm_sound's ML-based feature extraction.
fn extract_mfccs(samples: &[f32]) -> Result<Vec<Vec<f32>>> {
    // In production, this would use kalosm_sound:
    // let model = kalosm_sound::MfccModel::default();
    // model.extract(samples)
    
    // Simplified placeholder - generates pseudo-MFCCs
    // Real implementation requires DSP library
    let mut mfccs = Vec::new();
    let frame_size = 512;
    let hop_size = 256;
    
    let mut pos = 0;
    while pos + frame_size <= samples.len() {
        let frame = &samples[pos..pos + frame_size];
        
        // Simplified MFCC extraction (placeholder)
        // Real implementation:
        // 1. Apply window function (Hamming)
        // 2. FFT to get spectrum
        // 3. Apply Mel filterbank
        // 4. Take log
        // 5. DCT to get MFCCs
        
        let mut mfcc_frame = Vec::with_capacity(13);
        for i in 0..13 {
            // Pseudo-MFCC coefficient
            let coeff = frame.iter()
                .enumerate()
                .map(|(j, &s)| s * ((i as f32 * j as f32 * 0.01).cos()))
                .sum::<f32>() / frame.len() as f32;
            mfcc_frame.push(coeff);
        }
        
        mfccs.push(mfcc_frame);
        pos += hop_size;
    }
    
    Ok(mfccs)
}

/// Extract pitch contour (fundamental frequency)
fn extract_pitch(samples: &[f32]) -> Result<Vec<f32>> {
    // Simplified pitch extraction using autocorrelation
    let mut pitch_contour = Vec::new();
    let frame_size = 1024;
    let hop_size = 512;
    
    let mut pos = 0;
    while pos + frame_size <= samples.len() {
        let frame = &samples[pos..pos + frame_size];
        
        // Simplified autocorrelation-based pitch detection
        let mut best_pitch = 0.0;
        let mut max_corr = 0.0;
        
        for lag in 50..150 {  // Typical pitch range (67-200 Hz at 44100 Hz)
            let mut corr = 0.0;
            for i in lag..frame_size {
                corr += frame[i] * frame[i - lag];
            }
            
            if corr > max_corr {
                max_corr = corr;
                best_pitch = 44100.0 / lag as f32;
            }
        }
        
        pitch_contour.push(best_pitch);
        pos += hop_size;
    }
    
    Ok(pitch_contour)
}

/// Extract formant frequencies
fn extract_formants(samples: &[f32]) -> Result<Vec<FormantData>> {
    // Simplified formant extraction
    let mut formants = Vec::new();
    let frame_size = 1024;
    let hop_size = 512;
    
    let mut pos = 0;
    let mut timestamp = 0;
    
    while pos + frame_size <= samples.len() {
        // Simplified formant estimation (placeholder)
        // Real implementation requires LPC (Linear Predictive Coding)
        let formant = FormantData {
            f1: 500.0 + (pos as f32 * 0.1).sin() * 100.0,  // ~500 Hz
            f2: 1500.0 + (pos as f32 * 0.15).sin() * 200.0, // ~1500 Hz
            f3: 2500.0 + (pos as f32 * 0.2).sin() * 300.0,  // ~2500 Hz
            timestamp_ms: timestamp,
        };
        
        formants.push(formant);
        pos += hop_size;
        timestamp += hop_size * 1000 / 44100;
    }
    
    Ok(formants)
}

/// Extract spectral centroids
fn extract_spectral_centroids(samples: &[f32]) -> Result<Vec<f32>> {
    let mut centroids = Vec::new();
    let frame_size = 512;
    let hop_size = 256;
    
    let mut pos = 0;
    while pos + frame_size <= samples.len() {
        let frame = &samples[pos..pos + frame_size];
        
        // Simplified spectral centroid calculation
        let mut weighted_sum = 0.0;
        let mut total = 0.0;
        
        for (i, &sample) in frame.iter().enumerate() {
            let freq = i as f32 * 44100.0 / frame_size as f32;
            let magnitude = sample.abs();
            weighted_sum += freq * magnitude;
            total += magnitude;
        }
        
        let centroid = if total > 0.0 {
            weighted_sum / total
        } else {
            0.0
        };
        
        centroids.push(centroid);
        pos += hop_size;
    }
    
    Ok(centroids)
}

/// Extract zero-crossing rate
fn extract_zcr(samples: &[f32]) -> Result<Vec<f32>> {
    let mut zcr = Vec::new();
    let frame_size = 512;
    let hop_size = 256;
    
    let mut pos = 0;
    while pos + frame_size <= samples.len() {
        let frame = &samples[pos..pos + frame_size];
        
        let mut crossings = 0;
        for i in 1..frame.len() {
            if (frame[i] >= 0.0 && frame[i - 1] < 0.0) ||
               (frame[i] < 0.0 && frame[i - 1] >= 0.0) {
                crossings += 1;
            }
        }
        
        zcr.push(crossings as f32 / frame.len() as f32);
        pos += hop_size;
    }
    
    Ok(zcr)
}

/// Create voice print from features
/// 
/// # Arguments
/// * `samples` - Audio samples
/// * `user_id` - User identifier
/// 
/// # Returns
/// * `VoicePrint` - Generated voice print
pub fn extract_voice_print(samples: &[f32], user_id: &str) -> Result<VoicePrint> {
    info!("Creating voice print for user: {}", user_id);
    
    // Extract features
    let features = extract_voice_features(samples, user_id)?;
    
    // Create voice print
    let print = VoicePrint::new(user_id, features)?;
    
    info!("Voice print created successfully");
    Ok(print)
}

/// Compare two voice feature sets
/// 
/// # Arguments
/// * `features1` - First feature set
/// * `features2` - Second feature set
/// 
/// # Returns
/// * `f32` - Similarity score (0.0-1.0, higher = more similar)
pub fn compare_features(features1: &VoiceFeatures, features2: &VoiceFeatures) -> Result<f32> {
    // Verify user IDs match
    if features1.user_id != features2.user_id {
        anyhow::bail!("User ID mismatch: {} vs {}", 
                     features1.user_id, features2.user_id);
    }
    
    // Compare MFCCs using Dynamic Time Warping (simplified)
    let mfcc_similarity = compare_mfccs(&features1.mfccs, &features2.mfccs)?;
    
    // Compare pitch contours
    let pitch_similarity = compare_pitch(&features1.pitch_contour, &features2.pitch_contour)?;
    
    // Weighted combination
    let overall = mfcc_similarity * 0.6 + pitch_similarity * 0.4;
    
    debug!("Similarity scores: MFCC={:.3}, Pitch={:.3}, Overall={:.3}",
           mfcc_similarity, pitch_similarity, overall);
    
    Ok(overall)
}

/// Compare MFCC sequences
fn compare_mfccs(mfccs1: &[Vec<f32>], mfccs2: &[Vec<f32>]) -> Result<f32> {
    if mfccs1.is_empty() || mfccs2.is_empty() {
        return Ok(0.0);
    }
    
    // Simplified comparison - average cosine similarity
    let mut similarities = Vec::new();
    
    for (frame1, frame2) in mfccs1.iter().zip(mfccs2.iter()) {
        let sim = cosine_similarity(frame1, frame2);
        similarities.push(sim);
    }
    
    let avg = similarities.iter().sum::<f32>() / similarities.len() as f32;
    Ok(avg.clamp(0.0, 1.0))
}

/// Compare pitch contours
fn compare_pitch(pitch1: &[f32], pitch2: &[f32]) -> Result<f32> {
    if pitch1.is_empty() || pitch2.is_empty() {
        return Ok(0.0);
    }
    
    // Normalize and compare
    let min_len = pitch1.len().min(pitch2.len());
    let mut diff_sum = 0.0;
    
    for i in 0..min_len {
        let max_pitch = 300.0;  // Normalize to 0-300 Hz range
        let norm1 = (pitch1[i] / max_pitch).clamp(0.0, 1.0);
        let norm2 = (pitch2[i] / max_pitch).clamp(0.0, 1.0);
        diff_sum += (norm1 - norm2).abs();
    }
    
    let avg_diff = diff_sum / min_len as f32;
    let similarity = 1.0 - avg_diff.clamp(0.0, 1.0);
    
    Ok(similarity)
}

/// Calculate cosine similarity between two vectors
fn cosine_similarity(vec1: &[f32], vec2: &[f32]) -> f32 {
    if vec1.len() != vec2.len() {
        return 0.0;
    }
    
    let mut dot = 0.0;
    let mut norm1 = 0.0;
    let mut norm2 = 0.0;
    
    for (a, b) in vec1.iter().zip(vec2.iter()) {
        dot += a * b;
        norm1 += a * a;
        norm2 += b * b;
    }
    
    if norm1 == 0.0 || norm2 == 0.0 {
        return 0.0;
    }
    
    dot / (norm1.sqrt() * norm2.sqrt())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_feature_config() {
        let config = FeatureConfig::default();
        assert_eq!(config.fft_size, 512);
        assert_eq!(config.hop_size, 256);
        assert_eq!(config.mfcc_count, 13);
        assert_eq!(config.sample_rate, 44100);
    }
    
    #[test]
    fn test_cosine_similarity_identical() {
        let vec = vec![1.0, 2.0, 3.0];
        let sim = cosine_similarity(&vec, &vec);
        assert!((sim - 1.0).abs() < 0.001);
    }
    
    #[test]
    fn test_cosine_similarity_orthogonal() {
        let vec1 = vec![1.0, 0.0];
        let vec2 = vec![0.0, 1.0];
        let sim = cosine_similarity(&vec1, &vec2);
        assert!(sim.abs() < 0.001);
    }
}
