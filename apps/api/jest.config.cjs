module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/test/integration/'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', diagnostics: true }] },
};
