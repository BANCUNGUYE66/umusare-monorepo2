const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

config.watchFolders = [
  path.resolve(__dirname, '../../packages'),
  ...config.watchFolders,
];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '../../packages/shared-logic/node_modules'),
  path.resolve(__dirname, '../../node_modules'),
];

module.exports = config;
