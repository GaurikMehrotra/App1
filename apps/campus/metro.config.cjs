const {getDefaultConfig}=require('expo/metro-config');
const {withNativeWind}=require('nativewind/metro');
const path=require('path');
const config=getDefaultConfig(__dirname);
config.resolver.extraNodeModules={...config.resolver.extraNodeModules,'react-native-css-interop':path.dirname(require.resolve('react-native-css-interop/package.json',{paths:[path.dirname(require.resolve('nativewind/package.json'))]}))};
module.exports=withNativeWind(config,{input:'./global.css'});
