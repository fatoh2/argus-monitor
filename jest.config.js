module.exports = {
  projects: [
    '<rootDir>/apps/api-service',
    '<rootDir>/apps/alert-service',
    '<rootDir>/apps/notification-service',
    '<rootDir>/apps/chain-indexer-service',
    '<rootDir>/apps/solana-adapter-service',
  ],
  coverageDirectory: '<rootDir>/coverage',
  collectCoverageFrom: [
    'apps/*/src/**/*.(t|j)s',
    '!apps/*/src/**/*.spec.ts',
    '!apps/*/src/**/__tests__/**',
    '!apps/*/src/main.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
};
