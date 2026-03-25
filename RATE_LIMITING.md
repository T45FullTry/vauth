# Vauth Rate Limiting & Monitoring

Security hardening through request rate limiting and real-time monitoring.

## Overview

Rate limiting protects against:
- **Brute force attacks** - Limit auth attempts per window
- **DoS attacks** - Prevent API flooding
- **Credential stuffing** - Detect automated attacks
- **Resource exhaustion** - Protect server resources

## Architecture

### Components

1. **Rate Limit Middleware** (`src/middleware/rateLimit.ts`)
   - In-memory request tracking
   - Configurable windows and limits
   - Client fingerprinting (IP + User-Agent)
   - Database logging for audit

2. **Database Logging** (`database/migrations/002_rate_limit.sql`)
   - `rate_limit_logs` table for all events
   - `rate_limit_activity` view for analytics
   - Indexed for fast queries

3. **Monitoring Dashboard** (`frontend/src/pages/MonitoringDashboard.tsx`)
   - Real-time stats display
   - Endpoint breakdown
   - Auto-refresh (30s)
   - High block rate alerts

## Configuration

### Rate Limit Profiles

```typescript
// Authentication endpoints (strict)
AUTH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 10,            // 10 attempts
  message: 'Too many authentication attempts'
}

// WebSocket connections
WS_RATE_LIMIT = {
  windowMs: 5 * 60 * 1000,   // 5 minutes
  maxRequests: 20,            // 20 connections
  message: 'Too many WebSocket attempts'
}

// General API (lenient)
API_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 100,           // 100 requests
  message: 'Too many requests'
}
```

### Customization

Edit `src/middleware/rateLimit.ts` to adjust:

```typescript
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 30 * 60 * 1000,  // Change window
  maxRequests: 5,            // Change limit
  message: 'Custom message',
};
```

## Usage

### Apply to Routes

```typescript
import { applyAuthRateLimit } from './middleware/rateLimit';

// Apply to specific route group
router.use(applyAuthRateLimit());

// Or apply individually
router.post('/login', applyAuthRateLimit(), loginHandler);
```

### Monitoring Endpoint

```bash
GET /api/monitoring/rate-limit

Response:
{
  "status": "ok",
  "timestamp": "2026-03-23T10:30:00Z",
  "stats": {
    "total": 150,
    "blocked": 12,
    "endpoints": [...]
  }
}
```

### Frontend Dashboard

```typescript
import RateLimitMonitoring from './components/RateLimitMonitoring';

function Dashboard() {
  return <RateLimitMonitoring />;
}
```

## Database Schema

### rate_limit_logs

| Column | Type | Description |
|--------|------|-------------|
| id | SERIAL | Primary key |
| client_id | VARCHAR(255) | IP + User-Agent fingerprint |
| endpoint | VARCHAR(500) | Request path |
| allowed | BOOLEAN | Request allowed or blocked |
| remaining | INTEGER | Remaining requests in window |
| timestamp | TIMESTAMPTZ | Event time |

### Indexes

- `idx_rate_limit_logs_timestamp` - Time-based queries
- `idx_rate_limit_logs_client_id` - Client lookups
- `idx_rate_limit_logs_endpoint` - Endpoint analysis
- `idx_rate_limit_logs_allowed` - Block/allow filtering
- `idx_rate_limit_logs_endpoint_timestamp` - Composite queries

### Analytics View

```sql
CREATE VIEW rate_limit_activity AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  endpoint,
  COUNT(*) as requests,
  COUNT(*) FILTER (WHERE allowed = false) as blocked,
  ROUND(blocked * 100.0 / NULLIF(requests, 0), 2) as block_percentage
FROM rate_limit_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp), endpoint
ORDER BY hour DESC, blocked DESC;
```

## Monitoring Features

### Dashboard Metrics

- **Total Requests** - All requests in last hour
- **Allowed** - Successful requests
- **Blocked** - Rate-limited requests
- **Block Rate** - Percentage blocked
- **Endpoint Breakdown** - Per-endpoint stats
- **Last Request** - Most recent activity

### Alerts

Dashboard shows warning when:
- Block rate > 20% on any endpoint
- Indicates potential attack or misconfiguration

### Auto-Refresh

- Polls every 30 seconds
- Toggle on/off in UI
- Manual refresh button

## Security Headers

Rate limit middleware adds response headers:

```
X-RateLimit-Limit: 10          # Max requests
X-RateLimit-Remaining: 7       # Remaining in window
X-RateLimit-Reset: 1711188000  # Unix timestamp of reset
```

Clients can use these to:
- Adjust request rate
- Display countdown to reset
- Implement backoff strategies

## Production Considerations

### Redis Store (Recommended)

Current implementation uses in-memory Map. For production:

```typescript
import Redis from 'ioredis';

const redis = new Redis();

async function checkRateLimit(clientId: string, config: RateLimitConfig) {
  const key = `ratelimit:${clientId}`;
  const current = await redis.get(key);
  
  if (!current) {
    await redis.setex(key, config.windowMs / 1000, 1);
    return { allowed: true, remaining: config.maxRequests - 1 };
  }
  
  const count = parseInt(current);
  if (count >= config.maxRequests) {
    return { allowed: false, remaining: 0 };
  }
  
  await redis.incr(key);
  return { allowed: true, remaining: config.maxRequests - count - 1 };
}
```

### Distributed Systems

- Use Redis for shared state across instances
- Sticky sessions for WebSocket connections
- Centralized monitoring aggregation

### Tuning

Adjust limits based on:
- Expected traffic volume
- Attack patterns
- User behavior
- Business requirements

## Database Maintenance

### Cleanup Old Logs

```sql
-- Delete logs older than 30 days
DELETE FROM rate_limit_logs 
WHERE timestamp < NOW() - INTERVAL '30 days';
```

### Archive Strategy

For compliance/auditing:
- Export to cold storage monthly
- Keep recent 90 days in hot storage
- Aggregate daily stats permanently

## Testing

### Manual Testing

```bash
# Rapid requests to trigger rate limit
for i in {1..15}; do
  curl -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"test","voiceFeatures":[]}'
done

# Check response headers
curl -I http://localhost:8080/api/auth/login
```

### Load Testing

```bash
# Apache Bench
ab -n 100 -c 10 http://localhost:8080/api/auth/login

# Check rate limit stats
curl http://localhost:8080/api/monitoring/rate-limit
```

## Troubleshooting

### False Positives

If legitimate users are blocked:
- Increase `maxRequests`
- Extend `windowMs`
- Implement IP whitelisting
- Add user-level rate limits (authenticated users get higher limits)

### Debugging

Enable verbose logging:

```typescript
// In rateLimit.ts
if (!result.allowed) {
  console.log(`[Rate Limit] Blocked: ${clientId} on ${endpoint}`);
  console.log(`  Count: ${entry.count}, Max: ${config.maxRequests}`);
  console.log(`  Reset: ${new Date(result.resetAt).toISOString()}`);
}
```

---

**Version:** 1.1.0  
**Added:** 2026-03-23
