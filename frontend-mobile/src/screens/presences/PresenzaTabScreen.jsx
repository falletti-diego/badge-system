import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import authService from '../../services/authService';
import MyPresencesScreen from './MyPresencesScreen';
import StorePresencesScreen from './StorePresencesScreen';

export default function PresenzaTabScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authService.getUser().then(setUser).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F2ED' }}>
        <ActivityIndicator size="large" color="#1E3A5F" />
      </View>
    );
  }

  // Accepts both 'manager' and 'admin' — exact role strings from backend
  const isManager = user?.role === 'manager' || user?.role === 'admin';
  return isManager
    ? <StorePresencesScreen navigation={navigation} />
    : <MyPresencesScreen navigation={navigation} />;
}
