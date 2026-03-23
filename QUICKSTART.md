# Vauth Quick Start Guide

Get up and running in 5 minutes.

## Prerequisites Check

```bash
# Verify installations
node --version    # v18+ required
psql --version    # PostgreSQL 14+ required
git --version     # Git required
```

## 1. Clone & Navigate

```bash
cd Vauth
```

## 2. Database Setup

```bash
# Create database
psql -U postgres -c "CREATE DATABASE vauth;"

# Run migrations
psql -U postgres -d vauth -f database/migrations/001_initial_schema.sql
```

## 3. Backend Setup

```bash
cd api

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your DB password and generate JWT_SECRET

# Start server
npm run dev
```

**Expected output:**
```
╔═══════════════════════════════════════════════════════════╗
║                    Vauth API Server                        ║
║  Server running on: http://localhost:8080                 ║
╚═══════════════════════════════════════════════════════════╝
```

## 4. Frontend Setup

```bash
# Open new terminal
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Expected output:**
```
  VITE v5.0.8  ready in 500 ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

## 5. Test the Application

1. Open **http://localhost:3000** in browser
2. Click **Sign Up**
3. Fill registration form
4. Click **Next: Voice Enrollment**
5. Allow microphone access
6. Speak clearly for 5 seconds
7. Complete registration
8. You're in! 🎉

## Troubleshooting

### Database Connection Error

```bash
# Check PostgreSQL is running
pg_ctl status

# Start if needed
pg_ctl start
```

### Port Already in Use

```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9

# Or change PORT in api/.env
```

### Microphone Not Working

- Grant permission in browser
- Check microphone is connected
- Use HTTPS in production

## Next Steps

- Read `SETUP.md` for detailed documentation
- Read `ARCHITECTURE.md` for system design
- Customize voice confidence threshold
- Deploy to production

---

**Need help?** Check `SETUP.md` troubleshooting section.
