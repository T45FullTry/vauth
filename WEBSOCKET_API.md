# Vauth WebSocket API

Real-time remote authentication via WebSocket for challenge-response and voice verification flows.

## Overview

The WebSocket API enables:
- **Remote authentication sessions** - Start auth from any device
- **Challenge-response flows** - Anti-spoofing via dynamic challenges
- **Voice verification** - Real-time voice biometric verification
- **Session management** - Track active auth sessions
- **Heartbeat monitoring** - Keep connections alive

## Connection

### WebSocket Endpoint

```
ws://localhost:8081/ws/auth
```

### Environment Variables

```bash
# WebSocket server port (default: 8081)
WS_PORT=8081

# JWT secret (required for token signing)
JWT_SECRET=your-secret-key
```

## Protocol

### Message Format

All messages are JSON with an `action` field:

```typescript
{
  "action": "action_name",
  "sessionId": "uuid",
  ...additional_fields
}
```

### Actions

#### Client → Server

| Action | Description | Required Fields |
|--------|-------------|-----------------|
| `auth_request` | Start authentication | `email`, `sessionId` |
| `challenge_response` | Respond to challenge | `sessionId`, `response` |
| `voice_verify` | Verify voice biometric | `sessionId`, `voiceFeatures` |
| `session_close` | Close session | `sessionId` |

#### Server → Client

| Action | Description | Fields |
|--------|-------------|--------|
| `auth_challenge` | Send challenge string | `sessionId`, `message` |
| `auth_result` | Auth success/fail | `sessionId`, `message`, `confidence`, `token?` |
| `session_error` | Error occurred | `sessionId`, `error` |
| `session_closed` | Session terminated | `sessionId`, `message` |
| `heartbeat` | Keep-alive ping | `sessionId`, `timestamp` |

## Flow Examples

### 1. Challenge-Response Authentication

```
Client                          Server
  │                               │
  │──── auth_request ────────────▶│  { action: "auth_request",
  │                               │    email: "user@example.com",
  │                               │    sessionId: "uuid" }
  │                               │
  │◀─── auth_challenge ───────────│  { action: "auth_challenge",
  │                               │    sessionId: "uuid",
  │                               │    message: "A7K9M2X" }
  │                               │
  │──── challenge_response ──────▶│  { action: "challenge_response",
  │                               │    sessionId: "uuid",
  │                               │    response: "A7K9M2X" }
  │                               │
  │◀─── auth_result ──────────────│  { action: "auth_result",
  │                               │    sessionId: "uuid",
  │                               │    message: "Authentication successful",
  │                               │    token: "jwt_token",
  │                               │    confidence: 1.0 }
  │                               │
```

### 2. Voice Verification (after challenge)

```
Client                          Server
  │                               │
  │──── voice_verify ────────────▶│  { action: "voice_verify",
  │                               │    sessionId: "uuid",
  │                               │    voiceFeatures: [0.1, 0.2, ...] }
  │                               │
  │◀─── auth_result ──────────────│  { action: "auth_result",
  │                               │    sessionId: "uuid",
  │                               │    message: "Voice verification successful",
  │                               │    confidence: 0.94 }
  │                               │
```

## Client Example (TypeScript)

```typescript
import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:8081/ws/auth?session=' + crypto.randomUUID());

ws.on('open', () => {
  console.log('Connected to Vauth WS');
  
  // Start authentication
  ws.send(JSON.stringify({
    action: 'auth_request',
    email: 'user@example.com',
    sessionId: ws.url.split('=')[1],
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  switch (message.action) {
    case 'auth_challenge':
      console.log('Challenge:', message.message);
      // Send challenge response
      ws.send(JSON.stringify({
        action: 'challenge_response',
        sessionId: message.sessionId,
        response: message.message, // In real app, user inputs this
      }));
      break;
    
    case 'auth_result':
      if (message.token) {
        console.log('✅ Authenticated:', message.token);
      } else {
        console.log('❌ Failed:', message.message);
      }
      break;
    
    case 'session_error':
      console.error('Error:', message.error);
      break;
    
    case 'heartbeat':
      console.log('Heartbeat received');
      break;
  }
});

ws.on('close', () => {
  console.log('Disconnected');
});
```

## Session Management

### Session Lifecycle

1. **Created** - On `auth_request` with new `sessionId`
2. **Active** - During challenge-response exchange
3. **Verified** - After successful challenge (+ optional voice)
4. **Closed** - On `session_close` or timeout

### Timeouts

- **Session timeout**: 5 minutes (300 seconds)
- **Heartbeat interval**: 30 seconds
- **Max challenge attempts**: 3

### Active Sessions

Server tracks active sessions in memory:

```typescript
// Get active session count
GET /api/ws/sessions  (future endpoint)

// Response
{
  "count": 5,
  "sessions": [...]
}
```

## Security

### Challenge Security

- 8-character alphanumeric challenges
- Case-sensitive comparison
- 3 attempt limit before lockout
- New challenge generated per attempt

### Token Security

- JWT signed with HMAC-SHA256
- 24-hour expiration
- Stateless verification

### Session Security

- UUID-based session IDs
- Server-side session storage
- Automatic cleanup on timeout
- IP/User-Agent logging

## Error Handling

### Error Types

| Error | Cause | Recovery |
|-------|-------|----------|
| `User not found` | Invalid email | Check email, register |
| `User account is inactive` | Disabled account | Contact admin |
| `Session not found or expired` | Timeout/invalid ID | Restart auth |
| `Invalid challenge response` | Wrong challenge | Retry (max 3) |
| `Voice print not found` | No enrollment | Enroll voice first |
| `Maximum attempts exceeded` | 3 failed challenges | Wait & retry |

### Error Response

```json
{
  "action": "session_error",
  "sessionId": "uuid",
  "error": "Error message",
  "timestamp": "2026-03-23T10:30:00Z"
}
```

## Production Considerations

### Scaling

- Use Redis for session storage (current: in-memory)
- Sticky sessions for WebSocket connections
- Load balancer with WebSocket support

### Monitoring

- Track active session count
- Log auth success/failure rates
- Monitor session timeout frequency
- Alert on high failure rates

### Rate Limiting

(To be implemented)
- Per-IP connection limits
- Per-user session limits
- Challenge attempt throttling

---

**Version:** 1.0.0  
**Added:** 2026-03-23
