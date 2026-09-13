import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

jest.mock('../services/apiClient', () => ({
  get: jest.fn(),
  put: jest.fn(),
}));

// ManagerLeaveApprovalScreen imports PendingLeaveContext from RootNavigator,
// which transitively imports AsyncStorage/NetInfo/secureAuthStorage/
// pushNotificationsService/offlineQueue at module scope (native modules
// unavailable under Jest) — same mock set as RootNavigator.test.jsx.
jest.mock('@react-native-async-storage/async-storage', () => ({
  multiRemove: jest.fn(),
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('../services/secureAuthStorage', () => ({
  clearSession: jest.fn(),
  getUser: jest.fn(),
}));

jest.mock('../services/pushNotificationsService', () => ({
  registerForPushNotifications: jest.fn(),
}));

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}));

jest.mock('../services/offlineQueue', () => ({
  flushQueue: jest.fn(),
}));

const apiClient = require('../services/apiClient');
const ManagerLeaveApprovalScreen = require('../screens/leave/ManagerLeaveApprovalScreen').default;

const Stack = createNativeStackNavigator();

// ManagerLeaveApprovalScreen calls useFocusEffect, which requires a real
// navigation object in context — not mockable, needs an actual
// NavigationContainer/Navigator (same approach as MyScheduleScreen.test.jsx).
function renderScreen() {
  return render(
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="ManagerLeaveApproval" component={ManagerLeaveApprovalScreen} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

describe('ManagerLeaveApprovalScreen — half-day display', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows "0,5 giorni" (plural, comma-decimal) for a half-day pending request', async () => {
    apiClient.get.mockResolvedValue({ data: { data: [{
      id: 'req-1',
      employee_name: 'Maria Rossi',
      leave_type: 'FERIE_1',
      start_date: '2026-09-20',
      end_date: '2026-09-20',
      num_days: 0.5,
      motivation: null,
    }] } });

    const { findByText } = await renderScreen();
    expect(await findByText(/0,5 giorni\b/)).toBeTruthy();
  });

  it('shows "3 giorni" (plural) for a multi-day pending request, not the malformed "giornoi"', async () => {
    apiClient.get.mockResolvedValue({ data: { data: [{
      id: 'req-3',
      employee_name: 'Anna Verdi',
      leave_type: 'FERIE_1',
      start_date: '2026-09-22',
      end_date: '2026-09-24',
      num_days: 3,
      motivation: null,
    }] } });

    const { findByText } = await renderScreen();
    expect(await findByText(/3 giorni\b/)).toBeTruthy();
  });

  it('shows "1 giorno" (singular) for a full single day, not "1 giorni"', async () => {
    apiClient.get.mockResolvedValue({ data: { data: [{
      id: 'req-2',
      employee_name: 'Luigi Bianchi',
      leave_type: 'MALATTIA',
      start_date: '2026-09-21',
      end_date: '2026-09-21',
      num_days: 1,
      motivation: null,
    }] } });

    const { findByText } = await renderScreen();
    expect(await findByText(/1 giorno\b/)).toBeTruthy();
  });
});
