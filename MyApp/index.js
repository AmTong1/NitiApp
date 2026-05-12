// index.js
import React from 'react';
import { AppRegistry, Text, TextInput } from 'react-native';
import './src/lib/enableResponsiveStyleSheet';
import App from './App';
import { name as appName } from './app.json';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

// Enable system font scaling globally but limit it to avoid UI breakage
if (Text.defaultProps == null) Text.defaultProps = {};
Text.defaultProps.allowFontScaling = true;
Text.defaultProps.maxFontSizeMultiplier = 1.2; // Limit max scale to 1.2x

if (TextInput.defaultProps == null) TextInput.defaultProps = {};
TextInput.defaultProps.allowFontScaling = true;
TextInput.defaultProps.maxFontSizeMultiplier = 1.2; // Limit max scale to 1.2x

const Root = () => (
  <SafeAreaProvider initialMetrics={initialWindowMetrics}>
    <App />
  </SafeAreaProvider>
);

AppRegistry.registerComponent(appName, () => Root);
