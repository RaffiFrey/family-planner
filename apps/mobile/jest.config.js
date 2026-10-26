/** Unit tests for pure helpers (jest-expo preset). */
module.exports = {
  preset: 'jest-expo',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // pnpm keeps packages under node_modules/.pnpm; workspace packages and ESM deps must be transformed.
  transformIgnorePatterns: [
    'node_modules/(?!(\.pnpm|(jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@fp|dinero\.js|@dinero\.js|rrule|date-fns))',
  ],
};
