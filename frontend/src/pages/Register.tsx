import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import VoiceRecorder from '../components/VoiceRecorder';
import type { EnrollmentRequest } from '../types';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
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

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!voiceFeatures) {
      setError('Please complete voice enrollment');
      return;
    }

    setIsLoading(true);

    try {
      const enrollmentData: EnrollmentRequest = {
        email: formData.email,
        username: formData.username,
        password: formData.password,
        voiceFeatures,
      };

      const response = await authAPI.register(enrollmentData);
      
      // Store token and redirect
      localStorage.setItem('auth_token', response.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: '500px' }}>
      <div className="card">
        <h1 className="text-center mb-6">Create Account</h1>

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
            <label className="label">Username</label>
            <input
              type="text"
              name="username"
              value={formData.username}
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

          <div>
            <label className="label">Confirm Password</label>
            <input
              type="password"
              name="confirmPassword"
              value={formData.confirmPassword}
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
                if (formData.password && formData.password === formData.confirmPassword) {
                  setStep(2);
                } else {
                  setError('Please fill all fields correctly');
                }
              }}
            >
              Next: Voice Enrollment
            </button>
          )}

          {step === 2 && (
            <div className="mt-4">
              <h2 className="mb-4">Voice Enrollment</h2>
              <p className="mb-4" style={{ color: '#6b7280' }}>
                Record your voice phrase. This will be used for future authentication.
                Please speak clearly and naturally.
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
                      Creating Account...
                    </>
                  ) : (
                    '✓ Complete Registration'
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
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#4f46e5', textDecoration: 'none' }}>
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Register;
