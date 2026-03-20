//! Authentication Module
//! 
//! Handles voice authentication logic comparing live voice to stored prints.

use anyhow::{Context, Result};
use tracing::{info, debug, warn, error};
use argon2::{Argon2, PasswordHash, PasswordVerifier};
use std::path::Path;

use crate::voice_capture::{record_voice, load_audio_file};
use crate::voice_features::{extract_voice_features, compare_features, VoiceFeatures};
use crate::voice_print::{VoicePrint, VoicePrintStore};

/// Authentication result
#[derive(Debug, Clone)]
pub struct AuthResult {
    /// Authentication success
    pub success: bool,
    /// Confidence score (0.0-1.0)
    pub confidence: f32,
    /// User identifier
    pub user_id: String,
    /// Error message if failed
    pub error: Option<String>,
    /// Timestamp of authentication attempt
    pub timestamp: u64,
}

impl AuthResult {
    /// Create successful auth result
    pub fn success(user_id: &str, confidence: f32) -> Self {
        Self {
            success: true,
            confidence,
            user_id: user_id.to_string(),
            error: None,
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }
    
    /// Create failed auth result
    pub fn failure(user_id: &str, error: &str) -> Self {
        Self {
            success: false,
            confidence: 0.0,
            user_id: user_id.to_string(),
            error: Some(error.to_string()),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        }
    }
}

/// Voice authentication configuration
#[derive(Debug, Clone)]
pub struct AuthConfig {
    /// Minimum confidence threshold for authentication
    pub threshold: f32,
    /// Maximum authentication attempts before lockout
    pub max_attempts: u32,
    /// Lockout duration in seconds
    pub lockout_duration_secs: u64,
    /// Require liveness detection
    pub liveness_check: bool,
    /// Audio quality minimum (SNR)
    pub min_snr: f32,
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self {
            threshold: 0.75,           // 75% confidence required
            max_attempts: 3,           // 3 attempts before lockout
            lockout_duration_secs: 300, // 5 minute lockout
            liveness_check: true,      // Enable liveness detection
            min_snr: 20.0,             // Minimum 20dB SNR
        }
    }
}

/// Voice authenticator
pub struct Authenticator {
    /// Stored voice print for comparison
    stored_print: VoicePrint,
    /// Authentication configuration
    config: AuthConfig,
    /// Failed attempt counter
    failed_attempts: u32,
    /// Last failed attempt timestamp
    last_failure: Option<u64>,
}

impl Authenticator {
    /// Create new authenticator with stored voice print
    /// 
    /// # Arguments
    /// * `stored_print` - Voice print to authenticate against
    pub fn new(stored_print: VoicePrint) -> Self {
        Self {
            stored_print,
            config: AuthConfig::default(),
            failed_attempts: 0,
            last_failure: None,
        }
    }
    
    /// Create authenticator with custom config
    /// 
    /// # Arguments
    /// * `stored_print` - Voice print to authenticate against
    /// * `config` - Authentication configuration
    pub fn with_config(stored_print: VoicePrint, config: AuthConfig) -> Self {
        Self {
            stored_print,
            config,
            failed_attempts: 0,
            last_failure: None,
        }
    }
    
    /// Authenticate using live voice recording
    /// 
    /// # Arguments
    /// * `user_id` - User identifier to verify
    /// 
    /// # Returns
    /// * `true` if authentication successful
    pub fn authenticate_live(&mut self, user_id: &str) -> Result<bool> {
        info!("Starting live authentication for user: {}", user_id);
        
        // Check lockout status
        if self.is_locked_out() {
            warn!("Authentication locked out for user: {}", user_id);
            return Ok(false);
        }
        
        // Verify user ID matches stored print
        if user_id != self.stored_print.user_id {
            error!("User ID mismatch: {} vs {}", user_id, self.stored_print.user_id);
            self.record_failure();
            return Ok(false);
        }
        
        // Record live voice
        println!("🎤 Please speak for authentication...");
        println!("   Recording starts in 3 seconds...");
        
        for i in (1..=3).rev() {
            println!("   {}", i);
            std::thread::sleep(std::time::Duration::from_secs(1));
        }
        
        println!("   Recording now...");
        
        let samples = record_voice(5)?;
        
        println!("   ✓ Recording complete");
        println!("   Analyzing voice...");
        
        // Extract features from live voice
        let live_features = extract_voice_features(&samples, user_id)?;
        
        // Compare with stored print
        let confidence = compare_features(&live_features, &self.stored_print.features)?;
        
        debug!("Authentication confidence: {:.3}", confidence);
        
        // Check against threshold
        if confidence >= self.config.threshold {
            info!("Authentication successful for {} (confidence: {:.3})", 
                  user_id, confidence);
            println!("   ✓ Match found!");
            self.reset_failures();
            Ok(true)
        } else {
            warn!("Authentication failed for {} (confidence: {:.3})", 
                  user_id, confidence);
            println!("   ✗ No match");
            self.record_failure();
            Ok(false)
        }
    }
    
    /// Verify audio file against stored print
    /// 
    /// # Arguments
    /// * `audio_path` - Path to audio file
    /// * `threshold` - Confidence threshold override
    /// 
    /// # Returns
    /// * `true` if verification successful
    pub fn verify_audio_file(&self, audio_path: &str, threshold: f32) -> Result<bool> {
        info!("Verifying audio file: {}", audio_path);
        
        // Load audio file
        let samples = load_audio_file(audio_path)?;
        
        // Extract features
        let live_features = extract_voice_features(&samples, &self.stored_print.user_id)?;
        
        // Compare
        let confidence = compare_features(&live_features, &self.stored_print.features)?;
        
        debug!("Verification confidence: {:.3} (threshold: {:.3})", 
               confidence, threshold);
        
        Ok(confidence >= threshold)
    }
    
    /// Get authentication result details
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    /// 
    /// # Returns
    /// * `AuthResult` - Detailed authentication result
    pub fn authenticate_detailed(&mut self, user_id: &str) -> Result<AuthResult> {
        // Check lockout
        if self.is_locked_out() {
            return Ok(AuthResult::failure(user_id, "Account locked due to too many failed attempts"));
        }
        
        // Verify user ID
        if user_id != self.stored_print.user_id {
            self.record_failure();
            return Ok(AuthResult::failure(user_id, "User ID mismatch"));
        }
        
        // Record and analyze
        let samples = match record_voice(5) {
            Ok(s) => s,
            Err(e) => {
                error!("Failed to record voice: {}", e);
                self.record_failure();
                return Ok(AuthResult::failure(user_id, &format!("Recording failed: {}", e)));
            }
        };
        
        // Extract features
        let live_features = match extract_voice_features(&samples, user_id) {
            Ok(f) => f,
            Err(e) => {
                error!("Failed to extract features: {}", e);
                self.record_failure();
                return Ok(AuthResult::failure(user_id, &format!("Feature extraction failed: {}", e)));
            }
        };
        
        // Compare
        let confidence = match compare_features(&live_features, &self.stored_print.features) {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to compare features: {}", e);
                self.record_failure();
                return Ok(AuthResult::failure(user_id, &format!("Comparison failed: {}", e)));
            }
        };
        
        if confidence >= self.config.threshold {
            self.reset_failures();
            Ok(AuthResult::success(user_id, confidence))
        } else {
            self.record_failure();
            Ok(AuthResult::failure(user_id, 
                &format!("Confidence {:.3} below threshold {:.3}", confidence, self.config.threshold)))
        }
    }
    
    /// Check if account is locked out
    fn is_locked_out(&self) -> bool {
        if self.failed_attempts >= self.config.max_attempts {
            if let Some(last_failure) = self.last_failure {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                
                if now - last_failure < self.config.lockout_duration_secs {
                    return true;
                }
            }
        }
        false
    }
    
    /// Record failed authentication attempt
    fn record_failure(&mut self) {
        self.failed_attempts += 1;
        self.last_failure = Some(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        );
        
        warn!("Failed authentication attempt #{}", self.failed_attempts);
    }
    
    /// Reset failure counter
    fn reset_failures(&mut self) {
        self.failed_attempts = 0;
        self.last_failure = None;
        debug!("Failure counter reset");
    }
    
    /// Get current failure count
    pub fn failure_count(&self) -> u32 {
        self.failed_attempts
    }
    
    /// Update authentication threshold
    pub fn set_threshold(&mut self, threshold: f32) {
        self.config.threshold = threshold.clamp(0.0, 1.0);
        info!("Authentication threshold updated to: {:.2}", self.config.threshold);
    }
    
    /// Get stored voice print info
    pub fn print_info(&self) -> crate::voice_print::VoicePrintInfo {
        self.stored_print.info()
    }
}

/// Batch authenticator for multiple users
pub struct BatchAuthenticator {
    /// Voice print store
    store: VoicePrintStore,
    /// Default config
    config: AuthConfig,
}

impl BatchAuthenticator {
    /// Create new batch authenticator
    /// 
    /// # Arguments
    /// * `store_dir` - Directory containing voice prints
    pub fn new(store_dir: &str) -> Result<Self> {
        let store = VoicePrintStore::new(store_dir)?;
        
        Ok(Self {
            store,
            config: AuthConfig::default(),
        })
    }
    
    /// Authenticate user from store
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    /// 
    /// # Returns
    /// * `AuthResult` - Authentication result
    pub fn authenticate(&self, user_id: &str) -> Result<AuthResult> {
        info!("Batch authentication for user: {}", user_id);
        
        // Check if voice print exists
        if !self.store.exists(user_id) {
            return Ok(AuthResult::failure(user_id, "Voice print not found"));
        }
        
        // Load voice print
        let print = self.store.load(user_id)?;
        
        // Create authenticator
        let mut auth = Authenticator::new(print);
        auth.authenticate_detailed(user_id)
    }
    
    /// List all enrolled users
    pub fn list_users(&self) -> Result<Vec<String>> {
        self.store.list()
    }
    
    /// Enroll new user
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    /// 
    /// # Returns
    /// * `true` if enrollment successful
    pub fn enroll(&self, user_id: &str) -> Result<bool> {
        info!("Enrolling new user: {}", user_id);
        
        // Record voice print
        let print = crate::voice_capture::record_voice_print(user_id)?;
        
        // Store
        self.store.store(user_id, &print)?;
        
        info!("User enrolled successfully: {}", user_id);
        Ok(true)
    }
    
    /// Delete user from store
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    pub fn delete_user(&self, user_id: &str) -> Result<()> {
        self.store.delete(user_id)
    }
}

/// Liveness detection (simplified implementation)
/// 
/// In production, this would use ML models to detect:
/// - Natural speech patterns vs recorded playback
/// - Microphone characteristics
/// - Environmental acoustics
pub mod liveness {
    use anyhow::Result;
    use crate::voice_features::VoiceFeatures;
    
    /// Check if voice sample appears to be live (not recorded)
    /// 
    /// # Arguments
    /// * `features` - Voice features to analyze
    /// 
    /// # Returns
    /// * `true` if liveness detected
    pub fn detect_liveness(features: &VoiceFeatures) -> Result<bool> {
        // Simplified liveness detection
        // Production would use:
        // - Challenge-response (random phrases)
        // - Spectral analysis for playback detection
        // - Microphone impulse response analysis
        
        // Placeholder: check for natural pitch variation
        let pitch_variance = calculate_variance(&features.pitch_contour);
        
        // Live speech typically has more pitch variation
        let is_live = pitch_variance > 100.0;  // Threshold heuristic
        
        Ok(is_live)
    }
    
    /// Calculate variance of pitch contour
    fn calculate_variance(pitches: &[f32]) -> f32 {
        if pitches.is_empty() {
            return 0.0;
        }
        
        let mean = pitches.iter().sum::<f32>() / pitches.len() as f32;
        let variance = pitches.iter()
            .map(|p| (p - mean).powi(2))
            .sum::<f32>() / pitches.len() as f32;
        
        variance
    }
    
    /// Challenge-response liveness check
    /// 
    /// Asks user to speak random phrase to prevent replay attacks
    pub fn challenge_phrase() -> &'static str {
        let phrases = [
            "The quick brown fox jumps over the lazy dog",
            "Pack my box with five dozen liquor jugs",
            "How vexingly quick daft zebras jump",
            "Sphinx of black quartz, judge my vow",
            "Two driven jocks help fax my big quiz",
        ];
        
        let idx = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as usize % phrases.len();
        
        phrases[idx]
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice_print::VoicePrint;
    use crate::voice_features::VoiceFeatures;
    
    fn create_test_print() -> VoicePrint {
        let features = VoiceFeatures {
            user_id: "test_user".to_string(),
            mfccs: vec![vec![1.0, 2.0, 3.0]],
            pitch_contour: vec![100.0, 150.0, 200.0],
            formants: vec![],
            spectral_centroids: vec![500.0],
            zcr: vec![0.1],
            feature_hash: "test_hash".to_string(),
            created_at: 1234567890,
        };
        
        VoicePrint::new("test_user", features).unwrap()
    }
    
    #[test]
    fn test_authenticator_creation() {
        let print = create_test_print();
        let auth = Authenticator::new(print);
        
        assert_eq!(auth.failure_count(), 0);
        assert!(!auth.is_locked_out());
    }
    
    #[test]
    fn test_auth_config_default() {
        let config = AuthConfig::default();
        
        assert_eq!(config.threshold, 0.75);
        assert_eq!(config.max_attempts, 3);
        assert_eq!(config.lockout_duration_secs, 300);
        assert!(config.liveness_check);
    }
    
    #[test]
    fn test_auth_result_success() {
        let result = AuthResult::success("test_user", 0.85);
        
        assert!(result.success);
        assert!((result.confidence - 0.85).abs() < 0.001);
        assert_eq!(result.user_id, "test_user");
        assert!(result.error.is_none());
    }
    
    #[test]
    fn test_auth_result_failure() {
        let result = AuthResult::failure("test_user", "Test error");
        
        assert!(!result.success);
        assert!((result.confidence - 0.0).abs() < 0.001);
        assert_eq!(result.user_id, "test_user");
        assert!(result.error.is_some());
    }
}
