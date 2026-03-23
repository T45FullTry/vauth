export interface User {
  id: string;
  email: string;
  username: string;
  voicePrintId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  expiresIn: number;
}

export interface VoicePrint {
  id: string;
  userId: string;
  features: number[];
  createdAt: string;
  confidence?: number;
}

export interface EnrollmentRequest {
  email: string;
  username: string;
  password: string;
  voiceFeatures: number[];
}

export interface LoginRequest {
  email: string;
  password: string;
  voiceFeatures: number[];
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface VoiceRecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  audioBlob: Blob | null;
  voiceFeatures: number[] | null;
  confidence: number | null;
  error: string | null;
}

export interface APIError {
  message: string;
  code: string;
  status: number;
}
