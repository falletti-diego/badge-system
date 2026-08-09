import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import authService from '../../services/authService';
import { COLORS, FONTS } from '../../config/theme';
import { FAQ_ITEMS, isVisible } from '../../data/faq';

export default function HelpScreen() {
  const [role, setRole] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    authService.getUser()
      .then((user) => setRole(user?.role ?? null))
      .catch((err) => {
        console.warn('HelpScreen: impossibile leggere il ruolo utente, mostro solo le FAQ pubbliche', err);
        setRole(null);
      });
  }, []);

  const visibleItems = FAQ_ITEMS.filter((item) => isVisible(item, role));

  const toggle = (id) => setExpandedId((current) => (current === id ? null : id));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Guida</Text>
      </View>
      <ScrollView>
        {visibleItems.map((item) => (
          <View key={item.id} style={styles.card}>
            <TouchableOpacity style={styles.questionRow} onPress={() => toggle(item.id)}>
              <Text style={styles.question}>{item.question}</Text>
              <Text style={styles.chevron}>{expandedId === item.id ? '︿' : '﹀'}</Text>
            </TouchableOpacity>
            {expandedId === item.id && (
              <Text style={styles.answer}>{item.answer}</Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.linen },
  header: { backgroundColor: COLORS.white, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COLORS.bone },
  title: { fontFamily: FONTS.display, fontSize: 24, color: COLORS.ink },
  card: {
    backgroundColor: COLORS.white, marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.bone, overflow: 'hidden', padding: 16,
  },
  questionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  question: { flex: 1, fontFamily: FONTS.bodySemiBold, fontSize: 14, color: COLORS.ink, marginRight: 8 },
  chevron: { fontSize: 14, color: COLORS.dust },
  answer: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.stone, marginTop: 10, lineHeight: 19 },
});
