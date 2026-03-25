import { Request, Response, NextFunction } from 'express';
import db from '../db/index.js';

// Rate limit configuration
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  message: string;       // Error message when exceeded
  skipSuccessfulRequests?: boolean; // Don't count successful responses
}

// In-memory store for rate limiting (use Redis in production)
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

// Default configs
export const AUTH_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10,          // 10 attempts
  message: 'Too many authentication attempts, please try again later',
};

export const WS_RATE_LIMIT: RateLimitConfig = {
  windowMs: 5 * 60 * 1000,  // 5 minutes
  maxRequests: 20,          // 20 WS connections
  message: 'Too many WebSocket connection attempts',
};

export const API_RATE_LIMIT: RateLimitConfig = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,         // 100 requests
  message: 'Too many requests, please slow down',
};

// Get client identifier (IP + fingerprint)
function getClientId(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || '';
  // Create simple fingerprint
  const fingerprint = `${ip}:${userAgent}`;
  return fingerprint;
}

// Check rate limit
function checkRateLimit(
  clientId: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitStore.get(clientId);

  if (!entry || now > entry.resetAt) {
    // New window
    const newEntry: RateLimitEntry = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    rateLimitStore.set(clientId, newEntry);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= config.maxRequests) {
    // Limit exceeded
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count += 1;
  rateLimitStore.set(clientId, entry);

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// Log rate limit event to database
async function logRateLimitEvent(
  clientId: string,
  endpoint: string,
  allowed: boolean,
  remaining: number
) {
  try {
    await db.query(
      `INSERT INTO rate_limit_logs (client_id, endpoint, allowed, remaining, timestamp)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
      [clientId, endpoint, allowed, remaining]
    );
  } catch (error) {
    console.error('[Rate Limit] Log error:', error);
  }
}

// Rate limit middleware factory
export function rateLimitMiddleware(config: RateLimitConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const clientId = getClientId(req);
    const endpoint = req.path;
    
    const result = checkRateLimit(clientId, config);

    // Set rate limit headers
    res.set('X-RateLimit-Limit', config.maxRequests.toString());
    res.set('X-RateLimit-Remaining', result.remaining.toString());
    res.set('X-RateLimit-Reset', result.resetAt.toString());

    // Log event
    logRateLimitEvent(clientId, endpoint, result.allowed, result.remaining);

    if (!result.allowed) {
      // Log to auth_attempts if auth endpoint
      if (endpoint.includes('/auth')) {
        try {
          await db.query(
            `INSERT INTO auth_attempts (success, failure_reason, ip_address, user_agent)
             VALUES (false, 'Rate limit exceeded', $1, $2)`,
            [req.ip, req.headers['user-agent']]
          );
        } catch (error) {
          console.error('[Rate Limit] Auth log error:', error);
        }
      }

      console.log(`[Rate Limit] Blocked: ${clientId} on ${endpoint}`);
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message: config.message,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
      });
    }

    next();
  };
}

// Apply rate limit to specific routes
export function applyAuthRateLimit() {
  return rateLimitMiddleware(AUTH_RATE_LIMIT);
}

export function applyWSRateLimit() {
  return rateLimitMiddleware(WS_RATE_LIMIT);
}

export function applyAPIRateLimit() {
  return rateLimitMiddleware(API_RATE_LIMIT);
}

// Get rate limit status for monitoring
export async function getRateLimitStats() {
  try {
    const stats = await db.query(`
      SELECT 
        endpoint,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE allowed = false) as blocked_requests,
        COUNT(*) FILTER (WHERE allowed = true) as allowed_requests,
        MAX(timestamp) as last_request,
        AVG(remaining) as avg_remaining
      FROM rate_limit_logs
      WHERE timestamp > NOW() - INTERVAL '1 hour'
      GROUP BY endpoint
      ORDER BY blocked_requests DESC
    `);

    return {
      total: stats.rows.reduce((sum, row) => sum + parseInt(row.total_requests), 0),
      blocked: stats.rows.reduce((sum, row) => sum + parseInt(row.blocked_requests), 0),
      endpoints: stats.rows.map((row) => ({
        endpoint: row.endpoint,
        total: parseInt(row.total_requests),
        blocked: parseInt(row.blocked_requests),
        allowed: parseInt(row.allowed_requests),
        blockRate: (parseInt(row.blocked_requests) / parseInt(row.total_requests) * 100).toFixed(2),
        lastRequest: row.last_request,
      })),
    };
  } catch (error) {
    console.error('[Rate Limit] Stats error:', error);
    return null;
  }
}

// Cleanup old entries (call periodically)
export function cleanupRateLimitStore() {
  const now = Date.now();
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  });
}

// Start cleanup interval
export function startRateLimitCleanup(intervalMs = 300000) { // 5 minutes
  setInterval(cleanupRateLimitStore, intervalMs);
  console.log('[Rate Limit] Cleanup interval started');
}
