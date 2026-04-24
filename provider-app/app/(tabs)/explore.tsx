import { useRouter } from 'expo-router';
import {
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  RefreshCw,
  Zap,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EmptyState from '../../components/EmptyState';
import { JobCardSkeleton } from '../../components/SkeletonLoader';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';

const PRIMARY = '#1A3FFF';
const SUCCESS = '#059669';

interface AvailableJob {
  id: string;
  service_name: string;
  customer_address: string;
  total_amount: number;
  scheduled_date: string;
  scheduled_time_slot: string;
  distance_km: number | null;
}

export default function JobMarketplace() {
  const [jobs, setJobs] = useState<AvailableJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const router = useRouter();

  const fetchAvailableJobs = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Check Busy Status from Profile /api/v1/providers/me
      const { data: profile, error: profErr } = await api.get('/api/v1/providers/me');
      if (profErr) throw new Error(profErr);

      if (profile?.hasActiveJob) {
        setIsBusy(true);
        setActiveJobId(profile.activeJobId);
        setJobs([]);
        setLoading(false);
        return;
      } else {
        setIsBusy(false);
        setActiveJobId(null);
      }

      // 2. Fetch Jobs using RPC (for Geo)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.rpc('get_available_jobs', {
        p_provider_id: user.id
      });

      if (error) {
        console.error('[Marketplace] RPC get_available_jobs error:', error);
        throw error;
      }

      console.log(`[Marketplace] Found ${data?.length || 0} jobs for provider ${user.id}`);
      setJobs(data || []);
    } catch (e: any) {
      console.error('Marketplace Error Details:', {
        message: e.message,
        details: e.details,
        hint: e.hint
      });
      Alert.alert('Error', 'Failed to load available jobs. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableJobs();
  }, [fetchAvailableJobs]);

  const handleAcceptJob = async (jobId: string) => {
    setAcceptingId(jobId);
    try {
      // Use the new secure API endpoint that enforces the 'One Job' limit
      const { data, error } = await api.post(`/api/v1/job-offers/by-booking/${jobId}/accept`, {});

      if (error) {
        Alert.alert('Unable to Accept', error);
        return;
      }

      if (data?.success) {
        Alert.alert('Success!', 'Job assigned to you. View it in "My Jobs".');
        fetchAvailableJobs(); // Refresh list to show busy state if applicable
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to accept job');
    } finally {
      setAcceptingId(null);
    }
  };

  const renderJobItem = ({ item }: { item: AvailableJob }) => (
    <View style={s.jobCard}>
      <View style={s.cardHeader}>
        <View style={s.serviceBadge}>
          <Text style={s.serviceText}>{item.service_name}</Text>
        </View>
        <Text style={s.priceText}>₹{item.total_amount}</Text>
      </View>

      <View style={s.detailsBlock}>
        <View style={s.detailRow}>
          <MapPin size={14} color="#64748B" />
          <Text style={s.detailText} numberOfLines={1}>{item.customer_address}</Text>
        </View>
        <View style={s.detailRow}>
          <Calendar size={14} color="#64748B" />
          <Text style={s.detailText}>{item.scheduled_date}</Text>
          <View style={s.dot} />
          <Clock size={14} color="#64748B" />
          <Text style={s.detailText}>{item.scheduled_time_slot}</Text>
        </View>
      </View>

      {item.distance_km !== null && (
        <Text style={s.distanceText}>{item.distance_km.toFixed(1)} km away</Text>
      )}

      <TouchableOpacity
        style={[s.acceptBtn, acceptingId === item.id && s.disabledBtn]}
        onPress={() => handleAcceptJob(item.id)}
        disabled={!!acceptingId}
      >
        {acceptingId === item.id ? (
          <ActivityIndicator color="#FFF" size="small" />
        ) : (
          <>
            <Zap size={16} color="#FFF" fill="#FFF" />
            <Text style={s.acceptText}>Accept Job</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={s.header}>
        <View>
          <Text style={s.title}>Job Marketplace</Text>
          <Text style={s.subtitle}>Open requests matching your skills</Text>
        </View>
        <TouchableOpacity style={s.refreshBtn} onPress={fetchAvailableJobs}>
          <RefreshCw size={20} color={PRIMARY} />
        </TouchableOpacity>
      </View>

      {isBusy ? (
        <View style={s.busyContainer}>
          <View style={s.busyLockBox}>
            <View style={s.lockIconBg}>
              <Zap size={32} color="#FFF" fill="#FFF" />
            </View>
            <Text style={s.busyTitle}>You&apos;re On a Job!</Text>
            <Text style={s.busySub}>
              To ensure quality service, you can only handle one job at a time. Finish your current task to see more.
            </Text>

            <TouchableOpacity
              style={s.activeJobBtn}
              onPress={() => router.push(`/track/${activeJobId}` as any)}
            >
              <Text style={s.activeJobBtnText}>Go to Active Job</Text>
              <ExternalLink size={18} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {loading && jobs.length === 0 ? (
            <View style={s.list}>
              {[1, 2, 3, 4].map(i => <JobCardSkeleton key={i} />)}
            </View>
          ) : (
            <FlatList
              data={jobs}
              renderItem={renderJobItem}
              keyExtractor={item => item.id}
              contentContainerStyle={s.list}
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={fetchAvailableJobs} tintColor={PRIMARY} />
              }
              ListEmptyComponent={
                <EmptyState
                  title="No Jobs Available"
                  description="We'll notify you when new tasks arrive in your area. Check back soon!"
                  imageSource={require('../../assets/images/search-empty.png')}
                  ctaLabel="Refresh Market"
                  onCtaPress={fetchAvailableJobs}
                />
              }
            />
          )}
        </>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  title: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  subtitle: { fontSize: 13, color: '#64748B', marginTop: 2 },
  refreshBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  jobCard: {
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  serviceBadge: { backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  serviceText: { fontSize: 13, fontWeight: '800', color: PRIMARY, textTransform: 'uppercase' },
  priceText: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  detailsBlock: { gap: 10, marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 14, color: '#475569', fontWeight: '500' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 2 },
  distanceText: { fontSize: 12, color: SUCCESS, fontWeight: '700', marginBottom: 16 },
  acceptBtn: {
    height: 54,
    backgroundColor: PRIMARY,
    borderRadius: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  disabledBtn: { opacity: 0.7 },
  acceptText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: '#64748B', fontSize: 15, fontWeight: '500' },
  emptyState: { alignItems: 'center', marginTop: 60, paddingHorizontal: 40 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14, borderWidth: 2, borderColor: PRIMARY },
  retryText: { color: PRIMARY, fontSize: 15, fontWeight: '700' },
  busyContainer: { flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', padding: 24 },
  busyLockBox: { backgroundColor: '#FFF', borderRadius: 32, padding: 32, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: '#E2E8F0', elevation: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
  lockIconBg: { width: 72, height: 72, borderRadius: 36, backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  busyTitle: { fontSize: 24, fontWeight: '900', color: '#0F172A', marginBottom: 12, textAlign: 'center' },
  busySub: { fontSize: 15, color: '#64748B', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  activeJobBtn: { backgroundColor: PRIMARY, borderRadius: 18, paddingVertical: 16, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', justifyContent: 'center' },
  activeJobBtnText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
});
