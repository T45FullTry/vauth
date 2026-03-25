import React from 'react';
import RateLimitMonitoring from '../components/RateLimitMonitoring';

export const MonitoringDashboard: React.FC = () => {
  return (
    <div className="container" style={{ maxWidth: '1200px' }}>
      <div className="card">
        <h1 style={{ marginBottom: '1.5rem' }}>🛡️ Security Monitoring</h1>
        <p style={{ color: '#6b7280', marginBottom: '2rem' }}>
          Real-time rate limit analytics and security insights
        </p>

        <RateLimitMonitoring />
      </div>
    </div>
  );
};

export default MonitoringDashboard;
