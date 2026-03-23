import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRY = '24h';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  voiceFeatures: z.array(z.number()),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  voiceFeatures: z.array(z.number()),
});

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const validated = registerSchema.parse(req.body);
    
    // Check if user already exists
    const existingUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [validated.email]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User with this email already exists',
      });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, 10);
    
    // Create user
    const userResult = await db.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email, username, created_at`,
      [validated.email, validated.username, passwordHash]
    );
    
    const user = userResult.rows[0];
    
    // Create voice print
    const voicePrintResult = await db.query(
      `INSERT INTO voice_prints (user_id, features)
       VALUES ($1, $2)
       RETURNING id, created_at`,
      [user.id, JSON.stringify(validated.voiceFeatures)]
    );
    
    const voicePrint = voicePrintResult.rows[0];
    
    // Update user with voice print reference
    await db.query(
      'UPDATE users SET voice_print_id = $1 WHERE id = $2',
      [voicePrint.id, user.id]
    );
    
    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        voicePrintId: voicePrint.id,
        createdAt: user.created_at,
      },
      expiresIn: 86400, // 24 hours in seconds
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors[0].message,
      });
    }
    
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to register user',
    });
  }
});

// POST /auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validated = loginSchema.parse(req.body);
    
    // Get user by email
    const userResult = await db.query(
      'SELECT * FROM users WHERE email = $1 AND is_active = true',
      [validated.email]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }
    
    const user = userResult.rows[0];
    
    // Verify password
    const passwordValid = await bcrypt.compare(validated.password, user.password_hash);
    
    if (!passwordValid) {
      // Log failed attempt
      await db.query(
        `INSERT INTO auth_attempts (user_id, success, failure_reason, ip_address, user_agent)
         VALUES ($1, false, 'Invalid password', $2, $3)`,
        [user.id, req.ip, req.headers['user-agent']]
      );
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }
    
    // Get voice print
    const voicePrintResult = await db.query(
      'SELECT features, confidence_threshold FROM voice_prints WHERE user_id = $1 AND is_active = true',
      [user.id]
    );
    
    if (voicePrintResult.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Voice print not found',
      });
    }
    
    const voicePrint = voicePrintResult.rows[0];
    const storedFeatures = voicePrint.features as number[];
    
    // Compare voice features (simplified - in production, use proper ML comparison)
    const confidence = calculateVoiceConfidence(validated.voiceFeatures, storedFeatures);
    const threshold = parseFloat(voicePrint.confidence_threshold);
    
    if (confidence < threshold) {
      // Log failed attempt
      await db.query(
        `INSERT INTO auth_attempts (user_id, success, confidence_score, failure_reason, ip_address, user_agent)
         VALUES ($1, false, $2, 'Voice mismatch', $3, $4)`,
        [user.id, confidence, req.ip, req.headers['user-agent']]
      );
      
      return res.status(401).json({
        error: 'Unauthorized',
        message: `Voice authentication failed (confidence: ${(confidence * 100).toFixed(1)}%)`,
      });
    }
    
    // Log successful attempt
    await db.query(
      `INSERT INTO auth_attempts (user_id, success, confidence_score, ip_address, user_agent)
       VALUES ($1, true, $2, $3, $4)`,
      [user.id, confidence, req.ip, req.headers['user-agent']]
    );
    
    // Update last login
    await db.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [user.id]
    );
    
    // Generate JWT token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        voicePrintId: user.voice_print_id,
        createdAt: user.created_at,
      },
      expiresIn: 86400,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors[0].message,
      });
    }
    
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to authenticate',
    });
  }
});

// GET /auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const userResult = await db.query(
      'SELECT id, email, username, voice_print_id, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }
    
    const user = userResult.rows[0];
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      voicePrintId: user.voice_print_id,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get user',
    });
  }
});

// POST /auth/logout
router.post('/logout', authenticate, async (req: AuthRequest, res: Response) => {
  // In a real app, you'd invalidate the token in the sessions table
  res.json({ message: 'Logged out successfully' });
});

// POST /auth/refresh
router.post('/refresh', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user!;
    
    const newToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
    
    res.json({
      token: newToken,
      user,
      expiresIn: 86400,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to refresh token',
    });
  }
});

// Simplified voice confidence calculation
// In production, replace with proper ML-based voice comparison
function calculateVoiceConfidence(features1: number[], features2: number[]): number {
  if (features1.length !== features2.length) {
    return 0;
  }
  
  const squaredDiff = features1.reduce((sum, val, i) => {
    return sum + Math.pow(val - features2[i], 2);
  }, 0);
  
  const rmse = Math.sqrt(squaredDiff / features1.length);
  
  // Convert RMSE to confidence (lower RMSE = higher confidence)
  const confidence = Math.max(0, Math.min(1, 1 - rmse));
  
  return confidence;
}

export default router;
