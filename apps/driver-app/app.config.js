const baseConfig = require('./app.json');

module.exports = {
  ...baseConfig,
  expo: {
    ...baseConfig.expo,
    ios: {
      ...baseConfig.expo.ios,
      config: {
        ...baseConfig.expo.ios?.config,
        googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      ...baseConfig.expo.android,
      config: {
        ...baseConfig.expo.android?.config,
        googleMaps: {
          apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
        },
      },
    },
  },
};
