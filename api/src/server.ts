import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth.js';
import voiceRoutes from './routes/voice.js';
import userRoutes from './routes/users.js';
import { setupWSAuthServer } from './websocket/auth.js';
import { applyAPIRateLimit, startRateLimitCleanup } from './middleware/rateLimit.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;
const WS_PORT = process.env.WS_PORT || 8081;

// Create HTTP server
const httpServer = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  port: parseInt(WS_PORT.toString()),
  path: '/ws/auth',
});

// Setup WebSocket authentication
setupWSAuthServer(wss);

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Apply global API rate limiting
app.use('/api', applyAPIRateLimit());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/voice', voiceRoutes);
app.use('/api/users', userRoutes);

// Rate limit monitoring endpoint
app.get('/api/monitoring/rate-limit', async (req, res) => {
  const { getRateLimitStats } = await import('./middleware/rateLimit.js');
  const stats = await getRateLimitStats();
  
  if (stats) {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      stats,
    });
  } else {
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch rate limit stats',
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// Serve static files from React frontend (in production)
if (process.env.NODE_ENV === 'production') {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendPath));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
  });
});

// Start rate limit cleanup
startRateLimitCleanup();

// Start server
httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    Vauth API Server                        ║
╠═══════════════════════════════════════════════════════════╣
║  REST API:    http://localhost:${PORT}                       ║
║  WebSocket:   ws://localhost:${WS_PORT}/ws/auth              ║
║  Environment: ${process.env.NODE_ENV || 'development'}                           ║
║  Database:    ${process.env.DB_NAME || 'vauth'}                                     ║
╠═══════════════════════════════════════════════════════════╣
║  REST API Endpoints:                                       ║
║  POST /api/auth/register   - User registration            ║
║  POST /api/auth/login      - User login                   ║
║  GET  /api/auth/me         - Get current user             ║
║  POST /api/auth/logout     - User logout                  ║
║  POST /api/auth/refresh    - Refresh token                ║
║  POST /api/voice/enroll    - Enroll voice print           ║
║  POST /api/voice/verify    - Verify voice                 ║
║  GET  /api/voice/print     - Get voice print              ║
║  DELETE /api/voice/print   - Delete voice print           ║
║  GET  /api/users/profile   - Get user profile             ║
║  PUT  /api/users/profile   - Update profile               ║
╠═══════════════════════════════════════════════════════════╣
║  WebSocket Actions:                                        ║
║  auth_request       - Start auth session                  ║
║  challenge_response - Respond to challenge                ║
║  voice_verify       - Verify voice biometric              ║
║  session_close      - Close session                       ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
