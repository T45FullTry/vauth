import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { authAPI, voiceAPI } from '../services/api';
import type { User, VoicePrint } from '../types';

export const Dashboard: React.FC = () => {
  const { user, logout, refreshUser } = useAuthStore();
  const [voicePrint, setVoicePrint] = useState<VoicePrint | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        await refreshUser();
        const print = await voiceAPI.getVoicePrint();
        setVoicePrint(print);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [refreshUser]);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  const handleReEnroll = async () => {
    try {
      // In a real app, this would trigger a new voice recording flow
      alert('Voice re-enrollment flow would start here');
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="container flex items-center justify-center" style={{ minHeight: '100vh' }}>
        <div className="card">
          <div className="flex items-center gap-2">
            <span className="loading"></span>
            <span>Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="flex justify-between items-center mb-6">
        <h1>Dashboard</h1>
        <button className="btn btn-danger" onClick={handleLogout}>
          Logout
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          {error}
        </div>
      )}

      <div className="card">
        <h2 className="mb-4">Profile</h2>
        <div style={{ display: 'grid', gap: '1rem', maxWidth: '400px' }}>
          <div>
            <label className="label">Username</label>
            <p style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: '0.375rem' }}>
              {user?.username}
            </p>
          </div>
          <div>
            <label className="label">Email</label>
            <p style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: '0.375rem' }}>
              {user?.email}
            </p>
          </div>
          <div>
            <label className="label">Member Since</label>
            <p style={{ padding: '0.75rem', background: '#f9fafb', borderRadius: '0.375rem' }}>
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4">Voice Authentication</h2>
        
        {voicePrint ? (
          <div>
            <div className="alert alert-success">
              ✓ Voice print enrolled successfully
            </div>
            
            <div style={{ marginTop: '1rem' }}>
              <p style={{ marginBottom: '0.5rem', color: '#6b7280' }}>
                Voice Print ID: <strong>{voicePrint.id}</strong>
              </p>
              <p style={{ marginBottom: '0.5rem', color: '#6b7280' }}>
                Created: <strong>{new Date(voicePrint.createdAt).toLocaleDateString()}</strong>
              </p>
            </div>

            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={handleReEnroll}
            >
              🔄 Re-enroll Voice
            </button>
          </div>
        ) : (
          <div>
            <div className="alert alert-warning">
              ⚠ No voice print enrolled
            </div>
            <p style={{ marginTop: '1rem', color: '#6b7280' }}>
              You need to enroll your voice to use voice authentication.
            </p>
            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={handleReEnroll}
            >
              🎤 Enroll Voice Now
            </button>
          </div>
        )}
      </div>

      <div className="card">
        <h2 className="mb-4">Security Settings</h2>
        <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
          Manage your authentication settings and voice print preferences.
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <button className="btn" style={{ background: '#f3f4f6', justifyContent: 'flex-start' }}>
            🔑 Change Password
          </button>
          <button className="btn" style={{ background: '#f3f4f6', justifyContent: 'flex-start' }}>
            📊 View Authentication Logs
          </button>
          <button className="btn" style={{ background: '#f3f4f6', justifyContent: 'flex-start' }}>
            🔔 Notification Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
