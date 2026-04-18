import { MapPin } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';

const PRIMARY = '#1A3FFF';

interface LiveMapProps {
  currentLocation: { latitude: number; longitude: number };
  currentCity: string;
}

export default function LiveMap({ currentLocation, currentCity }: LiveMapProps) {
  return (
    <View style={styles.mapCard}>
      <View style={styles.mapHeader}>
        <MapPin size={16} color={PRIMARY} />
        <Text style={styles.mapTitle}>Live Tracking Active</Text>
      </View>
      <Text style={styles.mapCity}>{currentCity}</Text>
      <View style={styles.mapAreaContainer}>
        <MapView
          provider={PROVIDER_GOOGLE}
          style={styles.map}
          initialRegion={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.05,
            longitudeDelta: 0.05,
          }}
          showsUserLocation={true}
        >
          <Marker coordinate={currentLocation} title="You" description={currentCity} />
        </MapView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mapCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1, borderColor: '#F3F4F6', elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 10 },
  mapHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  mapTitle: { fontSize: 13, fontWeight: '800', color: PRIMARY },
  mapCity: { fontSize: 11, color: '#64748B', marginBottom: 16 },
  mapAreaContainer: { height: 160, borderRadius: 16, overflow: 'hidden', backgroundColor: '#F8FAFC' },
  map: { flex: 1 },
});
