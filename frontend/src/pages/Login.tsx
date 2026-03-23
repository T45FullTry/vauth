import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import VoiceRecorder from '../components/VoiceRecorder';
import type { LoginRequest } from '../types';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [voiceFeatures, setVoiceFeatures] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleVoiceComplete = (features: number[]) => {
    setVoiceFeatures(features);
    setError(null);
  };

  const handleVoiceError = (errorMsg: string) => {
    setError(errorMsg);
    setVoiceFeatures(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!voiceFeatures) {
      setError('Please complete voice authentication');
      return;
    }

    setIsLoading(true);

    try {
      const loginData: LoginRequest = {
        email: formData.email,
        password: formData.password,
        voiceFeatures,
      };

      const response = await authAPI.login(loginData);
      
      // Store token and redirect
      localStorage.setItem('auth_token', response.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '500px' }}>
      <div className="card">
        <h1 className="text-center mb-6">Sign In</h1>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="input"
              required
              disabled={step === 2}
            />
          </div>

          <div>
            <label className="label">Password</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              className="input"
              required
              disabled={step === 2}
            />
          </div>

          {step === 1 && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '1rem' }}
              onClick={() => {
                if (formData.email && formData.password) {
                  setStep(2);
                } else {
                  setError('Please fill all fields');
                }
              }}
            >
              Next: Voice Authentication
            </button>
          )}

          {step === 2 && (
            <div className="mt-4">
              <h2 className="mb-4">Voice Authentication</h2>
              <p className="mb-4" style={{ color: '#6b7280' }}>
                Please speak your voice phrase to verify your identity.
              </p>

              <VoiceRecorder
                onComplete={handleVoiceComplete}
                onError={handleVoiceError}
                duration={5}
              />

              {voiceFeatures && (
                <button
                  type="submit"
                  className="btn btn-success"
                  style={{ width: '100%', marginTop: '1rem' }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="loading"></span>
                      Authenticating...
                    </>
                  ) : (
                    '✓ Sign In'
                  )}
                </button>
              )}

              <button
                type="button"
                className="btn"
                style={{ width: '100%', marginTop: '0.5rem', background: '#e5e7eb' }}
                onClick={() => setStep(1)}
                disabled={isLoading}
              >
                ← Back
              </button>
            </div>
          )}
        </form>

        <p className="text-center mt-6">
          Don't have an account?{' '}
          <Link to="/register" style={{ color: '#4f46e5', textDecoration: 'none' }}>
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
