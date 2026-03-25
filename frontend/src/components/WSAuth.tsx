import React, { useState, useEffect, useRef, useCallback } from 'react';

// WebSocket auth actions
enum WS_ACTION {
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

interface WSMessage {
  action: WS_ACTION;
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

interface WSAuthProps {
  wsUrl?: string;
  email: string;
  onComplete: (token: string, userId: string) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export const WSAuth: React.FC<WSAuthProps> = ({
  wsUrl = 'ws://localhost:8081/ws/auth',
  email,
  onComplete,
  onError,
  disabled = false,
}) => {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [userResponse, setUserResponse] = useState('');
  const [status, setStatus] = useState<'idle' | 'challenging' | 'verifying' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(0);
  const [attempts, setAttempts] = useState(0);

  // Generate session ID
  const sessionId = useRef(crypto.randomUUID()).current;

  // Connect to WebSocket
  useEffect(() => {
    if (disabled) return;

    const ws = new WebSocket(`${wsUrl}?session=${sessionId}`);

    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS Auth] Connected');
      setConnected(true);
      
      // Send auth request
      const msg: WSMessage = {
        action: WS_ACTION.AUTH_REQUEST,
        email,
        sessionId,
      };
      ws.send(JSON.stringify(msg));
      setStatus('challenging');
      setMessage('Waiting for challenge...');
    };

    ws.onmessage = (event) => {
      const data: WSMessage = JSON.parse(event.data.toString());
      handleMessage(data);
    };

    ws.onclose = () => {
      console.log('[WS Auth] Disconnected');
      setConnected(false);
      if (status !== 'success') {
        setStatus('error');
        setMessage('Connection lost');
      }
    };

    ws.onerror = (error) => {
      console.error('[WS Auth] Error:', error);
      setStatus('error');
      setMessage('WebSocket error');
      onError('WebSocket connection failed');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [email, wsUrl, disabled, onError]);

  // Handle incoming messages
  const handleMessage = useCallback((data: WSMessage) => {
    console.log('[WS Auth] Message:', data);

    switch (data.action) {
      case WS_ACTION.AUTH_CHALLENGE:
        setChallenge(data.message || null);
        setStatus('challenging');
        setMessage(`Challenge: ${data.message}`);
        setAttempts(0);
        break;

      case WS_ACTION.AUTH_RESULT:
        if (data.token) {
          setStatus('success');
          setMessage(data.message || 'Authentication successful');
          setConfidence(data.confidence || 0);
          onComplete(data.token, data.userId || '');
        } else {
          setStatus('error');
          setMessage(data.message || 'Authentication failed');
          setConfidence(data.confidence || 0);
          onError(data.message || 'Authentication failed');
        }
        break;

      case WS_ACTION.SESSION_ERROR:
        setStatus('error');
        setMessage(data.error || 'Session error');
        setAttempts((prev) => prev + 1);
        onError(data.error || 'Session error');
        
        // If not max attempts, challenge will be resent
        break;

      case WS_ACTION.SESSION_CLOSED:
        setStatus('error');
        setMessage(data.message || 'Session closed');
        onError(data.message || 'Session closed');
        break;

      case WS_ACTION.HEARTBEAT:
        console.log('[WS Auth] Heartbeat');
        break;
    }
  }, [onComplete, onError]);

  // Submit challenge response
  const submitChallenge = () => {
    if (!userResponse || !wsRef.current) return;

    const msg: WSMessage = {
      action: WS_ACTION.CHALLENGE_RESPONSE,
      sessionId,
      response: userResponse.trim(),
    };

    wsRef.current.send(JSON.stringify(msg));
    setUserResponse('');
    setStatus('verifying');
    setMessage('Verifying challenge...');
  };

  // Submit voice verification (optional, after challenge success)
  const submitVoiceVerify = (voiceFeatures: number[]) => {
    if (!wsRef.current) return;

    const msg: WSMessage = {
      action: WS_ACTION.VOICE_VERIFY,
      sessionId,
      voiceFeatures,
    };

    wsRef.current.send(JSON.stringify(msg));
    setStatus('verifying');
    setMessage('Verifying voice...');
  };

  // Close session
  const closeSession = () => {
    if (!wsRef.current) return;

    const msg: WSMessage = {
      action: WS_ACTION.SESSION_CLOSE,
      sessionId,
    };

    wsRef.current.send(JSON.stringify(msg));
    setStatus('idle');
    setMessage('');
  };

  // Render
  if (disabled) {
    return (
      <div className="card" style={{ padding: '1.5rem' }}>
        <p style={{ color: '#6b7280' }}>WebSocket authentication is disabled</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>
          🔐 Remote Authentication
        </h3>
        <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>
          Session: {sessionId.substring(0, 8)}...
        </p>
      </div>

      {/* Connection Status */}
      <div style={{ 
        padding: '0.75rem', 
        borderRadius: '0.5rem', 
        background: connected ? '#dcfce7' : '#fee2e2',
        marginBottom: '1rem',
        fontSize: '0.875rem',
      }}>
        {connected ? '✅ Connected' : '❌ Disconnected'}
      </div>

      {/* Status Messages */}
      {message && (
        <div style={{ 
          padding: '0.75rem', 
          borderRadius: '0.5rem',
          background: status === 'error' ? '#fee2e2' : 
                     status === 'success' ? '#dcfce7' : '#e0f2fe',
          marginBottom: '1rem',
          fontSize: '0.875rem',
        }}>
          {message}
          {confidence > 0 && (
            <div style={{ marginTop: '0.25rem', fontWeight: '600' }}>
              Confidence: {(confidence * 100).toFixed(1)}%
            </div>
          )}
        </div>
      )}

      {/* Challenge Input */}
      {status === 'challenging' && challenge && (
        <div>
          <label className="label" style={{ fontWeight: '600', marginBottom: '0.5rem' }}>
            Challenge Response
          </label>
          <div style={{ 
            padding: '1rem', 
            background: '#f3f4f6', 
            borderRadius: '0.5rem',
            marginBottom: '0.75rem',
            fontSize: '1.25rem',
            fontWeight: '700',
            letterSpacing: '0.25rem',
            textAlign: 'center',
          }}>
            {challenge}
          </div>
          <input
            type="text"
            value={userResponse}
            onChange={(e) => setUserResponse(e.target.value.toUpperCase())}
            className="input"
            placeholder="Enter challenge"
            style={{ textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.25rem' }}
            onKeyPress={(e) => e.key === 'Enter' && submitChallenge()}
            disabled={status !== 'challenging'}
          />
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            onClick={submitChallenge}
            disabled={!userResponse}
          >
            Verify Challenge
          </button>
          {attempts > 0 && (
            <p style={{ 
              color: '#dc2626', 
              fontSize: '0.75rem', 
              marginTop: '0.5rem',
              textAlign: 'center',
            }}>
              Attempt {attempts}/3
            </p>
          )}
        </div>
      )}

      {/* Success State */}
      {status === 'success' && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✅</div>
          <p style={{ fontWeight: '600', color: '#16a34a' }}>
            Authentication Successful
          </p>
        </div>
      )}

      {/* Error State */}
      {status === 'error' && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>❌</div>
          <p style={{ fontWeight: '600', color: '#dc2626' }}>
            {message}
          </p>
          {attempts >= 3 && (
            <p style={{ color: '#dc2626', fontSize: '0.75rem', marginTop: '0.5rem' }}>
              Maximum attempts reached. Please restart.
            </p>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
        {(status === 'success' || status === 'error') && (
          <button
            className="btn"
            style={{ flex: 1, background: '#e5e7eb' }}
            onClick={closeSession}
          >
            Close Session
          </button>
        )}
        {status === 'error' && attempts < 3 && (
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => {
              setStatus('challenging');
              setMessage('Waiting for new challenge...');
            }}
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
};

export default WSAuth;
