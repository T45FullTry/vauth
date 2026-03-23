import axios, { AxiosError, AxiosResponse } from 'axios';
import type {
  User,
  AuthResponse,
  EnrollmentRequest,
  LoginRequest,
  VoicePrint,
  APIError,
} from '../types';

const API_BASE_URL = '/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<APIError>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  async register(data: EnrollmentRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/register', data);
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', data);
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },

  async logout(): Promise<void> {
    localStorage.removeItem('auth_token');
    await api.post('/auth/logout');
  },

  async getCurrentUser(): Promise<User> {
    const response = await api.get<User>('/auth/me');
    return response.data;
  },

  async refreshToken(): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/refresh');
    if (response.data.token) {
      localStorage.setItem('auth_token', response.data.token);
    }
    return response.data;
  },
};

export const voiceAPI = {
  async enrollVoice(voiceFeatures: number[]): Promise<VoicePrint> {
    const response = await api.post<VoicePrint>('/voice/enroll', {
      voiceFeatures,
    });
    return response.data;
  },

  async verifyVoice(voiceFeatures: number[]): Promise<{
    success: boolean;
    confidence: number;
    voicePrint: VoicePrint;
  }> {
    const response = await api.post('/voice/verify', { voiceFeatures });
    return response.data;
  },

  async getVoicePrint(): Promise<VoicePrint> {
    const response = await api.get<VoicePrint>('/voice/print');
    return response.data;
  },

  async deleteVoicePrint(): Promise<void> {
    await api.delete('/voice/print');
  },
};

export const userAPI = {
  async getProfile(): Promise<User> {
    const response = await api.get<User>('/users/profile');
    return response.data;
  },

  async updateProfile(data: Partial<User>): Promise<User> {
    const response = await api.put<User>('/users/profile', data);
    return response.data;
  },
};

export default api;
