//! Vauth - Voice Authentication System
//! 
//! Main entry point providing CLI interface for voice authentication operations.

mod voice_capture;
mod voice_features;
mod voice_print;
mod auth;

use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use tracing::{info, error, warn};
use tracing_subscriber::EnvFilter;

use crate::auth::Authenticator;
use crate::voice_print::VoicePrint;

/// Voice Authentication CLI
#[derive(Parser)]
#[command(name = "vauth")]
#[command(author = "Vauth Contributors")]
#[command(version = "0.1.0")]
#[command(about = "Voice authentication system using kalosm_sound", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
    
    /// Enable verbose logging
    #[arg(short, long, global = true)]
    verbose: bool,
}

#[derive(Subcommand)]
enum Commands {
    /// Record a new voice print for enrollment
    Enroll {
        /// User identifier for the voice print
        #[arg(short, long)]
        user_id: String,
        
        /// Output path for voice print file
        #[arg(short, long, default_value = "voice_prints")]
        output_dir: String,
    },
    
    /// Authenticate using voice
    Auth {
        /// User identifier to authenticate
        #[arg(short, long)]
        user_id: String,
        
        /// Path to voice print file
        #[arg(short, long)]
        print_path: String,
    },
    
    /// List stored voice prints
    List {
        /// Directory to search for voice prints
        #[arg(short, long, default_value = "voice_prints")]
        dir: String,
    },
    
    /// Delete a voice print
    Delete {
        /// User identifier to remove
        #[arg(short, long)]
        user_id: String,
        
        /// Path to voice print file
        #[arg(short, long)]
        print_path: String,
    },
    
    /// Verify audio file against stored print (non-interactive)
    Verify {
        /// Path to audio file to verify
        #[arg(short, long)]
        audio_path: String,
        
        /// Path to voice print file
        #[arg(short, long)]
        print_path: String,
        
        /// Confidence threshold (0.0-1.0)
        #[arg(short, long, default_value = "0.75")]
        threshold: f32,
    },
}

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    
    // Initialize logging
    let filter = if cli.verbose {
        "debug"
    } else {
        "info"
    };
    
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::new(filter))
        .init();
    
    info!("Vauth voice authentication system initialized");
    
    match cli.command {
        Commands::Enroll { user_id, output_dir } => {
            info!("Enrolling voice print for user: {}", user_id);
            
            // Create output directory if it doesn't exist
            std::fs::create_dir_all(&output_dir)
                .context("Failed to create output directory")?;
            
            // Record voice and create print
            let print = voice_capture::record_voice_print(&user_id)?;
            
            // Save voice print
            let print_path = format!("{}/{}.vprint", output_dir, user_id);
            print.save(&print_path)?;
            
            info!("Voice print saved to: {}", print_path);
            println!("✓ Voice print enrolled successfully for user: {}", user_id);
            println!("  Saved to: {}", print_path);
        }
        
        Commands::Auth { user_id, print_path } => {
            info!("Authenticating user: {}", user_id);
            
            // Load stored voice print
            let stored_print = VoicePrint::load(&print_path)
                .context("Failed to load voice print")?;
            
            // Create authenticator
            let authenticator = Authenticator::new(stored_print);
            
            // Record and authenticate
            match authenticator.authenticate_live(&user_id)? {
                true => {
                    info!("Authentication successful for user: {}", user_id);
                    println!("✓ Authentication successful");
                    println!("  User: {} verified", user_id);
                }
                false => {
                    warn!("Authentication failed for user: {}", user_id);
                    println!("✗ Authentication failed");
                    println!("  Voice does not match stored print");
                }
            }
        }
        
        Commands::List { dir } => {
            info!("Listing voice prints in: {}", dir);
            
            if !std::path::Path::new(&dir).exists() {
                println!("No voice prints found. Directory does not exist: {}", dir);
                return Ok(());
            }
            
            let entries = std::fs::read_dir(&dir)
                .context("Failed to read directory")?;
            
            let mut count = 0;
            for entry in entries {
                let entry = entry?;
                let path = entry.path();
                if path.extension().map_or(false, |ext| ext == "vprint") {
                    println!("  {}", path.display());
                    count += 1;
                }
            }
            
            if count == 0 {
                println!("  No voice prints found in: {}", dir);
            } else {
                println!("\nTotal: {} voice print(s)", count);
            }
        }
        
        Commands::Delete { user_id, print_path } => {
            info!("Deleting voice print for user: {}", user_id);
            
            let path = std::path::Path::new(&print_path);
            if !path.exists() {
                error!("Voice print not found: {}", print_path);
                println!("✗ Voice print not found: {}", print_path);
                return Ok(());
            }
            
            std::fs::remove_file(path)
                .context("Failed to delete voice print")?;
            
            info!("Voice print deleted: {}", print_path);
            println!("✓ Voice print deleted successfully");
        }
        
        Commands::Verify { audio_path, print_path, threshold } => {
            info!("Verifying audio file: {}", audio_path);
            
            // Load stored voice print
            let stored_print = VoicePrint::load(&print_path)
                .context("Failed to load voice print")?;
            
            // Create authenticator
            let authenticator = Authenticator::new(stored_print);
            
            // Verify audio file
            match authenticator.verify_audio_file(&audio_path, threshold)? {
                true => {
                    info!("Verification successful (confidence >= {})", threshold);
                    println!("✓ Verification successful");
                    println!("  Audio matches stored voice print");
                }
                false => {
                    warn!("Verification failed (confidence < {})", threshold);
                    println!("✗ Verification failed");
                    println!("  Audio does not match stored print");
                }
            }
        }
    }
    
    Ok(())
}
