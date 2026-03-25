# Vauth Changelog

## [1.2.0] - 2026-03-23

### Added
- **Rate limiting middleware** (`src/middleware/rateLimit.ts`)
  - Configurable rate limit profiles (auth, WS, API)
  - In-memory request tracking
  - Client fingerprinting (IP + User-Agent)
  - Database logging for audit trails
  - Rate limit stats endpoint (`GET /api/monitoring/rate-limit`)
- **Database migration** (`database/migrations/002_rate_limit.sql`)
  - `rate_limit_logs` table for event tracking
  - `rate_limit_activity` view for analytics
  - Optimized indexes for queries
- **Monitoring dashboard** (`frontend/src/pages/MonitoringDashboard.tsx`)
  - Real-time rate limit analytics
  - Endpoint breakdown table
  - Auto-refresh (30s intervals)
  - High block rate alerts (>20%)
- **Rate limit component** (`frontend/src/components/RateLimitMonitoring.tsx`)
  - Reusable monitoring UI
  - Summary cards (total, allowed, blocked, block rate)
  - Manual/auto refresh toggle
- **Documentation** (`RATE_LIMITING.md`)
  - Architecture overview
  - Configuration guide
  - Production recommendations (Redis)
  - Troubleshooting tips

### Changed
- **Auth routes** (`src/routes/auth.ts`)
  - Applied `AUTH_RATE_LIMIT` middleware (10 req/15min)
- **Server** (`src/server.ts`)
  - Applied global `API_RATE_LIMIT` middleware (100 req/15min)
  - Added rate limit cleanup interval
  - Added monitoring endpoint
- **Frontend** - Added monitoring dashboard page

### Security
- Auth endpoints: 10 attempts per 15 minutes
- WebSocket: 20 connections per 5 minutes
- General API: 100 requests per 15 minutes
- Response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Migration
```bash
cd api
npm run migrate  # Apply 002_rate_limit.sql
```

---

## [1.1.0] - 2026-03-23

### Added
- **WebSocket API for remote authentication** (`src/websocket/auth.ts`)
  - Challenge-response authentication flow
  - Real-time voice verification
  - Session management with timeouts
  - Heartbeat monitoring for connection health
  - Active session tracking
- **WebSocket documentation** (`WEBSOCKET_API.md`)
  - Protocol specification
  - Message format reference
  - Flow diagrams
  - Client example code
- **Interactive client example** (`examples/ws-client.ts`)
  - TypeScript WebSocket client
  - Challenge-response demo
  - Voice verification test
- **Architecture updates** (`ARCHITECTURE.md`)
  - WebSocket endpoint documentation
  - Action reference

### Changed
- **Server initialization** (`src/server.ts`)
  - Added HTTP server wrapper for Express
  - Integrated WebSocket server on separate port (8081)
  - Updated startup banner with WS info

### Dependencies
- Added `ws` ^8.14.2
- Added `@types/ws` ^8.5.10

### Installation
```bash
cd api
npm install
```

### Usage
```bash
# Start API server (REST + WebSocket)
npm run dev

# Run WebSocket client example
npx tsx examples/ws-client.ts
```

### Environment Variables
```bash
# WebSocket server port
WS_PORT=8081

# Required for JWT signing
JWT_SECRET=your-secret-key
```

---

## [1.0.0] - 2026-03-23

Initial release with:
- REST API for authentication
- Voice biometric enrollment/verification
- React frontend
- PostgreSQL database
- JWT-based auth
