import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/endpoints';
import { navigationRef } from '../utils/navigationRef';

import LoginScreen from '../screens/auth/LoginScreen';
import CheckInScreen from '../screens/checkin/CheckInScreen';
import QRScannerScreen from '../screens/checkin/QRScannerScreen';
import SuccessScreen from '../screens/checkin/SuccessScreen';
import MyScheduleScreen from '../screens/schedule/MyScheduleScreen';
import MyPresencesScreen from '../screens/presences/MyPresencesScreen';
import StorePresencesScreen from '../screens/presences/StorePresencesScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const checkAuth = async () => {
      const hasToken = await AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
      setInitialRoute(hasToken ? 'CheckIn' : 'Login');
    };
    checkAuth();
  }, []);

  if (initialRoute === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E3A5F' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={initialRoute}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="CheckIn" component={CheckInScreen} />
        <Stack.Screen name="QRScanner" component={QRScannerScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} />
        <Stack.Screen name="MySchedule" component={MyScheduleScreen} />
        <Stack.Screen name="MyPresences" component={MyPresencesScreen} />
        <Stack.Screen name="StorePresences" component={StorePresencesScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
