import { NativeScriptConfig } from '@nativescript/core';

export default {
  id: 'com.tictactoetwist',
  appPath: 'app',
  appResourcesPath: 'App_Resources',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none'
  },
  version: '1.0.0'
} as NativeScriptConfig;

