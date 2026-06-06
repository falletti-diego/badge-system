import React from 'react';
import { View, StyleSheet, FlatList } from 'react-native';

/**
 * Skeleton loader for progressive loading feedback
 * Shows placeholder rows while data is fetching
 */
export default function SkeletonLoader({ count = 5, height = 80 }) {
  const skeletons = Array.from({ length: count }, (_, i) => ({ id: String(i) }));

  return (
    <FlatList
      data={skeletons}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      scrollEnabled={false}
      renderItem={() => (
        <View style={[styles.row, { height }]}>
          <View style={styles.avatar} />
          <View style={styles.textContainer}>
            <View style={[styles.line, { width: '70%', marginBottom: 8 }]} />
            <View style={[styles.line, { width: '50%' }]} />
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#E5E7EB',
  },
  textContainer: {
    flex: 1,
  },
  line: {
    height: 12,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
  },
});
