// react-native-safe-area-context ships il proprio mock ufficiale — usarlo
// invece di stub scritti a mano per SafeAreaView/useSafeAreaInsets.
//
// The library's own mock file only sets a default export (`export default {...}`),
// but app code imports named exports (`import { SafeAreaView } from '...'`), which
// Babel's CJS interop reads directly off the module object, not off `.default`.
// Left as-is, every named import (SafeAreaView, useSafeAreaInsets, ...) resolves to
// `undefined` and React throws "Element type is invalid" as soon as any screen using
// SafeAreaView is rendered. Flatten `.default` onto the module root so both the
// default-export and named-export import styles resolve to the real mock.
jest.mock('react-native-safe-area-context', () => {
  const mock = require('react-native-safe-area-context/jest/mock').default;
  return { ...mock, default: mock };
});

// @expo/vector-icons non è risolvibile dal resolver Node di Jest — esiste
// solo annidato in node_modules/expo/node_modules/@expo/vector-icons
// (Metro lo trova col proprio resolver, Jest no). virtual:true è necessario
// perché Jest non può risolvere un path reale da "shadoware". Nei 6 file
// sotto test viene usato solo Ionicons (in RootNavigator.jsx).
jest.mock(
  '@expo/vector-icons',
  () => {
    const { Text } = require('react-native');
    const IconStub = (props) => require('react').createElement(Text, props, props.name ?? '');
    return { Ionicons: IconStub, MaterialIcons: IconStub, Feather: IconStub };
  },
  { virtual: true }
);
