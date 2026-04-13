import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, MapPin, Info, Save } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Slider from '@react-native-community/slider';
import { api } from '../lib/api';
import { supabase } from '../lib/supabase';

const PRIMARY = '#1A3FFF';

export default function ServiceAreasScreen() {
    const router = useRouter();
    const [radius, setRadius] = useState(10);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('provider_details')
                .select('service_radius_km')
                .eq('provider_id', user.id)
                .single();

            if (error) throw error;
            if (data) {
                setRadius(data.service_radius_km || 10);
            }
        } catch (error) {
            console.error('Error loading service areas:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        try {
            console.log('Saving radius:', radius);
            const res = await api.patch('/api/v1/providers/me', {
                service_radius_km: radius
            });

            if (res.error) {
                console.error('Save failed:', res.error);
                throw new Error(res.error);
            }

            if (res.data?.success || res.data) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Success', 'Working radius updated successfully.');
                router.back();
            } else {
                throw new Error('Failed to update settings');
            }
        } catch (error: any) {
            console.error('Catch error in save:', error);
            Alert.alert('Error', error.message || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ChevronLeft size={24} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Service Areas</Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={styles.loading}>
                    <ActivityIndicator size="large" color={PRIMARY} />
                </View>
            ) : (
                <ScrollView contentContainerStyle={styles.scroll}>
                    <View style={styles.infoCard}>
                        <View style={styles.iconCircle}>
                            <MapPin size={24} color={PRIMARY} />
                        </View>
                        <Text style={styles.infoTitle}>Set Your Working Radius</Text>
                        <Text style={styles.infoDesc}>
                            Define the maximum distance you are willing to travel for a job. 
                            Users within this radius will be able to book your services.
                        </Text>
                    </View>

                    <View style={styles.section}>
                        <View style={styles.radiusDisplay}>
                            <Text style={styles.radiusValue}>{radius.toFixed(0)}</Text>
                            <Text style={styles.radiusUnit}>km</Text>
                        </View>

                        <Slider
                            style={styles.slider}
                            minimumValue={1}
                            maximumValue={50}
                            step={1}
                            value={radius}
                            onValueChange={setRadius}
                            minimumTrackTintColor={PRIMARY}
                            maximumTrackTintColor="#E5E7EB"
                            thumbTintColor={PRIMARY}
                        />

                        <View style={styles.rangeLabels}>
                            <Text style={styles.rangeText}>1 km</Text>
                            <Text style={styles.rangeText}>50 km</Text>
                        </View>
                    </View>

                    <View style={styles.tipBox}>
                        <Info size={18} color="#1D4ED8" />
                        <Text style={styles.tipText}>
                            A larger radius increases your potential jobs but might involve more travel time.
                        </Text>
                    </View>

                    <TouchableOpacity 
                        style={[styles.saveBtn, saving && { opacity: 0.7 }]} 
                        onPress={handleSave}
                        disabled={saving}
                    >
                        {saving ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Save size={20} color="#FFF" />
                                <Text style={styles.saveBtnText}>Save Settings</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F9FAFB' },
    header: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        paddingHorizontal: 16, 
        paddingVertical: 14, 
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6'
    },
    headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
    backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 20 },
    infoCard: { 
        backgroundColor: '#FFF', 
        borderRadius: 24, 
        padding: 24, 
        alignItems: 'center', 
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#F3F4F6'
    },
    iconCircle: { 
        width: 56, 
        height: 56, 
        borderRadius: 28, 
        backgroundColor: '#EEF2FF', 
        justifyContent: 'center', 
        alignItems: 'center',
        marginBottom: 16
    },
    infoTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8 },
    infoDesc: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 20 },
    section: { 
        backgroundColor: '#FFF', 
        borderRadius: 24, 
        padding: 24, 
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#F3F4F6'
    },
    radiusDisplay: { 
        flexDirection: 'row', 
        alignItems: 'baseline', 
        justifyContent: 'center', 
        marginBottom: 20 
    },
    radiusValue: { fontSize: 48, fontWeight: '900', color: PRIMARY },
    radiusUnit: { fontSize: 18, fontWeight: '700', color: '#6B7280', marginLeft: 4 },
    slider: { width: '100%', height: 40 },
    rangeLabels: { 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        marginTop: 4 
    },
    rangeText: { fontSize: 12, color: '#9CA3AF', fontWeight: '600' },
    tipBox: { 
        flexDirection: 'row', 
        gap: 12, 
        backgroundColor: '#EFF6FF', 
        padding: 16, 
        borderRadius: 16, 
        marginBottom: 30 
    },
    tipText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },
    saveBtn: { 
        backgroundColor: PRIMARY, 
        height: 56, 
        borderRadius: 16, 
        flexDirection: 'row', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: 10,
        elevation: 4,
        shadowColor: PRIMARY,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8
    },
    saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' }
});
