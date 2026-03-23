import { Router, Response } from 'express';
import { z } from 'zod';
import db from '../db/index.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

const voiceFeatureSchema = z.object({
  voiceFeatures: z.array(z.number()),
});

// POST /voice/enroll - Enroll new voice print (for existing users without voice print)
router.post('/enroll', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const validated = voiceFeatureSchema.parse(req.body);
    const userId = req.user!.id;
    
    // Check if user already has a voice print
    const existingPrint = await db.query(
      'SELECT id FROM voice_prints WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    if (existingPrint.rows.length > 0) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User already has an enrolled voice print',
      });
    }
    
    // Create new voice print
    const result = await db.query(
      `INSERT INTO voice_prints (user_id, features)
       VALUES ($1, $2)
       RETURNING id, user_id, features, created_at`,
      [userId, JSON.stringify(validated.voiceFeatures)]
    );
    
    const voicePrint = result.rows[0];
    
    // Update user reference
    await db.query(
      'UPDATE users SET voice_print_id = $1 WHERE id = $2',
      [voicePrint.id, userId]
    );
    
    res.status(201).json({
      id: voicePrint.id,
      userId: voicePrint.user_id,
      features: voicePrint.features,
      createdAt: voicePrint.created_at,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors[0].message,
      });
    }
    
    console.error('Voice enrollment error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to enroll voice',
    });
  }
});

// POST /voice/verify - Verify voice against stored print
router.post('/verify', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const validated = voiceFeatureSchema.parse(req.body);
    const userId = req.user!.id;
    
    // Get user's voice print
    const printResult = await db.query(
      'SELECT id, features, confidence_threshold FROM voice_prints WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    if (printResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No voice print enrolled for this user',
      });
    }
    
    const voicePrint = printResult.rows[0];
    const storedFeatures = voicePrint.features as number[];
    const threshold = parseFloat(voicePrint.confidence_threshold);
    
    // Calculate confidence score
    const confidence = calculateVoiceConfidence(validated.voiceFeatures, storedFeatures);
    
    const success = confidence >= threshold;
    
    // Log the attempt
    await db.query(
      `INSERT INTO auth_attempts (user_id, success, confidence_score, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, success, confidence, req.ip, req.headers['user-agent']]
    );
    
    res.json({
      success,
      confidence,
      voicePrint: {
        id: voicePrint.id,
        createdAt: voicePrint.created_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.errors[0].message,
      });
    }
    
    console.error('Voice verification error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify voice',
    });
  }
});

// GET /voice/print - Get current user's voice print info
router.get('/print', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const result = await db.query(
      'SELECT id, user_id, feature_version, confidence_threshold, created_at, updated_at FROM voice_prints WHERE user_id = $1 AND is_active = true',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No voice print enrolled',
      });
    }
    
    const voicePrint = result.rows[0];
    
    res.json({
      id: voicePrint.id,
      userId: voicePrint.user_id,
      featureVersion: voicePrint.feature_version,
      confidenceThreshold: voicePrint.confidence_threshold,
      createdAt: voicePrint.created_at,
      updatedAt: voicePrint.updated_at,
    });
  } catch (error) {
    console.error('Get voice print error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get voice print',
    });
  }
});

// DELETE /voice/print - Delete voice print
router.delete('/print', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    
    // Soft delete - mark as inactive
    await db.query(
      'UPDATE voice_prints SET is_active = false WHERE user_id = $1',
      [userId]
    );
    
    // Clear user reference
    await db.query(
      'UPDATE users SET voice_print_id = NULL WHERE id = $1',
      [userId]
    );
    
    res.json({
      message: 'Voice print deleted successfully',
    });
  } catch (error) {
    console.error('Delete voice print error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to delete voice print',
    });
  }
});

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

export default router;
