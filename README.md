# Vauth - Voice Authentication System

A production-ready voice authentication system built with Rust using `kalosm_sound` for biometric voice analysis.

## Overview

Vauth provides secure voice-based authentication by:
- Recording and analyzing voice biometric features
- Creating encrypted voice prints for user enrollment
- Comparing live voice against stored prints with confidence scoring
- Supporting CLI and future API interfaces

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Vauth                                │
├─────────────────────────────────────────────────────────────┤
│  main.rs          │  CLI interface & command routing        │
│  voice_capture.rs │  Audio recording & WAV file handling    │
│  voice_features.rs│  MFCC, pitch, formant extraction        │
│  voice_print.rs   │  Voice print storage & encryption       │
│  auth.rs          │  Authentication logic & liveness check  │
└─────────────────────────────────────────────────────────────┘
```

### Core Modules

1. **voice_capture** - Handles microphone input and audio file loading
2. **voice_features** - Extracts biometric features (MFCCs, pitch, formants)
3. **voice_print** - Manages voice print storage with integrity verification
4. **auth** - Authentication logic with confidence scoring and liveness detection

## Features

- 🔒 **Secure Storage** - Voice prints encrypted with Argon2 hashing
- 🎤 **Live Recording** - Real-time voice capture from microphone
- 📊 **Confidence Scoring** - Match confidence 0.0-1.0
- 🔍 **Liveness Detection** - Prevents replay attacks
- 📁 **File Verification** - Verify pre-recorded audio files
- 🛡️ **Integrity Checks** - SHA-256 hash verification
- 📝 **Detailed Logging** - Tracing-based observability

## Installation

### Prerequisites

- Rust 1.70+ (install via `rustup`)
- Audio input device (microphone)
- Linux/macOS/Windows with audio support

### Build from Source

```bash
# Clone repository
git clone https://github.com/yourusername/vauth.git
cd vauth

# Build release version
cargo build --release

# Build with API support (async runtime)
cargo build --release --features api
```

## Usage

### Enroll New Voice Print

```bash
# Enroll voice print for user
./target/release/vauth enroll --user-id alice

# Specify custom output directory
./target/release/vauth enroll --user-id bob --output-dir ./my_prints
```

**Process:**
1. 3-second countdown
2. 5-second voice recording
3. Feature extraction and print creation
4. Encrypted save to `.vprint` file

### Authenticate

```bash
# Authenticate against stored print
./target/release/vauth auth --user-id alice --print-path ./voice_prints/alice.vprint
```

**Process:**
1. Live voice recording
2. Feature comparison with stored print
3. Confidence score calculation
4. Pass/fail result based on threshold (default 0.75)

### List Voice Prints

```bash
# List all prints in directory
./target/release/vauth list --dir ./voice_prints
```

### Delete Voice Print

```bash
# Remove user's voice print
./target/release/vauth delete --user-id alice --print-path ./voice_prints/alice.vprint
```

### Verify Audio File

```bash
# Verify pre-recorded audio file
./target/release/vauth verify \
  --audio-path ./recordings/test.wav \
  --print-path ./voice_prints/alice.vprint \
  --threshold 0.75
```

## Configuration

### Authentication Threshold

Adjust confidence threshold (0.0-1.0):
- Lower (0.5-0.6): More permissive, higher false accept rate
- Default (0.75): Balanced security/usability
- Higher (0.85-0.95): More strict, higher false reject rate

### Security Settings

Voice prints are:
- Encrypted with Argon2 password hashing
- Integrity-protected with SHA-256
- Stored with restrictive file permissions (0600)
- Backed up before updates

## API Reference

### VoicePrint

```rust
// Create new voice print
let print = VoicePrint::new(user_id, features)?;

// Load from file
let print = VoicePrint::load("./alice.vprint")?;

// Save to file
print.save("./alice.vprint")?;

// Verify integrity
let valid = print.verify_integrity()?;
```

### Authenticator

```rust
// Create authenticator
let auth = Authenticator::new(stored_print);

// Live authentication
let success = auth.authenticate_live(user_id)?;

// Verify audio file
let success = auth.verify_audio_file("./test.wav", 0.75)?;

// Detailed result
let result = auth.authenticate_detailed(user_id)?;
println!("Confidence: {}", result.confidence);
```

## Testing

```bash
# Run all tests
cargo test

# Run tests with output
cargo test -- --nocapture

# Run specific module tests
cargo test voice_features
cargo test auth
```

## Development

### Enable Verbose Logging

```bash
RUST_LOG=debug ./target/release/vauth enroll --user-id test --verbose
```

### Add New Features

1. Update `voice_features.rs` for new feature extraction
2. Update `VoiceFeatures` struct with new fields
3. Update comparison logic in `compare_features()`
4. Update serialization in `voice_print.rs`

### Integration with kalosm_sound

For production ML-based features:

```rust
// Replace simplified extraction with kalosm_sound
use kalosm_sound::prelude::*;

let model = MfccModel::default();
let features = model.extract(samples)?;
```

## Security Considerations

⚠️ **Important:**

1. **Voice prints are biometric data** - treat as sensitive PII
2. **Liveness detection is simplified** - production needs robust anti-spoofing
3. **Threshold tuning** - adjust based on security requirements
4. **Rate limiting** - implement attempt limits in production
5. **Encryption at rest** - consider additional encryption layer

## Troubleshooting

### No Input Device

```
Error: No input device available
```

**Fix:** Ensure microphone is connected and recognized by OS.

### Feature Extraction Failed

```
Error: Feature extraction failed
```

**Fix:** Ensure audio quality (SNR > 20dB), check sample rate (44100 Hz).

### Integrity Check Failed

```
Error: Voice print integrity verification failed
```

**Fix:** File may be corrupted. Re-enroll user or restore from backup.

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## Roadmap

- [ ] WebSocket API for remote authentication
- [ ] Multi-enrollment averaging (improve accuracy)
- [ ] Challenge-response liveness detection
- [ ] Speaker diarization for multi-speaker scenarios
- [ ] Cloud storage backend with KMS encryption
- [ ] Mobile SDK (iOS/Android)

---

**Vauth** - Secure voice authentication for the modern age.
