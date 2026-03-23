import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const updateProfileSchema = z.object({
  username: z.string().min(3).max(50).optional(),
  email: z.string().email().optional(),
});

// GET /users/profile
router.get('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await db.query(
      `SELECT id, email, username, voice_print_id, created_at, updated_at, last_login_at
       FROM users WHERE id = $1`,
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
    }
    
    const user = result.rows[0];
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      voicePrintId: user.voice_print_id,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      lastLoginAt: user.last_login_at,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get profile',
    });
  }
});

// PUT /users/profile
router.put('/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const validated = updateProfileSchema.parse(req.body);
    const userId = req.user!.id;
    
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    
    if (validated.username) {
      fields.push(`username = $${paramIndex}`);
      values.push(validated.username);
      paramIndex++;
    }
    
    if (validated.email) {
      // Check if email is already taken
      const existing = await db.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [validated.email, userId]
      );
      
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Conflict',
          message: 'Email already in use',
        });
      }
      
      fields.push(`email = $${paramIndex}`);
      values.push(validated.email);
      paramIndex++;
    }
    
    if (fields.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No fields to update',
      });
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);
    
    const result = await db.query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, email, username, created_at, updated_at`,
      values
    );
    
    const user = result.rows[0];
    
    res.json({
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors[0].message,
      });
    }
    
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update profile',
    });
  }
});

export default router;
