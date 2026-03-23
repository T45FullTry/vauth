# Vauth Setup Guide

Complete setup instructions for the voice authentication system with React frontend and PostgreSQL storage.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Database Setup](#database-setup)
3. [Backend API Setup](#backend-api-setup)
4. [Frontend Setup](#frontend-setup)
5. [Running the Application](#running-the-application)
6. [Testing](#testing)
7. [Production Deployment](#production-deployment)

---

## Prerequisites

### Required Software

- **Node.js** v18+ (LTS recommended)
  - Install: https://nodejs.org/
  - Verify: `node --version`

- **PostgreSQL** v14+
  - Install: https://www.postgresql.org/download/
  - Verify: `psql --version`

- **Rust** v1.70+ (for the Rust backend)
  - Install: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - Verify: `rustc --version`

- **Git**
  - Verify: `git --version`

### Optional Tools

- **Docker** (for containerized deployment)
- **pgAdmin** or **DBeaver** (database management)
- **Postman** or **Insomnia** (API testing)

---

## Database Setup

### 1. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE vauth;

# Create user (optional, for production)
CREATE USER vauth_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE vauth TO vauth_user;

# Exit psql
\q
```

### 2. Run Migrations

```bash
cd Vauth

# Option A: Using the migration script
cd api
npm run migrate

# Option B: Manual SQL execution
psql -U postgres -d vauth -f database/migrations/001_initial_schema.sql
```

### 3. Verify Schema

```bash
psql -U postgres -d vauth

# List tables
\dt

# Describe tables
\d users
\d voice_prints
\d auth_attempts

# Exit
\q
```

---

## Backend API Setup

### 1. Install Dependencies

```bash
cd Vauth/api
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env with your values
nano .env  # or use your preferred editor
```

**Required Environment Variables:**

```env
PORT=8080
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vauth
DB_USER=postgres
DB_PASSWORD=your_password
JWT_SECRET=generate_secure_random_string
CORS_ORIGIN=http://localhost:3000
```

**Generate JWT Secret:**

```bash
# Linux/macOS
openssl rand -base64 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start Development Server

```bash
# Development mode with auto-reload
npm run dev

# Or build and run
npm run build
npm start
```

**Verify API is running:**

```bash
curl http://localhost:8080/api/health
# Expected: {"status":"healthy","timestamp":"...","version":"1.0.0"}
```

---

## Frontend Setup

### 1. Install Dependencies

```bash
cd Vauth/frontend
npm install
```

### 2. Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit if needed (defaults work for local development)
nano .env
```

**Environment Variables:**

```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_APP_NAME=Vauth
VITE_RECORDING_DURATION=5
VITE_SAMPLE_RATE=44100
```

### 3. Start Development Server

```bash
# Development mode with hot reload
npm run dev
```

**Access the application:**

- Open http://localhost:3000 in your browser
- You should see the login page

---

## Running the Application

### Development Mode

**Terminal 1 - Backend API:**

```bash
cd Vauth/api
npm run dev
```

**Terminal 2 - Frontend:**

```bash
cd Vauth/frontend
npm run dev
```

**Terminal 3 - Rust Backend (optional):**

```bash
cd Vauth
cargo build --release
```

### Production Mode

```bash
# Build frontend
cd Vauth/frontend
npm run build

# Build backend
cd Vauth/api
npm run build

# Start production server
cd Vauth/api
NODE_ENV=production npm start
```

---

## Testing

### API Testing

```bash
# Test health endpoint
curl http://localhost:8080/api/health

# Register new user
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "password123",
    "voiceFeatures": [0.1, 0.2, 0.3, 0.4, 0.5]
  }'

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "voiceFeatures": [0.1, 0.2, 0.3, 0.4, 0.5]
  }'
```

### Frontend Testing

```bash
cd Vauth/frontend

# Run linter
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

### Manual Testing Flow

1. **Navigate to** http://localhost:3000
2. **Click** "Sign Up" to register
3. **Fill** registration form:
   - Email
   - Username
   - Password
   - Confirm password
4. **Click** "Next: Voice Enrollment"
5. **Allow** microphone access when prompted
6. **Speak** clearly during the 5-second recording
7. **Wait** for processing
8. **Click** "Complete Registration"
9. **You're redirected** to dashboard

**Login Flow:**

1. **Navigate** to login page
2. **Enter** credentials
3. **Click** "Next: Voice Authentication"
4. **Speak** the same phrase
5. **Click** "Sign In"

---

## Production Deployment

### Environment Configuration

Update `.env` files with production values:

**Backend (.env):**

```env
NODE_ENV=production
PORT=8080
DB_HOST=your-db-host
DB_NAME=vauth
DB_USER=vauth_user
DB_PASSWORD=secure_production_password
JWT_SECRET=very_long_secure_random_string_32_chars_minimum
CORS_ORIGIN=https://your-domain.com
```

**Frontend (.env):**

```env
VITE_API_BASE_URL=https://api.your-domain.com
```

### Docker Deployment (Optional)

```bash
# Build Docker image
docker build -t vauth-api ./api

# Run container
docker run -d \
  -p 8080:8080 \
  -e DB_HOST=your-db \
  -e DB_PASSWORD=secure \
  -e JWT_SECRET=secure \
  --name vauth \
  vauth-api
```

### Security Checklist

- [ ] Use HTTPS in production
- [ ] Set secure JWT secrets
- [ ] Enable rate limiting
- [ ] Configure CORS properly
- [ ] Use environment variables (no secrets in code)
- [ ] Enable database SSL
- [ ] Set up backup strategy
- [ ] Monitor authentication attempts
- [ ] Implement account lockout after failed attempts

---

## Troubleshooting

### Common Issues

**1. Database Connection Failed**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**
- Ensure PostgreSQL is running: `pg_ctl status`
- Check credentials in `.env`
- Verify database exists: `psql -l`

**2. Microphone Access Denied**

```
NotAllowedError: Permission denied
```

**Solution:**
- Grant microphone permission in browser
- Use HTTPS (required for getUserMedia in production)
- Check browser compatibility

**3. CORS Errors**

```
Access to fetch has been blocked by CORS policy
```

**Solution:**
- Update `CORS_ORIGIN` in backend `.env`
- Ensure frontend URL matches exactly
- Restart backend server

**4. Voice Features Mismatch**

```
Voice authentication failed (confidence: 45%)
```

**Solution:**
- Speak more clearly
- Reduce background noise
- Use same phrase as enrollment
- Adjust threshold in database if needed

**5. Token Expired**

```
Unauthorized: Invalid or expired token
```

**Solution:**
- Clear localStorage: `localStorage.removeItem('auth_token')`
- Re-login
- Check JWT_EXPIRY setting

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    (React + TypeScript)                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Register   │  │    Login     │  │  Dashboard   │       │
│  │    Page      │  │    Page      │  │    Page      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │         VoiceRecorder Component                  │       │
│  │  - Web Audio API                                 │       │
│  │  - Real-time visualization                       │       │
│  │  - Feature extraction                            │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP/JSON
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         API Layer                            │
│                    (Node.js + Express)                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    Auth      │  │    Voice     │  │    Users     │       │
│  │   Routes     │  │   Routes     │  │   Routes     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │              Middleware Layer                    │       │
│  │  - JWT Authentication                            │       │
│  │  - Input Validation (Zod)                        │       │
│  │  - Error Handling                                │       │
│  └──────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │ SQL
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        PostgreSQL                            │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │    users     │  │ voice_prints │  │auth_attempts │       │
│  │   table      │  │   table      │  │   table      │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐                         │
│  │  sessions    │  │  indexes     │                         │
│  │   table      │  │  & triggers  │                         │
│  └──────────────┘  └──────────────┘                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review API logs: `tail -f api/logs/*.log`
3. Check database logs: PostgreSQL log directory
4. Open an issue on the repository

---

**Vauth** - Secure voice authentication for the modern age.
