const path=require('node:path');
const {getDefaultConfig}=require('expo/metro-config');
const config=getDefaultConfig(__dirname);
// Pure clock helpers live beside the shared service; resolve React from the native app first.
config.watchFolders=[path.resolve(__dirname,'..')];
config.resolver.nodeModulesPaths=[path.resolve(__dirname,'node_modules'),path.resolve(__dirname,'../node_modules')];
module.exports=config;
