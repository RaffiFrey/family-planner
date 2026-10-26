const path = require('path');

// pnpm does not hoist babel-preset-expo next to this app, so resolve it through `expo`.
const babelPresetExpo = require.resolve('babel-preset-expo', {
  paths: [path.dirname(require.resolve('expo/package.json'))],
});

module.exports = function (api) {
  api.cache(true);
  return {
    presets: [[babelPresetExpo, { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
