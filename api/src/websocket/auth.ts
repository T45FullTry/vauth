import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// WebSocket message types
export enum WS_AUTH_ACTION {
  // Client → Server
  AUTH_REQUEST = 'auth_request',
  CHALLENGE_RESPONSE = 'challenge_response',
  VOICE_VERIFY = 'voice_verify',
  SESSION_CLOSE = 'session_close',
  
  // Server → Client
  AUTH_CHALLENGE = 'auth_challenge',
  AUTH_RESULT = 'auth_result',
  SESSION_ERROR = 'session_error',
  SESSION_CLOSED = 'session_closed',
  HEARTBEAT = 'heartbeat',
}

// Message schemas
const authRequestSchema = z.object({
  action: z.literal(WS_AUTH_ACTION.AUTH_REQUEST),
  email: z.string().email(),
  sessionId: z.string().uuid(),
});

const challengeResponseSchema = z.object({
  action: z.literal(WS_AUTH_ACTION.CHALLENGE_RESPONSE),
  sessionId: z.string().uuid(),
  response: z.string(),
});

const voiceVerifySchema = z.object({
  action: z.literal(WS_AUTH_ACTION.VOICE_VERIFY),
  sessionId: z.string().uuid(),
  voiceFeatures: z.array(z.number()),
});

export interface WSMessage {
  action: WS_AUTH_ACTION;
  sessionId?: string;
  email?: string;
  response?: string;
  voiceFeatures?: number[];
  error?: string;
  message?: string;
  confidence?: number;
  token?: string;
  userId?: string;
  timestamp?: string;
}

export interface AuthSession {
  sessionId: string;
  userId: string;
  email: string;
  challenge: string;
  challengeSentAt: Date;
  attempts: number;
  ws: WebSocket;
}

// Active sessions map
const activeSessions = new Map<string, AuthSession>();

// Heartbeat interval (ms)
const HEARTBEAT_INTERVAL = 30000;

// Session timeout (ms)
const SESSION_TIMEOUT = 300000; // 5 minutes

// Generate a random challenge string
function generateChallenge(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Verify JWT token from WebSocket connection
function verifyToken(token: string): { id: string; email: string; username: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; username: string };
    return decoded;
  } catch (error) {
    return null;
  }
}

// Send message to WebSocket client
function sendWS(ws: WebSocket, message: WSMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Close session gracefully
function closeSession(sessionId: string, reason: string) {
  const session = activeSessions.get(sessionId);
  if (session) {
    sendWS(session.ws, {
      action: WS_AUTH_ACTION.SESSION_CLOSED,
      sessionId,
      message: reason,
      timestamp: new Date().toISOString(),
    });
    session.ws.close();
    activeSessions.delete(sessionId);
  }
}

// Handle authentication request
async function handleAuthRequest(ws: WebSocket, data: any) {
  try {
    const validated = authRequestSchema.parse(data);
    
    // Get user by email
    const userResult = await db.query(
      'SELECT id, email, username, is_active FROM users WHERE email = $1',
      [validated.email]
    );
    
    if (userResult.rows.length === 0) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'User not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    const user = userResult.rows[0];
    
    if (!user.is_active) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'User account is inactive',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Generate challenge
    const challenge = generateChallenge();
    
    // Store session
    const session: AuthSession = {
      sessionId: validated.sessionId,
      userId: user.id,
      email: user.email,
      challenge,
      challengeSentAt: new Date(),
      attempts: 0,
      ws,
    };
    
    activeSessions.set(validated.sessionId, session);
    
    // Send challenge to client
    sendWS(ws, {
      action: WS_AUTH_ACTION.AUTH_CHALLENGE,
      sessionId: validated.sessionId,
      message: challenge,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[WS Auth] Challenge sent to ${user.email} (session: ${validated.sessionId})`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        error: error.errors[0].message,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('[WS Auth] Auth request error:', error);
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        error: 'Authentication request failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Handle challenge response
async function handleChallengeResponse(ws: WebSocket, data: any) {
  try {
    const validated = challengeResponseSchema.parse(data);
    
    const session = activeSessions.get(validated.sessionId);
    
    if (!session) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'Session not found or expired',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Verify challenge response
    if (data.response !== session.challenge) {
      session.attempts += 1;
      
      if (session.attempts >= 3) {
        // Lock out after 3 failed attempts
        await db.query(
          `INSERT INTO auth_attempts (user_id, success, failure_reason, ip_address, user_agent)
           VALUES ($1, false, 'WS challenge exhausted', $2, $3)`,
          [session.userId, 'websocket', 'websocket-client']
        );
        
        closeSession(validated.sessionId, 'Maximum attempts exceeded');
        return;
      }
      
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: `Invalid challenge response (${session.attempts}/3 attempts)`,
        timestamp: new Date().toISOString(),
      });
      
      // Send new challenge
      const newChallenge = generateChallenge();
      session.challenge = newChallenge;
      session.challengeSentAt = new Date();
      
      sendWS(ws, {
        action: WS_AUTH_ACTION.AUTH_CHALLENGE,
        sessionId: validated.sessionId,
        message: newChallenge,
        timestamp: new Date().toISOString(),
      });
      
      return;
    }
    
    // Challenge verified - generate JWT token
    const userResult = await db.query(
      'SELECT id, email, username FROM users WHERE id = $1',
      [session.userId]
    );
    
    const user = userResult.rows[0];
    
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // Log successful auth attempt
    await db.query(
      `INSERT INTO auth_attempts (user_id, success, ip_address, user_agent)
       VALUES ($1, true, $2, $3)`,
      [session.userId, 'websocket', 'websocket-client']
    );
    
    // Update last login
    await db.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [session.userId]
    );
    
    // Send success result
    sendWS(ws, {
      action: WS_AUTH_ACTION.AUTH_RESULT,
      sessionId: validated.sessionId,
      message: 'Authentication successful',
      confidence: 1.0,
      token,
      userId: user.id,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[WS Auth] Authentication successful for ${user.email} (session: ${validated.sessionId})`);
    
    // Keep session open for optional voice verification
    session.challenge = ''; // Clear challenge
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: error.errors[0].message,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('[WS Auth] Challenge response error:', error);
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'Challenge verification failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Handle voice verification
async function handleVoiceVerify(ws: WebSocket, data: any) {
  try {
    const validated = voiceVerifySchema.parse(data);
    
    const session = activeSessions.get(validated.sessionId);
    
    if (!session) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'Session not found or expired',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    // Get voice print for user
    const voicePrintResult = await db.query(
      'SELECT features, confidence_threshold FROM voice_prints WHERE user_id = $1 AND is_active = true',
      [session.userId]
    );
    
    if (voicePrintResult.rows.length === 0) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'Voice print not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }
    
    const voicePrint = voicePrintResult.rows[0];
    const storedFeatures = voicePrint.features as number[];
    
    // Compare voice features
    const confidence = calculateVoiceConfidence(validated.voiceFeatures, storedFeatures);
    const threshold = parseFloat(voicePrint.confidence_threshold);
    
    if (confidence < threshold) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.AUTH_RESULT,
        sessionId: validated.sessionId,
        message: 'Voice verification failed',
        confidence,
        timestamp: new Date().toISOString(),
      });
      
      console.log(`[WS Auth] Voice verification failed for ${session.email} (confidence: ${(confidence * 100).toFixed(1)}%)`);
      return;
    }
    
    // Voice verified successfully
    sendWS(ws, {
      action: WS_AUTH_ACTION.AUTH_RESULT,
      sessionId: validated.sessionId,
      message: 'Voice verification successful',
      confidence,
      timestamp: new Date().toISOString(),
    });
    
    console.log(`[WS Auth] Voice verification successful for ${session.email} (confidence: ${(confidence * 100).toFixed(1)}%)`);
  } catch (error) {
    if (error instanceof z.ZodError) {
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: error.errors[0].message,
        timestamp: new Date().toISOString(),
      });
    } else {
      console.error('[WS Auth] Voice verify error:', error);
      sendWS(ws, {
        action: WS_AUTH_ACTION.SESSION_ERROR,
        sessionId: validated.sessionId,
        error: 'Voice verification failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
}

// Simplified voice confidence calculation
function calculateVoiceConfidence(features1: number[], features2: number[]): number {
  if (features1.length !== features2.length) {
    return 0;
  }
  
  const squaredDiff = features1.reduce((sum, val, i) => {
    return sum + Math.pow(val - features2[i], 2);
  }, 0);
  
  const rmse = Math.sqrt(squaredDiff / features1.length);
  const confidence = Math.max(0, Math.min(1, 1 - rmse));
  
  return confidence;
}

// Handle incoming WebSocket message
function handleWSMessage(ws: WebSocket, data: WebSocket.Data) {
  try {
    const message = JSON.parse(data.toString());
    
    switch (message.action) {
      case WS_AUTH_ACTION.AUTH_REQUEST:
        handleAuthRequest(ws, message);
        break;
      
      case WS_AUTH_ACTION.CHALLENGE_RESPONSE:
        handleChallengeResponse(ws, message);
        break;
      
      case WS_AUTH_ACTION.VOICE_VERIFY:
        handleVoiceVerify(ws, message);
        break;
      
      case WS_AUTH_ACTION.SESSION_CLOSE:
        if (message.sessionId) {
          closeSession(message.sessionId, 'Client requested close');
        }
        break;
      
      default:
        sendWS(ws, {
          action: WS_AUTH_ACTION.SESSION_ERROR,
          error: `Unknown action: ${message.action}`,
          timestamp: new Date().toISOString(),
        });
    }
  } catch (error) {
    console.error('[WS Auth] Message parse error:', error);
    sendWS(ws, {
      action: WS_AUTH_ACTION.SESSION_ERROR,
      error: 'Invalid message format',
      timestamp: new Date().toISOString(),
    });
  }
}

// Send heartbeat to all active sessions
function sendHeartbeat() {
  activeSessions.forEach((session, sessionId) => {
    sendWS(session.ws, {
      action: WS_AUTH_ACTION.HEARTBEAT,
      sessionId,
      timestamp: new Date().toISOString(),
    });
  });
}

// Cleanup expired sessions
function cleanupExpiredSessions() {
  const now = new Date();
  activeSessions.forEach((session, sessionId) => {
    const age = now.getTime() - session.challengeSentAt.getTime();
    if (age > SESSION_TIMEOUT) {
      closeSession(sessionId, 'Session expired');
    }
  });
}

// Setup WebSocket authentication server
export function setupWSAuthServer(wss: WebSocketServer) {
  // Start heartbeat interval
  const heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  
  // Start cleanup interval
  const cleanupInterval = setInterval(cleanupExpiredSessions, 60000);
  
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const sessionId = request.url?.split('?')[1] || crypto.randomUUID();
    
    console.log(`[WS Auth] Client connected (session: ${sessionId})`);
    
    // Handle incoming messages
    ws.on('message', (data) => handleWSMessage(ws, data));
    
    // Handle connection close
    ws.on('close', () => {
      console.log(`[WS Auth] Client disconnected (session: ${sessionId})`);
      if (activeSessions.has(sessionId)) {
        activeSessions.delete(sessionId);
      }
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`[WS Auth] WebSocket error (session: ${sessionId}):`, error);
      if (activeSessions.has(sessionId)) {
        activeSessions.delete(sessionId);
      }
    });
    
    // Send initial connection acknowledgment
    sendWS(ws, {
      action: WS_AUTH_ACTION.HEARTBEAT,
      sessionId,
      message: 'WebSocket authentication service connected',
      timestamp: new Date().toISOString(),
    });
  });
  
  // Cleanup on server close
  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(cleanupInterval);
    activeSessions.forEach((session) => {
      session.ws.close();
    });
    activeSessions.clear();
  });
}

// Get active session count
export function getActiveSessionCount(): number {
  return activeSessions.size;
}

// Get session info
export function getSessionInfo(sessionId: string): AuthSession | undefined {
  return activeSessions.get(sessionId);
}
