import React from 'react';
import { View, Image, StyleSheet, ActivityIndicator, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');

/**
 * LoadingScreen component for a premium initialization experience.
 */
export default function LoadingScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Image
          source={require('../assets/images/icon.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#1A3FFF" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    width: '100%',
  },
  logo: {
    width: width * 0.4,
    height: width * 0.4,
    marginBottom: 40,
  },
  loaderContainer: {
    height: 40,
    justifyContent: 'center',
  },
});
