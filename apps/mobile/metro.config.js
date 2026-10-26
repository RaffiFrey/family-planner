const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

/**
 * nativewind/babel rewrites JSX to `react-native-css-interop/jsx-runtime`, but with pnpm that package is
 * only reachable from nativewind itself, so resolve it as if nativewind imported it.
 */
const nativewindOrigin = require.resolve('nativewind/package.json');

const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  if (
    moduleName === 'react-native-css-interop' ||
    moduleName.startsWith('react-native-css-interop/')
  ) {
    return resolve({ ...context, originModulePath: nativewindOrigin }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: './src/global.css' });
