//! Voice Capture Module
//! 
//! Handles audio recording and ingestion from microphone input.

use anyhow::{Context, Result};
use hound::{WavSpec, WavWriter};
use tracing::{info, debug, error};
use std::path::Path;

use crate::voice_print::VoicePrint;

/// Audio recording configuration
pub struct RecordingConfig {
    /// Sample rate in Hz
    pub sample_rate: u32,
    /// Number of channels (1 = mono, 2 = stereo)
    pub channels: u16,
    /// Bits per sample
    pub bits_per_sample: u16,
    /// Recording duration in seconds
    pub duration_secs: u32,
}

impl Default for RecordingConfig {
    fn default() -> Self {
        Self {
            sample_rate: 44100,      // CD quality
            channels: 1,             // Mono for voice analysis
            bits_per_sample: 16,     // 16-bit PCM
            duration_secs: 5,        // 5 seconds default
        }
    }
}

/// Record voice from microphone and return as samples
/// 
/// # Arguments
/// * `duration_secs` - Recording duration in seconds
/// 
/// # Returns
/// * `Vec<f32>` - Normalized audio samples (-1.0 to 1.0)
pub fn record_voice(duration_secs: u32) -> Result<Vec<f32>> {
    info!("Starting voice recording for {} seconds", duration_secs);
    
    // Initialize audio capture device
    let device = cpal::default_input_device()
        .context("No input device available")?;
    
    debug!("Using audio device: {}", device.name().unwrap_or_else(|_| "unknown".to_string()));
    
    // Get default input config
    let config = device.default_input_config()
        .context("Failed to get default input config")?;
    
    info!("Audio config: {} Hz, {} channels", config.sample_rate().0, config.channels());
    
    // Buffer for samples
    let mut samples = Vec::new();
    let expected_samples = (config.sample_rate().0 * duration_secs) as usize;
    samples.reserve(expected_samples);
    
    // Create callback to capture samples
    let error_callback = |err| {
        error!("Audio stream error: {}", err);
    };
    
    // Build input stream
    let stream = match config.sample_format() {
        cpal::SampleFormat::F32 => {
            let stream = device.build_input_stream(
                &config.into(),
                |data: &[f32], _: &cpal::InputCallbackInfo| {
                    samples.extend_from_slice(data);
                },
                error_callback,
                None,
            )?;
            stream
        }
        cpal::SampleFormat::I16 => {
            let stream = device.build_input_stream(
                &config.into(),
                |data: &[i16], _: &cpal::InputCallbackInfo| {
                    // Convert i16 to f32 (-1.0 to 1.0)
                    for &sample in data {
                        samples.push(sample as f32 / i16::MAX as f32);
                    }
                },
                error_callback,
                None,
            )?;
            stream
        }
        cpal::SampleFormat::U16 => {
            let stream = device.build_input_stream(
                &config.into(),
                |data: &[u16], _: &cpal::InputCallbackInfo| {
                    // Convert u16 to f32 (-1.0 to 1.0)
                    for &sample in data {
                        samples.push((sample as i16) as f32 / i16::MAX as f32);
                    }
                },
                error_callback,
                None,
            )?;
            stream
        }
        _ => anyhow::bail!("Unsupported sample format"),
    };
    
    // Play stream
    stream.play()?;
    info!("Recording started");
    
    // Wait for duration
    std::thread::sleep(std::time::Duration::from_secs(duration_secs as u64));
    
    // Stop stream
    stream.pause()?;
    drop(stream);
    
    info!("Recording complete: {} samples captured", samples.len());
    
    Ok(samples)
}

/// Record voice and save to WAV file
/// 
/// # Arguments
/// * `output_path` - Path to save WAV file
/// * `duration_secs` - Recording duration
/// 
/// # Returns
/// * Path to saved WAV file
pub fn record_to_wav(output_path: &str, duration_secs: u32) -> Result<String> {
    info!("Recording voice to WAV: {}", output_path);
    
    // Record samples
    let samples = record_voice(duration_secs)?;
    
    // Write WAV file
    let spec = WavSpec {
        channels: 1,
        sample_rate: 44100,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    
    let mut writer = WavWriter::create(output_path, spec)?;
    
    for sample in samples {
        writer.write_sample((sample * i16::MAX as f32) as i16)?;
    }
    
    writer.finalize()?;
    
    info!("WAV file saved: {}", output_path);
    Ok(output_path.to_string())
}

/// Record voice print for enrollment
/// 
/// # Arguments
/// * `user_id` - User identifier
/// 
/// # Returns
/// * `VoicePrint` - Generated voice print
pub fn record_voice_print(user_id: &str) -> Result<VoicePrint> {
    println!("🎤 Recording voice print for user: {}", user_id);
    println!("   Please speak clearly for 5 seconds...");
    println!("   Recording starts in 3 seconds...");
    
    // Countdown
    for i in (1..=3).rev() {
        println!("   {}", i);
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
    
    println!("   Recording now...");
    
    // Record voice
    let samples = record_voice(5)?;
    
    println!("   ✓ Recording complete");
    
    // Extract features and create voice print
    crate::voice_features::extract_voice_print(&samples, user_id)
}

/// Load audio from file
/// 
/// # Arguments
/// * `path` - Path to audio file (WAV supported)
/// 
/// # Returns
/// * `Vec<f32>` - Normalized audio samples
pub fn load_audio_file(path: &str) -> Result<Vec<f32>> {
    info!("Loading audio file: {}", path);
    
    let path = Path::new(path);
    
    if !path.exists() {
        anyhow::bail!("Audio file not found: {}", path.display());
    }
    
    let mut reader = hound::WavReader::open(path)
        .context("Failed to open WAV file")?;
    
    let spec = reader.spec();
    debug!("Audio spec: {} Hz, {} channels, {} bits", 
           spec.sample_rate, spec.channels, spec.bits_per_sample);
    
    let mut samples = Vec::new();
    
    match spec.sample_format {
        hound::SampleFormat::Int => {
            for sample in reader::<i16>().flatten() {
                samples.push(sample as f32 / i16::MAX as f32);
            }
        }
        hound::SampleFormat::Float => {
            for sample in reader::<f32>().flatten() {
                samples.push(sample);
            }
        }
    }
    
    info!("Loaded {} samples from {}", samples.len(), path.display());
    Ok(samples)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_default_config() {
        let config = RecordingConfig::default();
        assert_eq!(config.sample_rate, 44100);
        assert_eq!(config.channels, 1);
        assert_eq!(config.bits_per_sample, 16);
        assert_eq!(config.duration_secs, 5);
    }
}
