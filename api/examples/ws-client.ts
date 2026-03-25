/**
 * Vauth WebSocket Client Example
 * 
 * Demonstrates challenge-response authentication via WebSocket
 * 
 * Usage: npx tsx examples/ws-client.ts
 */

import WebSocket from 'ws';
import readline from 'readline';

const WS_URL = process.env.WS_URL || 'ws://localhost:8081/ws/auth';
const EMAIL = process.env.TEST_EMAIL || 'test@example.com';

// Create readline for interactive input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Generate session ID
const sessionId = crypto.randomUUID();

console.log(`🔐 Vauth WebSocket Client`);
console.log(`   Email: ${EMAIL}`);
console.log(`   Session: ${sessionId}`);
console.log(`   WS URL: ${WS_URL}?session=${sessionId}\n`);

// Connect to WebSocket
const ws = new WebSocket(`${WS_URL}?session=${sessionId}`);

ws.on('open', () => {
  console.log('✅ Connected to Vauth WS\n');
  
  // Send authentication request
  console.log('📤 Sending auth_request...');
  ws.send(JSON.stringify({
    action: 'auth_request',
    email: EMAIL,
    sessionId,
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  console.log(`📥 Received: ${message.action}`);
  console.log(`   ${JSON.stringify(message, null, 2)}\n`);
  
  switch (message.action) {
    case 'auth_challenge':
      console.log(`🎯 Challenge: ${message.message}`);
      console.log('   Please enter the challenge response:');
      
      rl.question('> ', (response) => {
        console.log(`📤 Sending challenge_response...`);
        ws.send(JSON.stringify({
          action: 'challenge_response',
          sessionId,
          response: response.trim(),
        }));
      });
      break;
    
    case 'auth_result':
      if (message.token) {
        console.log('✅ Authentication successful!');
        console.log(`   Token: ${message.token.substring(0, 50)}...`);
        console.log(`   Confidence: ${(message.confidence! * 100).toFixed(1)}%`);
        
        // Optional: Test voice verification
        console.log('\n🎤 Test voice verification? (y/n)');
        rl.question('> ', (answer) => {
          if (answer.toLowerCase() === 'y') {
            // Simulate voice features (in real app, capture from mic)
            const voiceFeatures = Array.from({ length: 128 }, () => Math.random());
            
            console.log('📤 Sending voice_verify...');
            ws.send(JSON.stringify({
              action: 'voice_verify',
              sessionId,
              voiceFeatures,
            }));
          } else {
            cleanup();
          }
        });
      } else {
        console.log('❌ Authentication failed');
        console.log(`   Reason: ${message.message}`);
        console.log(`   Confidence: ${(message.confidence! * 100).toFixed(1)}%`);
        cleanup();
      }
      break;
    
    case 'session_error':
      console.log('❌ Session error');
      console.log(`   Error: ${message.error}`);
      cleanup();
      break;
    
    case 'heartbeat':
      console.log('💓 Heartbeat received');
      break;
    
    case 'session_closed':
      console.log('🚪 Session closed');
      console.log(`   Reason: ${message.message}`);
      cleanup();
      break;
  }
});

ws.on('close', () => {
  console.log('\n🔌 Disconnected from Vauth WS');
  cleanup();
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  cleanup();
});

function cleanup() {
  rl.close();
  ws.close();
  process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n⚠️  Interrupted');
  cleanup();
});
