import React, { useState, useEffect, createContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS, ENDPOINTS } from '../config/endpoints';
import { navigationRef } from '../utils/navigationRef';
import apiClient from '../services/apiClient';

// Single source of truth for manager pending-leave badge count.
// ManagerLeaveApprovalScreen updates this via context after every load.
export const PendingLeaveContext = createContext({ setPendingCount: () => {} });

import LoginScreen from '../screens/auth/LoginScreen';
import CheckInScreen from '../screens/checkin/CheckInScreen';
import FaceIDScreen from '../screens/checkin/FaceIDScreen';
import QRScannerScreen from '../screens/checkin/QRScannerScreen';
import SuccessScreen from '../screens/checkin/SuccessScreen';
import MyScheduleScreen from '../screens/schedule/MyScheduleScreen';
import ManagerScheduleScreen from '../screens/schedule/ManagerScheduleScreen';
import PresenzaTabScreen from '../screens/presences/PresenzaTabScreen';
import LeaveRequestScreen from '../screens/leave/LeaveRequestScreen';
import ManagerLeaveApprovalScreen from '../screens/leave/ManagerLeaveApprovalScreen';
import IllnessReportScreen from '../screens/illness/IllnessReportScreen';

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const CheckInStack = createNativeStackNavigator();

function CheckInStackNavigator() {
  return (
    <CheckInStack.Navigator screenOptions={{ headerShown: false }}>
      <CheckInStack.Screen name="CheckInMain" component={CheckInScreen} />
      <CheckInStack.Screen name="FaceID" component={FaceIDScreen} />
      <CheckInStack.Screen name="QRScanner" component={QRScannerScreen} />
      <CheckInStack.Screen name="Success" component={SuccessScreen} />
    </CheckInStack.Navigator>
  );
}

const TAB_ICONS = {
  Badge: 'qr-code-outline',
  Ferie: 'calendar-outline',
  Approvazioni: 'checkmark-circle-outline',
  Malattia: 'medical-outline',
  Turni: 'time-outline',
  Presenze: 'people-outline',
};

// MainTabs reads user role fresh on every mount (so logout+login as different role works correctly).
// Uses key={role} on the Tab.Navigator to remount when role changes.
function MainTabs() {
  const [role, setRole] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEYS.USER_DATA).then(userData => {
      try {
        const user = JSON.parse(userData || '{}');
        setRole(user.role || 'employee');
      } catch {
        setRole('employee');
      }
    });
  }, []);

  // Fetch initial badge count when manager logs in.
  // The child screen (ManagerLeaveApprovalScreen) calls setPendingCount after every load
  // via PendingLeaveContext — so the badge stays accurate after approve/reject.
  useEffect(() => {
    if (role === 'manager') {
      apiClient.get(ENDPOINTS.LEAVES_PENDING)
        .then(res => setPendingCount((res.data.data || []).length))
        .catch(() => {});
    }
  }, [role]);

  if (role === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1E3A5F' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  const isManager = role === 'manager';

  return (
    <PendingLeaveContext.Provider value={{ setPendingCount }}>
    <Tab.Navigator
      key={role}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1E3A5F',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: { backgroundColor: '#FFFFFF', borderTopColor: '#E5E7EB', borderTopWidth: 1 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Badge" component={CheckInStackNavigator} options={{ title: 'Badge' }} />

      {isManager
        ? <Tab.Screen
            name="Approvazioni"
            component={ManagerLeaveApprovalScreen}
            options={{ tabBarBadge: pendingCount > 0 ? pendingCount : undefined }}
          />
        : <Tab.Screen name="Ferie" component={LeaveRequestScreen} />
      }

      <Tab.Screen name="Malattia" component={IllnessReportScreen} />

      <Tab.Screen
        name="Turni"
        component={isManager ? ManagerScheduleScreen : MyScheduleScreen}
      />

      <Tab.Screen name="Presenze" component={PresenzaTabScreen} />
    </Tab.Navigator>
    </PendingLeaveContext.Provider>
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
