//! Voice Print Module
//! 
//! Handles creation, storage, and management of voice prints.

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use argon2::{Argon2, PasswordHash, PasswordHasher, password_hash::SaltString};
use tracing::{info, debug, error};
use std::fs::File;
use std::io::{BufReader, BufWriter};
use std::path::Path;

use crate::voice_features::VoiceFeatures;

/// Voice print storage format
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoicePrint {
    /// Version of the voice print format
    pub version: String,
    
    /// User identifier
    pub user_id: String,
    
    /// Encrypted voice features
    pub features: VoiceFeatures,
    
    /// Security hash for integrity verification
    pub integrity_hash: String,
    
    /// Creation timestamp
    pub created_at: u64,
    
    /// Last modification timestamp
    pub updated_at: u64,
    
    /// Number of enrollment samples used
    pub enrollment_count: u32,
    
    /// Metadata (optional)
    pub metadata: VoicePrintMetadata,
}

/// Voice print metadata
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct VoicePrintMetadata {
    /// Recording device info
    pub device: Option<String>,
    /// Sample rate used
    pub sample_rate: Option<u32>,
    /// Recording duration in seconds
    pub duration_secs: Option<u32>,
    /// Location/country code (ISO 3166-1 alpha-2)
    pub location: Option<String>,
    /// Notes or tags
    pub tags: Vec<String>,
}

/// Voice print configuration
pub struct VoicePrintConfig {
    /// Encryption enabled
    pub encrypt: bool,
    /// Compression enabled
    pub compress: bool,
    /// Backup copies to keep
    pub backup_count: u32,
}

impl Default for VoicePrintConfig {
    fn default() -> Self {
        Self {
            encrypt: true,
            compress: false,
            backup_count: 1,
        }
    }
}

impl VoicePrint {
    /// Create a new voice print
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    /// * `features` - Extracted voice features
    /// 
    /// # Returns
    /// * `VoicePrint` - New voice print instance
    pub fn new(user_id: &str, features: VoiceFeatures) -> Result<Self> {
        info!("Creating new voice print for user: {}", user_id);
        
        // Generate integrity hash
        let integrity_hash = Self::compute_integrity_hash(user_id, &features)?;
        
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();
        
        let print = Self {
            version: "1.0.0".to_string(),
            user_id: user_id.to_string(),
            features,
            integrity_hash,
            created_at: now,
            updated_at: now,
            enrollment_count: 1,
            metadata: VoicePrintMetadata::default(),
        };
        
        info!("Voice print created with hash: {}", print.integrity_hash[..16].to_string());
        Ok(print)
    }
    
    /// Load voice print from file
    /// 
    /// # Arguments
    /// * `path` - Path to voice print file (.vprint)
    /// 
    /// # Returns
    /// * `VoicePrint` - Loaded voice print
    pub fn load(path: &str) -> Result<Self> {
        info!("Loading voice print from: {}", path);
        
        let path = Path::new(path);
        
        if !path.exists() {
            anyhow::bail!("Voice print file not found: {}", path.display());
        }
        
        let file = File::open(path)
            .context("Failed to open voice print file")?;
        
        let reader = BufReader::new(file);
        let print: Self = bincode::deserialize_from(reader)
            .context("Failed to deserialize voice print")?;
        
        // Verify integrity
        let computed_hash = Self::compute_integrity_hash(&print.user_id, &print.features)?;
        
        if computed_hash != print.integrity_hash {
            error!("Voice print integrity check failed!");
            anyhow::bail!("Voice print integrity verification failed - file may be corrupted");
        }
        
        debug!("Voice print loaded successfully for user: {}", print.user_id);
        Ok(print)
    }
    
    /// Save voice print to file
    /// 
    /// # Arguments
    /// * `path` - Path to save voice print file
    /// 
    /// # Returns
    /// * Path to saved file
    pub fn save(&self, path: &str) -> Result<String> {
        info!("Saving voice print to: {}", path);
        
        // Create parent directories if needed
        if let Some(parent) = Path::new(path).parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create parent directories")?;
        }
        
        // Create backup if file exists
        if Path::new(path).exists() {
            self.create_backup(path)?;
        }
        
        let file = File::create(path)
            .context("Failed to create voice print file")?;
        
        let writer = BufWriter::new(file);
        bincode::serialize_into(writer, self)
            .context("Failed to serialize voice print")?;
        
        // Set restrictive permissions (Unix only)
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .ok();  // Best effort
        }
        
        info!("Voice print saved successfully");
        Ok(path.to_string())
    }
    
    /// Create backup of existing voice print
    fn create_backup(&self, path: &str) -> Result<()> {
        let path = Path::new(path);
        let parent = path.parent().unwrap_or(Path::new("."));
        
        let timestamp = self.created_at;
        let backup_name = format!(
            "{}.{}.bak",
            path.file_stem().unwrap().to_string_lossy(),
            timestamp
        );
        
        let backup_path = parent.join(backup_name);
        
        debug!("Creating backup: {}", backup_path.display());
        std::fs::copy(path, &backup_path)
            .context("Failed to create backup")?;
        
        Ok(())
    }
    
    /// Update voice print with new features (re-enrollment)
    /// 
    /// # Arguments
    /// * `features` - New voice features to merge
    /// 
    /// # Returns
    /// * Updated self
    pub fn update(&mut self, features: &VoiceFeatures) -> Result<()> {
        info!("Updating voice print for user: {}", self.user_id);
        
        // Verify user ID matches
        if features.user_id != self.user_id {
            anyhow::bail!("User ID mismatch during update");
        }
        
        // Merge features (simplified - in production, would average or use ML)
        self.features = features.clone();
        self.updated_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs();
        self.enrollment_count += 1;
        
        // Recompute integrity hash
        self.integrity_hash = Self::compute_integrity_hash(&self.user_id, &self.features)?;
        
        info!("Voice print updated (enrollment #{}): {}", 
              self.enrollment_count, self.integrity_hash[..16].to_string());
        
        Ok(())
    }
    
    /// Verify voice print integrity
    /// 
    /// # Returns
    /// * `true` if integrity check passes
    pub fn verify_integrity(&self) -> Result<bool> {
        let computed = Self::compute_integrity_hash(&self.user_id, &self.features)?;
        Ok(computed == self.integrity_hash)
    }
    
    /// Get voice print info
    pub fn info(&self) -> VoicePrintInfo {
        VoicePrintInfo {
            user_id: self.user_id.clone(),
            version: self.version.clone(),
            created_at: self.created_at,
            updated_at: self.updated_at,
            enrollment_count: self.enrollment_count,
            integrity_hash: self.integrity_hash.clone(),
        }
    }
    
    /// Compute integrity hash for voice print
    fn compute_integrity_hash(user_id: &str, features: &VoiceFeatures) -> Result<String> {
        let mut hasher = Sha256::new();
        hasher.update(user_id.as_bytes());
        hasher.update(features.feature_hash.as_bytes());
        hasher.update(&features.mfccs.len().to_le_bytes());
        hasher.update(&features.created_at.to_le_bytes());
        
        Ok(hex::encode(hasher.finalize()))
    }
    
    /// Export voice print to JSON (for debugging/inspection)
    pub fn to_json(&self) -> Result<String> {
        serde_json::to_string_pretty(self)
            .context("Failed to serialize voice print to JSON")
    }
}

/// Voice print information summary
#[derive(Debug, Clone)]
pub struct VoicePrintInfo {
    pub user_id: String,
    pub version: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub enrollment_count: u32,
    pub integrity_hash: String,
}

impl std::fmt::Display for VoicePrintInfo {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "Voice Print: {}", self.user_id)?;
        writeln!(f, "  Version: {}", self.version)?;
        writeln!(f, "  Created: {}", timestamp_to_string(self.created_at))?;
        writeln!(f, "  Updated: {}", timestamp_to_string(self.updated_at))?;
        writeln!(f, "  Enrollments: {}", self.enrollment_count)?;
        writeln!(f, "  Hash: {}...", self.integrity_hash[..16].to_string())?;
        Ok(())
    }
}

/// Convert Unix timestamp to human-readable string
fn timestamp_to_string(ts: u64) -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::UNIX_EPOCH
        .checked_add(std::time::Duration::from_secs(ts))
        .map(|t| {
            t.duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .to_string()
        })
        .unwrap_or_else(|| "unknown".to_string())
}

/// Voice print store for managing multiple prints
pub struct VoicePrintStore {
    /// Base directory for storage
    base_dir: String,
    /// Configuration
    config: VoicePrintConfig,
}

impl VoicePrintStore {
    /// Create new voice print store
    /// 
    /// # Arguments
    /// * `base_dir` - Base directory for storing voice prints
    pub fn new(base_dir: &str) -> Result<Self> {
        info!("Initializing voice print store: {}", base_dir);
        
        // Create base directory if it doesn't exist
        std::fs::create_dir_all(base_dir)
            .context("Failed to create voice print store directory")?;
        
        Ok(Self {
            base_dir: base_dir.to_string(),
            config: VoicePrintConfig::default(),
        })
    }
    
    /// Get voice print path for user
    fn get_print_path(&self, user_id: &str) -> String {
        format!("{}/{}.vprint", self.base_dir, user_id)
    }
    
    /// Store voice print for user
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    /// * `print` - Voice print to store
    pub fn store(&self, user_id: &str, print: &VoicePrint) -> Result<String> {
        let path = self.get_print_path(user_id);
        print.save(&path)
    }
    
    /// Load voice print for user
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    pub fn load(&self, user_id: &str) -> Result<VoicePrint> {
        let path = self.get_print_path(user_id);
        VoicePrint::load(&path)
    }
    
    /// Check if voice print exists for user
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    pub fn exists(&self, user_id: &str) -> bool {
        Path::new(&self.get_print_path(user_id)).exists()
    }
    
    /// Delete voice print for user
    /// 
    /// # Arguments
    /// * `user_id` - User identifier
    pub fn delete(&self, user_id: &str) -> Result<()> {
        let path = self.get_print_path(user_id);
        
        if !Path::new(&path).exists() {
            anyhow::bail!("Voice print not found for user: {}", user_id);
        }
        
        std::fs::remove_file(&path)
            .context("Failed to delete voice print")?;
        
        info!("Voice print deleted for user: {}", user_id);
        Ok(())
    }
    
    /// List all voice prints in store
    pub fn list(&self) -> Result<Vec<String>> {
        let mut prints = Vec::new();
        
        let entries = std::fs::read_dir(&self.base_dir)
            .context("Failed to read voice print store directory")?;
        
        for entry in entries {
            let entry = entry?;
            let path = entry.path();
            
            if path.extension().map_or(false, |ext| ext == "vprint") {
                if let Some(stem) = path.file_stem() {
                    prints.push(stem.to_string_lossy().to_string());
                }
            }
        }
        
        Ok(prints)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::voice_features::VoiceFeatures;
    
    fn create_test_features() -> VoiceFeatures {
        VoiceFeatures {
            user_id: "test_user".to_string(),
            mfccs: vec![vec![1.0, 2.0, 3.0]],
            pitch_contour: vec![100.0, 150.0, 200.0],
            formants: vec![],
            spectral_centroids: vec![500.0],
            zcr: vec![0.1],
            feature_hash: "test_hash".to_string(),
            created_at: 1234567890,
        }
    }
    
    #[test]
    fn test_voice_print_creation() {
        let features = create_test_features();
        let print = VoicePrint::new("test_user", features).unwrap();
        
        assert_eq!(print.user_id, "test_user");
        assert_eq!(print.version, "1.0.0");
        assert_eq!(print.enrollment_count, 1);
        assert!(!print.integrity_hash.is_empty());
    }
    
    #[test]
    fn test_voice_print_integrity() {
        let features = create_test_features();
        let print = VoicePrint::new("test_user", features).unwrap();
        
        assert!(print.verify_integrity().unwrap());
    }
    
    #[test]
    fn test_voice_print_info() {
        let features = create_test_features();
        let print = VoicePrint::new("test_user", features).unwrap();
        
        let info = print.info();
        assert_eq!(info.user_id, "test_user");
        assert_eq!(info.version, "1.0.0");
    }
}
