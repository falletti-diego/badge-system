import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../config/endpoints';
import { navigationRef } from '../utils/navigationRef';

import LoginScreen from '../screens/auth/LoginScreen';
import CheckInScreen from '../screens/checkin/CheckInScreen';
import QRScannerScreen from '../screens/checkin/QRScannerScreen';
import SuccessScreen from '../screens/checkin/SuccessScreen';
import MyScheduleScreen from '../screens/schedule/MyScheduleScreen';
import PresenzaTabScreen from '../screens/presences/PresenzaTabScreen';
import LeaveRequestScreen from '../screens/leave/LeaveRequestScreen';
import IllnessReportScreen from '../screens/illness/IllnessReportScreen';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const CheckInStack = createNativeStackNavigator();

function CheckInStackNavigator() {
  return (
    <CheckInStack.Navigator screenOptions={{ headerShown: false }}>
      <CheckInStack.Screen name="CheckInMain" component={CheckInScreen} />
      <CheckInStack.Screen name="QRScanner" component={QRScannerScreen} />
      <CheckInStack.Screen name="Success" component={SuccessScreen} />
    </CheckInStack.Navigator>
  );
}

const TAB_ICONS = {
  Badge: 'qr-code-outline',
  Ferie: 'calendar-outline',
  Malattia: 'medical-outline',
  Turni: 'time-outline',
  Presenze: 'people-outline',
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E3A5F',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E5E7EB',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Badge" component={CheckInStackNavigator} options={{ title: 'Badge' }} />
      <Tab.Screen name="Ferie" component={LeaveRequestScreen} />
      <Tab.Screen name="Malattia" component={IllnessReportScreen} />
      <Tab.Screen name="Turni" component={MyScheduleScreen} />
      <Tab.Screen name="Presenze" component={PresenzaTabScreen} />
    </Tab.Navigator>
  );
}

export default function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.AUTH_TOKEN).then(token => {
      setInitialRoute(token ? 'Main' : 'Login');
    });
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
      <RootStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialRoute}>
        <RootStack.Screen name="Login" component={LoginScreen} />
        <RootStack.Screen name="Main" component={MainTabs} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
