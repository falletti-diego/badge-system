import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authService from '../services/authService';

import LoginScreen from '../screens/auth/LoginScreen';
import CheckInScreen from '../screens/checkin/CheckInScreen';
import QRScannerScreen from '../screens/checkin/QRScannerScreen';
import SuccessScreen from '../screens/checkin/SuccessScreen';
import MyScheduleScreen from '../screens/schedule/MyScheduleScreen';
import MyPresencesScreen from '../screens/presences/MyPresencesScreen';

const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    authService.isAuthenticated().then(setIsAuthenticated);

    const interval = setInterval(async () => {
      const hasToken = await AsyncStorage.getItem('badge_auth_token');
      setIsAuthenticated(!!hasToken);
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (isAuthenticated === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E3A5F' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{ headerShown: false }}
        initialRouteName={isAuthenticated ? 'CheckIn' : 'Login'}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="CheckIn" component={CheckInScreen} />
        <Stack.Screen name="QRScanner" component={QRScannerScreen} />
        <Stack.Screen name="Success" component={SuccessScreen} />
        <Stack.Screen name="MySchedule" component={MyScheduleScreen} />
        <Stack.Screen name="MyPresences" component={MyPresencesScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
