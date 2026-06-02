module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.spec.ts',
    '!src/**/__tests__/**',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/health/**',
    '!src/prisma/prisma.module.ts',
    '!src/common/dto/**',
  ],
  coverageDirectory: '../coverage/apps/api-service',
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  testEnvironment: 'node',
  displayName: 'api-service',
  preset: 'ts-jest',
  moduleNameMapper: {
    '^@argus/shared-types$': '<rootDir>/../../packages/shared-types/src/index.ts',
  },
};
