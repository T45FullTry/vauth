# Vauth Frontend

React-based voice authentication user interface.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
# http://localhost:3000
```

## Features

- **User Registration** - Create account with voice enrollment
- **Voice Login** - Authenticate with voice + password
- **Dashboard** - User profile and voice print management
- **Real-time Visualization** - Audio waveform display
- **Responsive Design** - Mobile-friendly UI

## Tech Stack

- React 18 + TypeScript
- Vite (build tool)
- Zustand (state management)
- React Router (routing)
- Axios (HTTP client)
- Web Audio API (voice capture)

## Project Structure

```
frontend/
├── src/
│   ├── components/      # Reusable UI components
│   │   ├── VoiceRecorder.tsx
│   │   ├── WaveformDisplay.tsx
│   │   └── ProtectedRoute.tsx
│   ├── pages/           # Page components
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   └── Dashboard.tsx
│   ├── hooks/           # Custom React hooks
│   │   └── useVoiceRecorder.ts
│   ├── services/        # API clients
│   │   └── api.ts
│   ├── store/           # State stores
│   │   └── authStore.ts
│   ├── types/           # TypeScript types
│   │   └── index.ts
│   ├── App.tsx          # Root component
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles
├── public/              # Static assets
├── index.html           # HTML template
├── package.json         # Dependencies
├── tsconfig.json        # TypeScript config
└── vite.config.ts       # Vite config
```

## Available Scripts

```bash
# Development
npm run dev          # Start dev server

# Production
npm run build        # Build for production
npm run preview      # Preview production build

# Code Quality
npm run lint         # Run ESLint
```

## Voice Recording Flow

1. User clicks "Start Recording"
2. 3-second countdown
3. 5-second voice capture
4. Audio processing (feature extraction)
5. Features sent to backend for storage/verification

## State Management

**Auth Store (Zustand):**
- `user` - Current user data
- `token` - JWT token
- `isAuthenticated` - Auth status
- `isLoading` - Loading state

**Local Component State:**
- Form inputs
- Recording status
- Error messages

## API Integration

All API calls go through `src/services/api.ts`:

```typescript
// Register
await authAPI.register({ email, username, password, voiceFeatures })

// Login
await authAPI.login({ email, password, voiceFeatures })

// Get current user
const user = await authAPI.getCurrentUser()

// Logout
await authAPI.logout()
```

## Styling

Uses CSS variables and utility classes in `index.css`:

```css
--primary-color: #4f46e5
--success-color: #10b981
--error-color: #ef4444
```

## Browser Support

- Chrome 80+
- Firefox 75+
- Safari 14+
- Edge 80+

**Required:** Web Audio API, getUserMedia support

## Environment Variables

Create `.env` file:

```env
VITE_API_BASE_URL=http://localhost:8080/api
VITE_RECORDING_DURATION=5
VITE_SAMPLE_RATE=44100
```

## Testing

```bash
# Run tests (to be implemented)
npm test

# E2E tests (to be implemented)
npm run test:e2e
```

## Deployment

```bash
# Build
npm run build

# Deploy dist/ to static host
# (Vercel, Netlify, S3, etc.)
```

## Security Notes

- HTTPS required for microphone access in production
- Tokens stored in localStorage (consider httpOnly cookies for production)
- Input validation on all forms
- XSS prevention via React auto-escaping

## Known Limitations

- Client-side voice feature extraction is simplified
- Production should use backend ML processing
- No offline support yet
- No accessibility testing completed

## Contributing

1. Create feature branch
2. Make changes
3. Run linter
4. Test manually
5. Submit PR

---

For full documentation, see `SETUP.md` in the project root.
