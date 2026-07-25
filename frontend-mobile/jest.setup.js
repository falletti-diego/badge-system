// react-native-safe-area-context ships il proprio mock ufficiale — usarlo
// invece di stub scritti a mano per SafeAreaView/useSafeAreaInsets.
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock')
);

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
