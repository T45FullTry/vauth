import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

interface RateLimitStats {
  total: number;
  blocked: number;
  endpoints: Array<{
    endpoint: string;
    total: number;
    blocked: number;
    allowed: number;
    blockRate: string;
    lastRequest: string;
  }>;
}

interface MonitoringData {
  status: 'ok' | 'error';
  timestamp: string;
  stats: RateLimitStats | null;
}

export const RateLimitMonitoring: React.FC = () => {
  const [data, setData] = useState<MonitoringData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch rate limit stats
  const fetchStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await api.get('/monitoring/rate-limit');
      setData(response.data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch monitoring data');
    } finally {
      setLoading(false);
    }
  };

  // Initial load
  useEffect(() => {
    fetchStats();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchStats();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  if (loading && !data) {
    return (
      <div className="card" style={{ padding: '2rem', textAlign: 'center' }}>
        <span className="loading"></span>
        <p>Loading monitoring data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: '2rem' }}>
        <h3>⚠️ Monitoring Error</h3>
        <p style={{ color: '#dc2626' }}>{error}</p>
        <button className="btn btn-primary" onClick={fetchStats}>
          Retry
        </button>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className="card" style={{ padding: '2rem' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem',
      }}>
        <h2 style={{ margin: 0 }}>📊 Rate Limit Monitoring</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label style={{ fontSize: '0.875rem', color: '#6b7280' }}>
            Auto-refresh
          </label>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            style={{ width: 'auto' }}
          />
          <button className="btn" onClick={fetchStats} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {stats ? (
        <>
          {/* Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            marginBottom: '2rem',
          }}>
            <div style={{ 
              padding: '1rem', 
              background: '#f3f4f6', 
              borderRadius: '0.5rem',
            }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: '0.875rem' }}>
                Total Requests (1h)
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '700', margin: '0.25rem 0' }}>
                {stats.total}
              </p>
            </div>

            <div style={{ 
              padding: '1rem', 
              background: '#dcfce7', 
              borderRadius: '0.5rem',
            }}>
              <p style={{ margin: 0, color: '#16a34a', fontSize: '0.875rem' }}>
                Allowed
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '700', margin: '0.25rem 0' }}>
                {stats.total - stats.blocked}
              </p>
            </div>

            <div style={{ 
              padding: '1rem', 
              background: '#fee2e2', 
              borderRadius: '0.5rem',
            }}>
              <p style={{ margin: 0, color: '#dc2626', fontSize: '0.875rem' }}>
                Blocked
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '700', margin: '0.25rem 0' }}>
                {stats.blocked}
              </p>
            </div>

            <div style={{ 
              padding: '1rem', 
              background: '#e0f2fe', 
              borderRadius: '0.5rem',
            }}>
              <p style={{ margin: 0, color: '#0369a1', fontSize: '0.875rem' }}>
                Block Rate
              </p>
              <p style={{ fontSize: '2rem', fontWeight: '700', margin: '0.25rem 0' }}>
                {((stats.blocked / stats.total) * 100).toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Endpoint Details */}
          <div>
            <h3 style={{ marginBottom: '1rem' }}>Endpoint Breakdown</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse',
                fontSize: '0.875rem',
              }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Endpoint</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>Total</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>Allowed</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>Blocked</th>
                    <th style={{ textAlign: 'right', padding: '0.75rem' }}>Block Rate</th>
                    <th style={{ textAlign: 'left', padding: '0.75rem' }}>Last Request</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.endpoints.map((ep, idx) => (
                    <tr 
                      key={idx} 
                      style={{ borderBottom: '1px solid #e5e7eb' }}
                    >
                      <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>
                        {ep.endpoint}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        {ep.total}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#16a34a' }}>
                        {ep.allowed}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#dc2626' }}>
                        {ep.blocked}
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <span style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '0.25rem',
                          background: parseFloat(ep.blockRate) > 10 ? '#fee2e2' : '#dcfce7',
                          color: parseFloat(ep.blockRate) > 10 ? '#dc2626' : '#16a34a',
                          fontWeight: '600',
                        }}>
                          {ep.blockRate}%
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem', color: '#6b7280' }}>
                        {new Date(ep.lastRequest).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Alerts */}
          {stats.endpoints.some(ep => parseFloat(ep.blockRate) > 20) && (
            <div style={{ 
              marginTop: '1.5rem',
              padding: '1rem',
              background: '#fef2f2',
              border: '1px solid #fca5a5',
              borderRadius: '0.5rem',
            }}>
              <h4 style={{ margin: '0 0 0.5rem', color: '#dc2626' }}>
                ⚠️ High Block Rate Detected
              </h4>
              <p style={{ margin: 0, color: '#7f1d1d', fontSize: '0.875rem' }}>
                One or more endpoints have a block rate above 20%. This may indicate:
              </p>
              <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.5rem', fontSize: '0.875rem', color: '#7f1d1d' }}>
                <li>Brute force attack attempts</li>
                <li>Misconfigured client</li>
                <li>Legitimate users hitting rate limits</li>
              </ul>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: '#6b7280' }}>No monitoring data available</p>
      )}
    </div>
  );
};

export default RateLimitMonitoring;
