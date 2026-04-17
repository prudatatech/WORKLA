import * as Haptics from 'expo-haptics';
import { useFocusEffect, useRouter } from 'expo-router';
import { Clock } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Platform, StatusBar, StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
import JobCard from '../../components/jobs/JobCard';
import JobOfferCard from '../../components/jobs/JobOfferCard';
import { JobCardSkeleton } from '../../components/SkeletonLoader';
import EmptyState from '../../components/EmptyState';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { localCache } from '../../lib/localCache';
import { enqueueAction } from '../../lib/syncQueue';

const JobsEmptyImg = require('../../assets/images/bookings-empty.png');

const PRIMARY = '#1A3FFF';
const FILTER_TABS = ['Active', 'Completed', 'Cancelled'] as const;

export default function MyJobsScreen() {
  const [activeTab, setActiveTab] = useState<typeof FILTER_TABS[number]>('Active');
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmJobId, setConfirmJobId] = useState<string | null>(null);
  const [pendingOffers, setPendingOffers] = useState<any[]>([]);
  const router = useRouter();
  const hasMountedRef = useRef(false);
  const actionInProgressRef = useRef(false); // prevents double-press

  const fetchJobs = useCallback(async (isSilent = false, bustCache = false) => {
    let statusFilter: string;
    if (activeTab === 'Active') statusFilter = 'confirmed,en_route,arrived,in_progress';
    else if (activeTab === 'Completed') statusFilter = 'completed';
    else statusFilter = 'cancelled';
    
    // ⚡ Optimistic Cache Check: Instantly load cached jobs for this tab to remove UI flicker
    const cacheKey = `provider:jobs:${activeTab}`;
    if (!isSilent && !bustCache) {
      localCache.get<any[]>(cacheKey).then(cached => {
        if (cached?.length) {
          setJobs(cached);
          setLoading(false); // UI renders immediately
        } else {
          setLoading(true);
        }
      });
    }

    try {
      // bustCache=true adds ?refresh=true to bypass the backend Redis cache after status changes
      const suffix = bustCache ? '&refresh=true' : '';
      const res = await api.get(`/api/v1/bookings?role=provider&status=${statusFilter}${suffix}`);
      if (res.data) {
        setJobs(res.data);
        localCache.set(cacheKey, res.data, 600); // 10 min local cache
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState('');

  const fetchOffers = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/job-offers') as any;
      if (res.isBusy) {
        setIsBusy(true);
        setBusyMessage(res.message || 'Finish your current job to see new ones.');
        setPendingOffers([]);
      } else {
        setIsBusy(false);
        setBusyMessage('');
        if (Array.isArray(res.data)) {
          setPendingOffers(res.data);
        }
      }
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { fetchJobs(); fetchOffers(); }, [fetchJobs, fetchOffers]);

  // Real-time: booking status changes
  useEffect(() => {
    let bookingSub: any;
    let offerSub: any;
    const initSub = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Subscribe to booking updates
      bookingSub = supabase
        .channel(`jobs-sync-${user.id}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'bookings', filter: `provider_id=eq.${user.id}`,
        }, (payload: any) => {
          const oldStatus = payload.old.status;
          const newStatus = payload.new.status;
          if (newStatus === 'cancelled' && ['confirmed', 'en_route', 'arrived', 'in_progress'].includes(oldStatus)) {
            Vibration.vibrate([0, 500, 200, 500]);
            Alert.alert('⚠️ Job Cancelled', `Booking #${payload.new.id.slice(0, 8).toUpperCase()} has been cancelled by the customer.`, [{ text: 'OK', onPress: () => fetchJobs() }]);
          } else { fetchJobs(true); }
        }).subscribe();

      // Subscribe to new job offers — auto-refresh offers list
      offerSub = supabase
        .channel(`jobs-offers-live-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'job_offers', filter: `provider_id=eq.${user.id}`,
        }, () => {
          console.log('[Jobs] New offer detected via real-time');
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          fetchOffers();
        })
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'job_offers', filter: `provider_id=eq.${user.id}`,
        }, () => {
          fetchOffers();
          fetchJobs(true);
        })
        .subscribe();
    };
    initSub();
    return () => {
      if (bookingSub) supabase.removeChannel(bookingSub);
      if (offerSub) supabase.removeChannel(offerSub);
    };
  }, [fetchJobs, fetchOffers]);

  // Silent refresh when tab is re-focused
  useFocusEffect(
    useCallback(() => {
      if (hasMountedRef.current) {
        fetchJobs(true);
        fetchOffers();
      }
      hasMountedRef.current = true;
    }, [fetchJobs, fetchOffers])
  );

  const uploadProof = async (uri: string, bookingId: string, type: 'start' | 'complete') => {
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const fileName = `proof_${bookingId}_${type}_${Date.now()}.jpg`;
      const filePath = `work-proofs/${fileName}`;
      
      const { error } = await supabase.storage
        .from('work-proofs')
        .upload(filePath, decode(base64), { contentType: 'image/jpeg' });

      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage.from('work-proofs').getPublicUrl(filePath);
      return publicUrl;
    } catch (e) {
      console.error('Upload failed:', e);
      throw e;
    }
  };

  const captureProof = async (bookingId: string, type: 'start' | 'complete') => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      return result.assets[0].uri;
    }
    return null;
  };

  const advanceStatus = async (job: any, nextStatus: string, proofUrl?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActionLoading(job.id);

    // ⚡ Optimistic update FIRST — update UI instantly regardless of network
    setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: nextStatus } : j));

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await enqueueAction('UPDATE_BOOKING_STATUS', { bookingId: job.id, status: nextStatus, proofUrl });
        Alert.alert('Offline Mode', 'Status update queued. It will sync automatically when your connection is restored.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return;
      }

      const res = await api.patch(`/api/v1/bookings/${job.id}/status`, { status: nextStatus, proofUrl });
      if (res.error) {
        // Rollback optimistic update on error
        setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: job.status } : j));
        throw new Error(res.error);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Bust cache so customer & provider get fresh status immediately
      fetchJobs(true, true);
    } catch (e: any) { Alert.alert('Error', e.message); }
    finally { setActionLoading(null); }
  };

  const handleNavigate = (job: any) => {
    const lat = job.customer_latitude;
    const lng = job.customer_longitude;
    if (!lat || !lng) { Alert.alert('Location Missing', 'Customer location coordinates are not available.'); return; }
    const scheme = Platform.OS === 'ios' ? 'maps:' : 'geo:';
    const url = Platform.select({
      ios: `${scheme}0,0?q=${lat},${lng}`,
      android: `${scheme}${lat},${lng}?q=${lat},${lng}`,
    });
    if (url) Linking.openURL(url);
  };

  const confirmAndAdvance = async (job: any, nextStatus: string, nextLabel: string) => {
    if (job.status === 'confirmed' && nextStatus === 'en_route') handleNavigate(job);
    
    if (nextStatus === 'in_progress') {
        // ⚡ Update status immediately, then capture proof in background
        Alert.alert('Proof of Work', 'Please take a photo of the workspace before starting.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Take Photo', onPress: async () => {
            const uri = await captureProof(job.id, 'start');
            if (uri) {
                setActionLoading(job.id);
                try {
                    // ⚡ Start status update immediately, upload photo in parallel
                    // We don't use Promise.all here because if one fails, we want to know WHICH one
                    await api.patch(`/api/v1/bookings/${job.id}/status`, { status: nextStatus });
                    
                    const url = await uploadProof(uri, job.id, 'start');
                    
                    // Update proof URL in background (non-blocking)
                    if (url) api.patch(`/api/v1/bookings/${job.id}/status`, { status: nextStatus, proofUrl: url }).catch(() => {});
                    
                    setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: nextStatus } : j));
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    fetchJobs(true, true);
                } catch (err: any) { 
                    Alert.alert('Process Error', err.message || 'Failed to update job status or upload proof.'); 
                }
                finally { setActionLoading(null); }
            }
          }}
        ]);
    } else if (nextStatus === 'completed') {
        setConfirmJobId(job.id);
    } else {
        advanceStatus(job, nextStatus);
    }
  };

  const handleOfferAction = async (offerId: string, action: 'accept' | 'reject') => {
    // ⚡ Guard: block double-press immediately
    if (actionInProgressRef.current || actionLoading) return;
    actionInProgressRef.current = true;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setActionLoading(offerId);

    // ⚡ Optimistic: remove/dismiss the offer card INSTANTLY
    const previousOffers = pendingOffers;
    setPendingOffers(curr => curr.filter(o => o.id !== offerId));

    try {
      const res = await api.post(`/api/v1/job-offers/${offerId}/${action}`, {});
      if (res.error) {
        setPendingOffers(previousOffers); // rollback on error
        throw new Error(res.error);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (action === 'accept') fetchJobs();
    } catch (e: any) { Alert.alert('Offer Error', e.message); }
    finally {
      setActionLoading(null);
      actionInProgressRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Work Orders</Text>
        <TouchableOpacity style={styles.refresh} onPress={() => fetchJobs()}>
          <Clock size={20} color="#334155" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {FILTER_TABS.map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && !jobs.length ? (
        <View style={styles.list}>
          {Array.from({ length: 4 }).map((_, i) => <JobCardSkeleton key={i} />)}
        </View>
      ) : (
        <FlatList
          data={jobs}
          renderItem={({ item }) => (
            <JobCard
              item={item}
              actionLoading={actionLoading}
              confirmJobId={confirmJobId}
              onAdvance={confirmAndAdvance}
              onConfirmComplete={async (job) => { 
                setConfirmJobId(null); 
                const uri = await captureProof(job.id, 'complete');
                if (uri) {
                    setActionLoading(job.id);
                    try {
                        // ⚡ Mark completed immediately
                        await api.patch(`/api/v1/bookings/${job.id}/status`, { status: 'completed' });
                        
                        const url = await uploadProof(uri, job.id, 'complete');
                        
                        setJobs(curr => curr.map(j => j.id === job.id ? { ...j, status: 'completed' } : j));
                        // Send proof URL in background
                        if (url) api.patch(`/api/v1/bookings/${job.id}/status`, { status: 'completed', proofUrl: url }).catch(() => {});
                        
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        fetchJobs(true, true);
                    } catch (err: any) { 
                        Alert.alert('Upload Error', err.message || 'Failed to upload completion proof.'); 
                    }
                    finally { setActionLoading(null); }
                }
              }}
              onCancelConfirm={() => setConfirmJobId(null)}
            />
          )}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onRefresh={() => { fetchJobs(); fetchOffers(); }}
          refreshing={loading}
          ListHeaderComponent={
            activeTab === 'Active' ? (
              <View>
                {isBusy && (
                  <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F59E0B' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', marginBottom: 4 }}>🔵 Currently on a Job</Text>
                    <Text style={{ fontSize: 13, color: '#78350F' }}>{busyMessage}</Text>
                  </View>
                )}
                {pendingOffers.length > 0 && (
                  <View style={{ backgroundColor: '#F8FAFC', marginHorizontal: -16, padding: 16, marginBottom: 16 }}>
                    <Text style={[styles.sectionTitle, { marginBottom: 16 }]}>Pending Offers ({pendingOffers.length})</Text>
                    {pendingOffers.map(item => (
                      <JobOfferCard key={item.id} item={item} actionLoading={actionLoading} onAccept={(id) => handleOfferAction(id, 'accept')} onReject={(id) => handleOfferAction(id, 'reject')} />
                    ))}
                  </View>
                )}
              </View>
            ) : null
          }
          ListEmptyComponent={
            <EmptyState 
                title={`No ${activeTab} Jobs`}
                description={`You don't have any ${activeTab.toLowerCase()} jobs at the moment. Keep your availability on to receive new tasks!`}
                imageSource={JobsEmptyImg}
                ctaLabel={activeTab === 'Active' ? 'Update Availability' : undefined}
                onCtaPress={activeTab === 'Active' ? () => router.navigate('/(tabs)/' as any) : undefined}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  refresh: { padding: 8, backgroundColor: '#F8FAFC', borderRadius: 12 },
  tabs: { flexDirection: 'row', padding: 16, gap: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  tabActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: '#FFF' },
  list: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { alignItems: 'center', marginTop: 100, gap: 10 },
  emptyText: { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B' },
});
