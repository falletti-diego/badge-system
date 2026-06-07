// Jest setup: provide required env vars so modules load cleanly in test environment
process.env.JWT_SECRET = 'test-secret-for-jest-only-not-used-in-production';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-jest-only';
process.env.NODE_ENV = 'test';
