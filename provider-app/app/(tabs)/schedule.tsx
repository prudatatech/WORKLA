import {
    Clock,
    Plus,
    Save,
    Trash2
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../../lib/api';
import { ScheduleSkeleton } from '../../components/SkeletonLoader';

const PRIMARY = '#1A3FFF';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ScheduleScreen() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [availability, setAvailability] = useState<any[]>([]);

    useEffect(() => {
        fetchAvailability();
    }, []);

    const fetchAvailability = async () => {
        setLoading(true);
        try {
            const res = await api.get('/api/v1/availability');
            if (res.data) {
                setAvailability(res.data);
            }
        } catch (e) {
            console.error('Fetch Availability Error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddSlot = (dayIndex: number) => {
        const newSlot = {
            day_of_week: dayIndex,
            start_time: '09:00:00',
            end_time: '17:00:00',
            is_available: true
        };
        setAvailability([...availability, newSlot]);
    };

    const handleRemoveSlot = (index: number) => {
        const newAvail = [...availability];
        newAvail.splice(index, 1);
        setAvailability(newAvail);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await api.post('/api/v1/availability', availability);
            if (res.data) {
                Alert.alert('Success', 'Availability saved successfully!');
                fetchAvailability();
            }
        } catch {
            Alert.alert('Error', 'Failed to save availability.');
        } finally {
            setSaving(false);
        }
    };

    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await fetchAvailability();
        setRefreshing(false);
    }, []);

    if (loading && !refreshing) {
        return (
            <SafeAreaView style={s.root} edges={['top']}>
                <View style={s.header}>
                    <View>
                        <Text style={s.headerTitle}>Work Schedule</Text>
                        <Text style={s.headerSub}>Set your weekly availability</Text>
                    </View>
                </View>
                <ScheduleSkeleton />
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={s.root} edges={['top']}>
            <StatusBar barStyle="dark-content" />
            <View style={s.header}>
                <View>
                    <Text style={s.headerTitle}>Work Schedule</Text>
                    <Text style={s.headerSub}>Set your weekly availability</Text>
                </View>
                <TouchableOpacity 
                    style={[s.saveBtn, saving && { opacity: 0.7 }]} 
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                        <>
                            <Save size={18} color="#FFF" style={{ marginRight: 6 }} />
                            <Text style={s.saveBtnText}>Save</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView 
                contentContainerStyle={s.scroll} 
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PRIMARY} colors={[PRIMARY]} />}
            >
                {DAYS.map((day, dayIndex) => {
                    const daySlots = availability.filter(s => s.day_of_week === dayIndex);
                    
                    return (
                        <View key={day} style={s.dayCard}>
                            <View style={s.dayHeader}>
                                <Text style={s.dayTitle}>{day}</Text>
                                <TouchableOpacity 
                                    style={s.addBtn}
                                    onPress={() => handleAddSlot(dayIndex)}
                                >
                                    <Plus size={16} color={PRIMARY} />
                                    <Text style={s.addBtnText}>Add Slot</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={s.slotsContainer}>
                                {daySlots.length > 0 ? (
                                    daySlots.map((slot, idx) => {
                                        const globalIdx = availability.indexOf(slot);
                                        return (
                                            <View key={idx} style={s.slotRow}>
                                                <Clock size={16} color="#6B7280" />
                                                <Text style={s.slotTime}>
                                                    {slot.start_time.substring(0, 5)} - {slot.end_time.substring(0, 5)}
                                                </Text>
                                                <TouchableOpacity 
                                                    style={s.removeBtn}
                                                    onPress={() => handleRemoveSlot(globalIdx)}
                                                >
                                                    <Trash2 size={16} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })
                                ) : (
                                    <Text style={s.emptyDay}>Unavailable</Text>
                                )}
                            </View>
                        </View>
                    );
                })}

                <View style={s.infoBox}>
                    <Text style={s.infoTitle}>Expert Tip 💡</Text>
                    <Text style={s.infoText}>
                        Setting consistent hours helps you get more booking requests and improves your completion rate!
                    </Text>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#F9FAFB' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, color: '#6B7280', fontWeight: '600' },
    header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#FFF',
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
    },
    headerTitle: { fontSize: 24, fontWeight: '900', color: '#111827' },
    headerSub: { fontSize: 13, color: '#6B7280', fontWeight: '500', marginTop: 2 },
    saveBtn: {
        backgroundColor: PRIMARY, flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4
    },
    saveBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
    scroll: { padding: 20 },
    dayCard: {
        backgroundColor: '#FFF', borderRadius: 20, padding: 16, marginBottom: 16,
        borderWidth: 1, borderColor: '#F3F4F6'
    },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    dayTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
    addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    addBtnText: { fontSize: 12, fontWeight: '700', color: PRIMARY },
    slotsContainer: { gap: 8 },
    slotRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB',
        padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#F3F4F6'
    },
    slotTime: { flex: 1, fontSize: 14, fontWeight: '600', color: '#374151', marginLeft: 10 },
    removeBtn: { padding: 4 },
    emptyDay: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic', paddingLeft: 4 },
    infoBox: {
        backgroundColor: '#FFFBEB', borderRadius: 20, padding: 16,
        borderWidth: 1, borderColor: '#FEF3C7', marginTop: 8
    },
    infoTitle: { fontSize: 15, fontWeight: '800', color: '#92400E', marginBottom: 4 },
    infoText: { fontSize: 13, color: '#B45309', lineHeight: 20, fontWeight: '500' }
});
