# Vauth Architecture

System architecture and design decisions for the voice authentication platform.

## System Overview

Vauth is a full-stack voice authentication system consisting of:

1. **Rust Core** - Voice processing and biometric analysis
2. **Node.js API** - RESTful backend with authentication logic
3. **React Frontend** - User interface with voice recording
4. **PostgreSQL** - Persistent storage for users and voice prints

## Technology Stack

### Backend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Core Engine | Rust + kalosm_sound | Voice feature extraction |
| API Server | Node.js + Express | HTTP API endpoints |
| Database | PostgreSQL 14+ | User & voice print storage |
| ORM | Raw SQL + pg | Database queries |
| Auth | JWT + bcrypt | Token-based authentication |
| Validation | Zod | Runtime type validation |

### Frontend

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Framework | React 18 | UI component library |
| Language | TypeScript | Type safety |
| Routing | React Router v6 | Client-side routing |
| State | Zustand | Global state management |
| HTTP | Axios | API client |
| Audio | Web Audio API | Voice capture & analysis |
| Build | Vite | Fast development & bundling |

## Data Flow

### Registration Flow

```
User → Frontend → API → Database
  │       │        │       │
  │       │        │       └─ Create user record
  │       │        │       └─ Create voice_print record
  │       │        └─ Hash password
  │       │        └─ Store voice features
  │       │        └─ Generate JWT
  │       └─ Return token
  └─ Store token, redirect to dashboard
```

### Authentication Flow

```
User → Frontend → API → Database
  │       │        │       │
  │       │        │       └─ Fetch user by email
  │       │        │       └─ Verify password hash
  │       │        │       └─ Fetch voice_print
  │       │        └─ Compare voice features
  │       │        └─ Calculate confidence score
  │       │        └─ Log auth attempt
  │       │        └─ Generate JWT (if success)
  │       └─ Return token
  └─ Store token, redirect to dashboard
```

## Database Schema

### Core Tables

**users**
- Primary user account storage
- Contains credentials and profile info
- References voice_print via foreign key

**voice_prints**
- Stores biometric voice features as JSON
- One-to-one relationship with users
- Contains confidence threshold settings

**auth_attempts**
- Audit log for all authentication attempts
- Tracks success/failure, confidence scores
- Useful for security monitoring

**sessions**
- JWT token management (future use)
- Token revocation support
- Session lifecycle tracking

### Indexes

Performance-critical indexes:
- `idx_users_email` - Fast user lookup
- `idx_voice_prints_user_id` - Voice print retrieval
- `idx_auth_attempts_created_at` - Recent audit queries

### Triggers

Automatic timestamp updates:
- `update_users_updated_at`
- `update_voice_prints_updated_at`

## API Design

### RESTful Endpoints

```
Authentication
  POST   /api/auth/register    - Create new account
  POST   /api/auth/login       - Authenticate user
  GET    /api/auth/me          - Get current user
  POST   /api/auth/logout      - Invalidate session
  POST   /api/auth/refresh     - Refresh JWT token

Voice Management
  POST   /api/voice/enroll     - Enroll new voice print
  POST   /api/voice/verify     - Verify voice against print
  GET    /api/voice/print      - Get voice print info
  DELETE /api/voice/print      - Delete voice print

User Management
  GET    /api/users/profile    - Get user profile
  PUT    /api/users/profile    - Update profile
```

### WebSocket Endpoints

```
WebSocket: ws://localhost:8081/ws/auth

Actions (Client → Server)
  auth_request       - Start authentication session
  challenge_response - Respond to challenge string
  voice_verify       - Verify voice biometric
  session_close      - Close session manually

Actions (Server → Client)
  auth_challenge     - Send challenge string
  auth_result        - Authentication success/failure
  session_error      - Error occurred
  session_closed     - Session terminated
  heartbeat          - Keep-alive ping
```

### Request/Response Format

All requests/responses use JSON:

```typescript
// Registration Request
{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepassword",
  "voiceFeatures": [0.1, 0.2, 0.3, ...]
}

// Registration Response
{
  "token": "jwt_token_here",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "voicePrintId": "uuid",
    "createdAt": "2026-03-23T08:30:00Z"
  },
  "expiresIn": 86400
}
```

### Error Responses

```typescript
{
  "error": "Error Type",
  "message": "Human-readable description"
}
```

Common error types:
- `Validation Error` - Invalid input (400)
- `Unauthorized` - Auth failure (401)
- `Conflict` - Resource exists (409)
- `Not Found` - Resource missing (404)
- `Internal Server Error` - Server error (500)

## Security Architecture

### Authentication

**Password Security:**
- bcrypt with configurable rounds (default: 10)
- Salt automatically generated
- Never stored/transmitted in plain text

**Token Security:**
- JWT with HMAC-SHA256 signing
- 24-hour expiration (configurable)
- Bearer token in Authorization header
- Stateless verification

### Voice Security

**Feature Storage:**
- Voice features encrypted at rest (future)
- Integrity verification via SHA-256
- Version tracking for algorithm updates

**Liveness Detection:**
- Basic replay attack prevention
- Confidence threshold tuning
- Rate limiting on attempts

### Input Validation

**Backend:**
- Zod schema validation
- Type coercion prevention
- SQL injection prevention (parameterized queries)

**Frontend:**
- Form validation
- File type checking
- XSS prevention (React auto-escaping)

### Rate Limiting

(To be implemented)
- Per-IP rate limiting
- Per-account attempt limits
- Account lockout after N failures

## Frontend Architecture

### Component Structure

```
src/
├── components/
│   ├── VoiceRecorder.tsx    - Voice capture UI
│   ├── WaveformDisplay.tsx  - Audio visualization
│   └── ProtectedRoute.tsx   - Auth guard
├── pages/
│   ├── Login.tsx            - Login page
│   ├── Register.tsx         - Registration page
│   └── Dashboard.tsx        - Authenticated dashboard
├── hooks/
│   └── useVoiceRecorder.ts  - Voice recording logic
├── services/
│   └── api.ts               - API client
├── store/
│   └── authStore.ts         - Auth state (Zustand)
├── types/
│   └── index.ts             - TypeScript types
└── App.tsx                  - Root component
```

### State Management

**Zustand Store:**
- Global authentication state
- User data persistence
- Token management

**Local State:**
- Form inputs
- Recording state
- UI toggles

### Audio Processing

**Web Audio API:**
- getUserMedia for microphone access
- AudioContext for processing
- AnalyserNode for visualization
- MediaRecorder for recording

**Feature Extraction:**
- Simplified client-side extraction
- RMS energy calculation
- Zero-crossing rate
- Placeholder for MFCC (production uses backend)

## Deployment Architecture

### Development

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Frontend   │────▶│   API       │────▶│  PostgreSQL │
│ localhost:  │     │ localhost:  │     │ localhost:  │
│    3000     │     │    8080     │     │    5432     │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Production

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   CDN/      │────▶│   Load      │────▶│  Database   │
│   Static    │     │  Balancer   │     │   Cluster   │
│   Host      │     │             │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   API       │
                    │  Servers    │
                    │ (Auto-scale)│
                    └─────────────┘
```

## Performance Considerations

### Database

- Connection pooling (max: 20)
- Prepared statements
- Index optimization
- Query caching (future)

### API

- Response compression
- Request size limits
- Efficient JSON parsing
- Async I/O

### Frontend

- Code splitting
- Lazy loading
- Asset optimization
- Service worker (future)

## Monitoring & Observability

### Logging

**Backend:**
- Winston logger
- Structured JSON logs
- Request/response logging
- Error stack traces

**Frontend:**
- Console logging (dev)
- Error boundaries
- User action tracking (future)

### Metrics

(To be implemented)
- Request latency
- Authentication success rate
- Voice confidence distribution
- Error rates

### Alerts

(To be implemented)
- High failure rate
- Unusual traffic patterns
- Database connection issues
- Certificate expiration

## Future Enhancements

### Planned Features

1. **Multi-factor Authentication**
   - Voice + password
   - Voice + OTP
   - Voice + hardware token

2. **Challenge-Response**
   - Dynamic phrase verification
   - Anti-spoofing improvements

3. **Multi-Enrollment**
   - Multiple voice prints per user
   - Averaged confidence scoring

4. **Cloud Integration**
   - AWS KMS encryption
   - S3 voice print storage
   - Lambda processing

5. **Mobile SDKs**
   - iOS voice authentication
   - Android voice authentication
   - React Native support

6. **Admin Dashboard**
   - User management
   - Audit log viewer
   - Analytics dashboard

### Technical Debt

- [ ] Implement proper MFCC extraction in frontend
- [ ] Add comprehensive test suite
- [ ] Implement rate limiting
- [ ] Add refresh token rotation
- [ ] Implement account lockout
- [ ] Add monitoring/metrics
- [ ] Docker compose setup
- [ ] CI/CD pipeline

---

**Version:** 1.0.0  
**Last Updated:** 2026-03-23
