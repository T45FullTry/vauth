-- Rate Limit Monitoring Table
-- Tracks all rate-limited requests for security analysis

CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id SERIAL PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  allowed BOOLEAN NOT NULL,
  remaining INTEGER NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_timestamp ON rate_limit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_client_id ON rate_limit_logs(client_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_endpoint ON rate_limit_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_allowed ON rate_limit_logs(allowed);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_rate_limit_logs_endpoint_timestamp 
  ON rate_limit_logs(endpoint, timestamp DESC);

-- Add comment
COMMENT ON TABLE rate_limit_logs IS 'Audit log for rate limit events';
COMMENT ON COLUMN rate_limit_logs.client_id IS 'Client identifier (IP + user agent fingerprint)';
COMMENT ON COLUMN rate_limit_logs.allowed IS 'Whether request was allowed or blocked';
COMMENT ON COLUMN rate_limit_logs.remaining IS 'Remaining requests in current window';

-- Create view for recent rate limit activity
CREATE OR REPLACE VIEW rate_limit_activity AS
SELECT 
  DATE_TRUNC('hour', timestamp) as hour,
  endpoint,
  COUNT(*) as requests,
  COUNT(*) FILTER (WHERE allowed = false) as blocked,
  ROUND(
    COUNT(*) FILTER (WHERE allowed = false) * 100.0 / NULLIF(COUNT(*), 0), 
    2
  ) as block_percentage
FROM rate_limit_logs
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', timestamp), endpoint
ORDER BY hour DESC, blocked DESC;

-- Grant permissions (adjust as needed)
-- GRANT SELECT ON rate_limit_logs TO monitoring_user;
-- GRANT SELECT ON rate_limit_activity TO monitoring_user;
