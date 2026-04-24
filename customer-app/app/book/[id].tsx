import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    AlertCircle,
    ArrowLeft,
    IndianRupee as BadgeIndianRupee,
    Calendar,
    CheckCircle2,
    ChevronRight,
    Clock,
    CreditCard,
    FileText,
    Grid,
    ListTree,
    MapPin,
    Tag,
    Zap
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RazorpayCheckout from 'react-native-razorpay';
import { useAddressStore } from '../../lib/addressStore';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { useBucketStore } from '../../lib/bucketStore';
import BucketFAB from '../../components/BucketFAB';

const PRIMARY = '#1A3FFF';

const TIME_SLOTS = [
    { id: 'now', label: 'Right Now', sub: 'Fastest available worker' },
    { id: 'am', label: '8 AM – 12 PM', sub: 'Morning slot' },
    { id: 'pm', label: '12 PM – 4 PM', sub: 'Afternoon slot' },
    { id: 'eve', label: '4 PM – 8 PM', sub: 'Evening slot' },
];

type Step = 'trade' | 'task' | 'details' | 'confirm';

export default function RequestServiceScreen() {
    const { resume, draftId, service, subservice } = useLocalSearchParams<{ resume?: string; draftId?: string; service?: string; subservice?: string }>();
    const router = useRouter();

    // Data state
    const [servicesData, setServicesData] = useState<any[]>([]);
    const [subcategories, setSubcategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [step, setStep] = useState<Step>('trade');
    const [selectedService, setSelectedService] = useState<any | null>(null);
    const [selectedSubcategory, setSelectedSubcategory] = useState<any | null>(null);

    // Global Address State
    const { selectedAddress } = useAddressStore();

    // Details Form
    const [description, setDescription] = useState('');
    const [selectedDate, setSelectedDate] = useState('Today');
    const [selectedSlot, setSelectedSlot] = useState<typeof TIME_SLOTS[0]>(TIME_SLOTS[0]);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'cod' | 'online'>('cod');
    const [submitting, setSubmitting] = useState(false);
    const [coupons, setCoupons] = useState<any[]>([]);
    const [selectedCoupon, setSelectedCoupon] = useState<any>(null);
    const [selectedFrequency, setSelectedFrequency] = useState<'one_time' | 'daily' | 'weekly'>('one_time');
    const [isGold, setIsGold] = useState(false);
    const [settings, setSettings] = useState<Record<string, number>>({
        platform_fee_flat: 15,
        platform_fee_percent: 0.10,
        tax_rate: 0.18
    });

    useEffect(() => {
        fetchData();
        fetchCoupons();
        fetchGoldStatus();
    }, []);

    const checkExistingDraft = async (srvs: any[], subs: any[]) => {
        try {
            if (resume !== 'true' || !draftId) return;

            const { data: res } = await api.get('/api/v1/drafts');
            if (res && res.data && res.data.length > 0) {
                const draft = res.data.find((d: any) => d.id === draftId);
                if (draft) {
                    // Populate Form
                    const formData = draft.form_data;
                    
                    if (formData.selectedServiceId && srvs.length > 0) {
                        const matchedSrv = srvs.find(s => s.id === formData.selectedServiceId);
                        if (matchedSrv) setSelectedService(matchedSrv);
                    }

                    if (formData.selectedSubcategoryId && subs.length > 0) {
                        const matchedSub = subs.find(s => s.id === formData.selectedSubcategoryId);
                        if (matchedSub) setSelectedSubcategory(matchedSub);
                    }
                    if (formData.description) setDescription(formData.description);
                    if (formData.selectedDate) setSelectedDate(formData.selectedDate);
                    if (formData.selectedSlot) setSelectedSlot(formData.selectedSlot);
                    if (formData.selectedPaymentMethod) setSelectedPaymentMethod(formData.selectedPaymentMethod);
                    if (formData.selectedFrequency) setSelectedFrequency(formData.selectedFrequency);
                    
                    // Set Step
                    const steps: Step[] = ['trade', 'task', 'details', 'confirm'];
                    if (draft.current_step > 0 && draft.current_step <= steps.length) {
                        setStep(steps[draft.current_step - 1]);
                    }
                }
            }
        } catch (e) {
            console.error("Error checking drafts", e);
        }
    };

    const saveDraft = async (targetStep?: Step) => {
        const steps: Step[] = ['trade', 'task', 'details', 'confirm'];
        const stepIndex = targetStep ? steps.indexOf(targetStep) : steps.indexOf(step);
        
        if (!selectedService || !selectedSubcategory) return;

        try {
            await api.post('/api/v1/drafts', {
                serviceId: selectedSubcategory.id,
                currentStep: stepIndex + 1,
                totalSteps: steps.length,
                formData: {
                    selectedServiceId: selectedService.id,
                    selectedSubcategoryId: selectedSubcategory.id,
                    description,
                    selectedDate,
                    selectedSlot,
                    selectedPaymentMethod,
                    selectedFrequency,
                    selectedAddressId: selectedAddress?.id
                }
            });
        } catch (e) {
            console.error("Draft save failed", e);
        }
    };

    const fetchGoldStatus = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase.from('profiles').select('is_gold').eq('id', user.id).single();
        if (profile) setIsGold(!!profile.is_gold);
    };

    const fetchCoupons = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Fetch active coupons
        const { data: availableCoupons } = await supabase
            .from('coupons')
            .select('*')
            .eq('is_active', true)
            .gte('valid_till', new Date().toISOString());

        // Fetch used coupons by this user
        const { data: usedCoupons } = await supabase
            .from('coupon_usages')
            .select('coupon_id')
            .eq('customer_id', user.id);

        const usedIds = usedCoupons?.map(u => u.coupon_id) || [];
        const validUnused = availableCoupons?.filter(c => !usedIds.includes(c.id)) || [];
        setCoupons(validUnused);
    };

    const fetchSettings = async () => {
        const { data } = await supabase.from('system_settings').select('key, value_numeric');
        if (data) {
            const mapped = data.reduce((acc: any, curr: any) => {
                acc[curr.key] = Number(curr.value_numeric);
                return acc;
            }, {});
            setSettings(prev => ({ ...prev, ...mapped }));
        }
    };

    const fetchData = async () => {
        setLoading(true);
        fetchSettings();
        const { data: srvs } = await supabase.from('services').select('*').eq('is_active', true).order('priority_number', { ascending: false }).order('name', { ascending: true });
        const { data: subs } = await supabase.from('service_subcategories').select('*').eq('is_active', true);

        if (srvs) setServicesData(srvs);
        if (subs) setSubcategories(subs);

        // Pre-select if a "service" parameter was passed in
        if (service && srvs) {
            const matchedService = srvs.find(s => s.name.toLowerCase() === service.toLowerCase() || s.id === service);
            if (matchedService) {
                setSelectedService(matchedService);
                setStep('task'); // Skip to asking for task

                // Check if a specific subservice was also passed
                if (subservice && subs) {
                    const matchedSub = subs.find(sub => (sub.name.toLowerCase() === subservice.toLowerCase() || sub.id === subservice) && sub.service_id === matchedService.id);
                    if (matchedSub) {
                        setSelectedSubcategory(matchedSub);
                        setStep('details'); // Skip straight to address/time
                    }
                }
            }
        }
        
        // After fetching all data, check for existing draft to restore
        checkExistingDraft(srvs || [], subs || []);
        
        setLoading(false);
    };

    const getEstimate = () => {
        const base = selectedSubcategory?.base_price || 0;
        const taxRate = settings.tax_rate ?? 0.18;
        const tax = base * taxRate;
        const platformBase = settings.platform_fee_flat ?? 15;
        const platform = isGold ? 0 : platformBase; // Zero fee for Workla Gold

        let discount = 0;
        if (selectedCoupon) {
            if (selectedCoupon.discount_type === 'percentage') {
                discount = (base * selectedCoupon.discount_value) / 100;
                if (selectedCoupon.max_discount) {
                    discount = Math.min(discount, selectedCoupon.max_discount);
                }
            } else {
                discount = selectedCoupon.discount_value;
            }
        }

        const total = Math.max(0, base + tax + platform - discount);
        return {
            base: base.toFixed(0),
            tax: tax.toFixed(0),
            platform: platform.toFixed(0),
            discount: discount.toFixed(0),
            total: total.toFixed(0)
        };
    };

    const estimate = getEstimate();
    // ── Submit ──────────────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!selectedService || !selectedSubcategory || !selectedAddress) {
            Alert.alert('Missing Info', 'Please complete all fields and select a valid address.');
            return;
        }
        setSubmitting(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                Alert.alert('Authentication Error', 'You must be logged in to book a service.');
                setSubmitting(false);
                return;
            }

            // Fetch profile for Razorpay (name, email)
            const { data: profile } = await supabase.from('profiles').select('full_name, phone').eq('id', user.id).single();

            const currentEstimate = getEstimate();

            // Use the global Address Store exclusively 
            let finalLat = selectedAddress?.latitude || null;
            let finalLng = selectedAddress?.longitude || null;

            const scheduledDateISO = selectedDate === 'Today'
                ? new Date().toISOString().split('T')[0]
                : new Date(Date.now() + 86400000).toISOString().split('T')[0];

            const bookingData = {
                serviceId: selectedService.id,
                subcategoryId: selectedSubcategory.id,
                scheduledDate: scheduledDateISO,
                scheduledTimeSlot: selectedSlot.label,
                customerLatitude: finalLat,
                customerLongitude: finalLng,
                customerAddress: selectedAddress?.address || 'Unknown Address',
                specialInstructions: description.trim() || null,
                paymentMethod: selectedPaymentMethod,
                totalAmount: parseFloat(currentEstimate.total),
                catalogPrice: parseFloat(currentEstimate.base),
                platformFee: parseFloat(currentEstimate.platform),
                taxAmount: parseFloat(currentEstimate.tax),
                frequency: selectedFrequency,
                serviceNameSnapshot: selectedService.name,
                couponId: selectedCoupon?.id || null,
                couponDiscount: parseFloat(currentEstimate.discount) || 0
            };

            const res = await api.post('/api/v1/bookings', bookingData);

            if (!res.data) {
                const errorMsg = res.details || res.error || 'Booking failed';
                throw new Error(errorMsg);
            }

            const bookingId = res.data.id;

            // 💳 HANDLE RAZORPAY FLOW
            if (selectedPaymentMethod === 'online') {
                // 🛑 CRITICAL NATIVE CHECK
                // Since react-native-razorpay depends on native code, it will NOT work in standard Expo Go.
                // We check if the module is available to prevent a crash.
                const { NativeModules: RNModules } = require('react-native');
                if (!RNModules.RNRazorpayCheckout) {
                    Alert.alert(
                        'Native Module Missing',
                        'Razorpay native module is not detected. \n\n' +
                        'This occurs when running in standard Expo Go. To use Razorpay, you MUST use a Development Build.\n\n' +
                        'Please run: npx expo run:android'
                    );
                    setSubmitting(false);
                    return;
                }

                try {
                    // 1. Create Order on Backend
                    const orderRes = await api.post('/api/v1/payments/orders', { bookingId });
                    
                    if (!orderRes.data) {
                        const errorMsg = orderRes.error || 'Failed to initialize payment order.';
                        const details = (orderRes as any).details ? `\n\nDetails: ${(orderRes as any).details}` : '';
                        throw new Error(`${errorMsg}${details}`);
                    }

                    const { orderId, amount, currency, keyId } = orderRes.data;

                    // 2. Open Razorpay Checkout Modal
                    const options = {
                        description: `Payment for ${selectedService.name} - ${selectedSubcategory.name}`,
                        image: 'https://i.imgur.com/3g7nmJC.png', // Placeholder icon
                        currency: currency,
                        key: keyId,
                        amount: amount,
                        name: 'Workla',
                        order_id: orderId,
                        prefill: {
                            email: user.email,
                            contact: profile?.phone || '',
                            name: profile?.full_name || ''
                        },
                        theme: { color: PRIMARY }
                    };

                    // Handle External Wallets (Paytm, etc.)
                    RazorpayCheckout.onExternalWalletSelection((data: any) => {
                        console.log('[Razorpay] External wallet selected:', data.external_wallet);
                        // Optional: Show a message to the user
                    });

                    const rzpData = await RazorpayCheckout.open(options);

                    // 3. Verify Payment Signature
                    const verifyRes = await api.post('/api/v1/payments/verify', {
                        razorpay_order_id: rzpData.razorpay_order_id,
                        razorpay_payment_id: rzpData.razorpay_payment_id,
                        razorpay_signature: rzpData.razorpay_signature
                    });

                    if (verifyRes.error || !verifyRes.data) {
                        const errorMsg = verifyRes.error || 'Payment verification failed.';
                        const details = (verifyRes as any).details ? `\n\nDetails: ${(verifyRes as any).details}` : '';
                        throw new Error(`${errorMsg}${details}`);
                    }
                } catch (rzpErr: any) {
                    console.error('[Razorpay Error]', rzpErr);
                    // If user cancelled or failed, we keep the booking but it's pending.
                    // Or we could delete the booking depending on business logic.
                    // For now, let's just alert.
                    Alert.alert('Payment Incomplete', 'The payment was not completed. You can try paying from the booking details screen later if available.');
                    // Navigate anyway? Or stay back?
                    // Typically if payment is mandatory, we might want to prevent navigation.
                }
            }

            // Cleanup draft if it exists
            if (draftId) {
                await api.delete(`/api/v1/drafts/${draftId}`).catch(() => {});
            }

            router.replace(`/track/${bookingId}` as any);

        } catch (err: any) {
            Alert.alert('Error', err.message ?? 'Something went wrong. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleNext = () => {
        if (step === 'trade') {
            if (!selectedService) return;
            setStep('task');
            saveDraft('task');
        } else if (step === 'task') {
            if (!selectedSubcategory) return;
            setStep('details');
            saveDraft('details');
        } else if (step === 'details') {
            if (!selectedAddress) {
                Alert.alert('Address Required', 'Please select an address from your address book.');
                return;
            }
            setStep('confirm');
            saveDraft('confirm');
        } else if (step === 'confirm') {
            handleSubmit();
        }
    };

    const handleBackBtn = () => {
        if (step === 'trade') router.back();
        if (step === 'task') setStep('trade');
        if (step === 'details') setStep('task');
        if (step === 'confirm') setStep('details');
    }

    const canGoNext =
        (step === 'trade' && !!selectedService) ||
        (step === 'task' && !!selectedSubcategory) ||
        (step === 'details' && !!selectedAddress) ||
        (step === 'confirm');

    // ── Step Indicator ──────────────────────────────────────────────────────────
    const StepDot = ({ stepName, label }: { stepName: Step; label: string }) => {
        const steps = ['trade', 'task', 'details', 'confirm'];
        const current = steps.indexOf(step);
        const myIndex = steps.indexOf(stepName);
        const done = myIndex < current;
        const active = myIndex === current;
        return (
            <View style={stepStyles.dotWrap}>
                <View style={[stepStyles.dot, done && stepStyles.dotDone, active && stepStyles.dotActive]}>
                    {done ? <CheckCircle2 size={10} color="#FFF" /> : (
                        <Text style={stepStyles.dotNum}>{myIndex + 1}</Text>
                    )}
                </View>
                <Text style={[stepStyles.dotLabel, active && stepStyles.dotLabelActive]} numberOfLines={1}>{label}</Text>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={handleBackBtn}>
                    <ArrowLeft size={22} color="#111827" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Configure Booking</Text>
                <View style={{ width: 40 }} />
            </View>

            {/* Step bar */}
            <View style={stepStyles.bar}>
                <StepDot stepName="trade" label="Trade" />
                <View style={stepStyles.line} />
                <StepDot stepName="task" label="Task" />
                <View style={stepStyles.line} />
                <StepDot stepName="details" label="Details" />
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                    {loading ? (
                        <ActivityIndicator color={PRIMARY} style={{ marginTop: 40 }} size="large" />
                    ) : (
                        <>
                            {/* ── STEP 1: SERVICE (TRADE) ── */}
                            {step === 'trade' && (
                                <View>
                                    <View style={styles.tierHeader}>
                                        <Grid size={22} color={PRIMARY} />
                                        <View>
                                            <Text style={styles.stepTitle}>Select Trade</Text>
                                            <Text style={styles.stepSub}>What kind of expert do you need?</Text>
                                        </View>
                                    </View>

                                    <View style={styles.listContainer}>
                                        {servicesData.length === 0 ? (
                                            <Text style={styles.emptyText}>No trades found.</Text>
                                        ) : servicesData.map((srv) => {
                                            const active = selectedService?.id === srv.id;
                                            return (
                                                <TouchableOpacity
                                                    key={srv.id}
                                                    style={[styles.tierRow, active && styles.tierRowActive]}
                                                    onPress={() => {
                                                        setSelectedService(srv);
                                                        setSelectedSubcategory(null);
                                                    }}
                                                >
                                                    <View style={styles.tierIcon}><Zap size={14} color={active ? PRIMARY : '#6B7280'} /></View>
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={[styles.tierName, active && styles.tierNameActive]}>{srv.name}</Text>
                                                            {srv.service_code && <Text style={styles.tierCode}>{srv.service_code}</Text>}
                                                        </View>
                                                    </View>
                                                    {active && <CheckCircle2 size={18} color={PRIMARY} />}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            )}

                            {/* ── STEP 2: SUBCATEGORY (TASK) ── */}
                            {step === 'task' && (
                                <View>
                                    <View style={styles.tierHeader}>
                                        <ListTree size={22} color={PRIMARY} />
                                        <View>
                                            <Text style={styles.stepTitle}>Specific Task</Text>
                                            <Text style={styles.stepSub}>What exactly do you need done?</Text>
                                        </View>
                                    </View>

                                    <View style={styles.listContainer}>
                                        {subcategories.filter(s => s.service_id === selectedService?.id).length === 0 ? (
                                            <Text style={styles.emptyText}>No specific tasks found for this trade.</Text>
                                        ) : subcategories.filter(s => s.service_id === selectedService?.id).map(sub => {
                                            const active = selectedSubcategory?.id === sub.id;
                                            return (
                                                <TouchableOpacity
                                                    key={sub.id}
                                                    style={[styles.tierRow, active && styles.tierRowActive]}
                                                    onPress={() => setSelectedSubcategory(sub)}
                                                >
                                                    <View style={{ flex: 1 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                            <Text style={[styles.tierName, active && styles.tierNameActive]}>{sub.name}</Text>
                                                            {sub.subcategory_code && <Text style={styles.tierCode}>{sub.subcategory_code}</Text>}
                                                        </View>
                                                        <Text style={styles.subPrice}>Starts at ₹{sub.base_price}</Text>
                                                    </View>
                                                    {active && <CheckCircle2 size={18} color={PRIMARY} />}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>

                                    <View style={styles.infoBanner}>
                                        <Zap size={16} color="#7C3AED" />
                                        <Text style={styles.infoBannerText}>
                                            Workers in your area are notified instantly. Fastest expert accepts the job!
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* ── STEP 3: Details ── */}
                            {step === 'details' && (
                                <View>
                                    <Text style={styles.stepTitle}>Where & When?</Text>
                                    <Text style={styles.stepSub}>Give us your location and preferred time.</Text>

                                    {/* Address Selection Button */}
                                    <Text style={styles.fieldLabel}>Service Address</Text>
                                    <TouchableOpacity
                                        style={styles.addressSelectorBtn}
                                        onPress={() => router.push('/addresses?selectable=true')}
                                    >
                                        <View style={styles.addressSelectorLeft}>
                                            <MapPin size={20} color={selectedAddress ? PRIMARY : '#9CA3AF'} />
                                            {selectedAddress ? (
                                                <View style={{ flex: 1 }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                        <Text style={styles.addressSelectorTitle}>{selectedAddress.name}</Text>
                                                        {selectedAddress.label && (
                                                            <View style={styles.addressSelectorBadge}>
                                                                <Text style={styles.addressSelectorBadgeText}>{selectedAddress.label}</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <Text style={styles.addressSelectorAddress} numberOfLines={2}>
                                                        {selectedAddress.address}
                                                    </Text>
                                                </View>
                                            ) : (
                                                <Text style={styles.addressSelectorPlaceholder}>Select an address from your Address Book</Text>
                                            )}
                                        </View>
                                        <ChevronRight size={20} color="#9CA3AF" />
                                    </TouchableOpacity>

                                    {/* Description */}
                                    <Text style={styles.fieldLabel}>Describe the Issue (Optional)</Text>
                                    <View style={[styles.inputWrap, styles.textAreaWrap]}>
                                        <FileText size={18} color="#9CA3AF" style={{ marginTop: 2 }} />
                                        <TextInput
                                            style={[styles.input, styles.textArea]}
                                            placeholder="E.g. Tap is leaking, need urgent fix..."
                                            placeholderTextColor="#9CA3AF"
                                            value={description}
                                            onChangeText={setDescription}
                                            multiline
                                            numberOfLines={3}
                                            textAlignVertical="top"
                                        />
                                    </View>

                                    {/* Frequency Selection */}
                                    <Text style={styles.fieldLabel}>Frequency</Text>
                                    <View style={styles.dateRow}>
                                        {[
                                            { id: 'one_time', label: 'One-time', supported: selectedSubcategory?.is_one_time },
                                            { id: 'daily', label: 'Daily', supported: selectedSubcategory?.is_daily },
                                            { id: 'weekly', label: 'Weekly', supported: selectedSubcategory?.is_weekly },
                                            { id: 'monthly', label: 'Monthly', supported: selectedSubcategory?.is_monthly },
                                        ].filter(f => f.supported).map((f) => (
                                            <TouchableOpacity
                                                key={f.id}
                                                style={[styles.dateChip, selectedFrequency === f.id && styles.dateChipActive]}
                                                onPress={() => setSelectedFrequency(f.id as any)}
                                            >
                                                <Text style={[styles.dateChipText, selectedFrequency === f.id && styles.dateChipTextActive]}>
                                                    {f.label}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Date Selector */}
                                    <Text style={styles.fieldLabel}>Date</Text>
                                    <View style={styles.dateRow}>
                                        {['Today', 'Tomorrow'].map((d) => (
                                            <TouchableOpacity
                                                key={d}
                                                style={[styles.dateChip, selectedDate === d && styles.dateChipActive]}
                                                onPress={() => setSelectedDate(d)}
                                            >
                                                <Calendar size={14} color={selectedDate === d ? '#FFF' : '#6B7280'} />
                                                <Text style={[styles.dateChipText, selectedDate === d && styles.dateChipTextActive]}>
                                                    {d}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Time Slots */}
                                    <Text style={styles.fieldLabel}>Preferred Time</Text>
                                    {TIME_SLOTS.map((slot) => {
                                        const active = selectedSlot.id === slot.id;
                                        return (
                                            <TouchableOpacity
                                                key={slot.id}
                                                style={[styles.slotRow, active && styles.slotRowActive]}
                                                onPress={() => setSelectedSlot(slot)}
                                                activeOpacity={0.8}
                                            >
                                                <Clock size={16} color={active ? PRIMARY : '#9CA3AF'} />
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={[styles.slotLabel, active && styles.slotLabelActive]}>
                                                        {slot.label}
                                                    </Text>
                                                    <Text style={styles.slotSub}>{slot.sub}</Text>
                                                </View>
                                                {active && <CheckCircle2 size={18} color={PRIMARY} />}
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            )}

                            {/* ── STEP 4: Confirm ── */}
                            {step === 'confirm' && (
                                <View>
                                    <Text style={styles.stepTitle}>Review & Confirm</Text>
                                    <Text style={styles.stepSub}>Check your details before sending the request.</Text>

                                    {/* Summary card */}
                                    <View style={styles.summaryCard}>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryKey}>Service</Text>
                                            <Text style={styles.summaryVal}>{selectedService?.name}</Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryKey}>Task</Text>
                                            <Text style={styles.summaryVal}>{selectedSubcategory?.name}</Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryKey}>Address</Text>
                                            <Text style={[styles.summaryVal, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                                                {selectedAddress?.address || 'None selected'}
                                            </Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryKey}>Date & Time</Text>
                                            <Text style={styles.summaryVal}>{selectedDate}, {selectedSlot.label}</Text>
                                        </View>
                                        <View style={styles.summaryRow}>
                                            <Text style={styles.summaryKey}>Frequency</Text>
                                            <Text style={[styles.summaryVal, { textTransform: 'capitalize' }]}>{selectedFrequency.replace('_', ' ')}</Text>
                                        </View>
                                        {description.trim().length > 0 && (
                                            <View style={styles.summaryRow}>
                                                <Text style={styles.summaryKey}>Notes</Text>
                                                <Text style={[styles.summaryVal, { flex: 1, textAlign: 'right' }]}>
                                                    {description}
                                                </Text>
                                            </View>
                                        )}
                                    </View>

                                    {/* Coupons Section */}
                                    <View style={styles.couponSection}>
                                        <View style={styles.sectionLabelRow}>
                                            <Tag size={16} color={PRIMARY} />
                                            <Text style={styles.sectionLabelCaps}>Coupons & Offers</Text>
                                        </View>

                                        {coupons.length === 0 ? (
                                            <View style={styles.noCouponBox}>
                                                <Text style={styles.noCouponText}>No coupons available at the moment.</Text>
                                            </View>
                                        ) : (
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.couponScroll}>
                                                {coupons.map(c => {
                                                    const active = selectedCoupon?.id === c.id;
                                                    return (
                                                        <TouchableOpacity
                                                            key={c.id}
                                                            style={[styles.couponChip, active && styles.couponChipActive]}
                                                            onPress={() => setSelectedCoupon(active ? null : c)}
                                                        >
                                                            <Text style={[styles.couponCode, active && styles.couponTextActive]}>{c.code}</Text>
                                                            <Text style={[styles.couponInfo, active && styles.couponTextActive]}>
                                                                {c.discount_type === 'percentage' ? `${c.discount_value}% OFF` : `₹${c.discount_value} OFF`}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </ScrollView>
                                        )}
                                        {selectedCoupon && (
                                            <Text style={styles.appliedMsg}>
                                                🎉 Applied! You save ₹{estimate.discount}
                                            </Text>
                                        )}
                                    </View>

                                    {/* Payment Method */}
                                    <View style={styles.couponSection}>
                                        <Text style={styles.fareTitle}>Payment Method</Text>
                                        <View style={{ gap: 10, marginTop: 12 }}>
                                            <TouchableOpacity
                                                style={[styles.slotRow, selectedPaymentMethod === 'cod' && styles.slotRowActive]}
                                                onPress={() => setSelectedPaymentMethod('cod')}
                                                activeOpacity={0.8}
                                            >
                                                <BadgeIndianRupee size={20} color={selectedPaymentMethod === 'cod' ? PRIMARY : '#9CA3AF'} />
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={[styles.slotLabel, selectedPaymentMethod === 'cod' && styles.slotLabelActive]}>Pay after Service (Cash/UPI)</Text>
                                                    <Text style={styles.slotSub}>Pay the professional directly upon completion</Text>
                                                </View>
                                                {selectedPaymentMethod === 'cod' && <CheckCircle2 size={18} color={PRIMARY} />}
                                            </TouchableOpacity>

                                            <TouchableOpacity
                                                style={[styles.slotRow, selectedPaymentMethod === 'online' && styles.slotRowActive]}
                                                onPress={() => setSelectedPaymentMethod('online')}
                                                activeOpacity={0.8}
                                            >
                                                <CreditCard size={20} color={selectedPaymentMethod === 'online' ? PRIMARY : '#9CA3AF'} />
                                                <View style={{ flex: 1, marginLeft: 12 }}>
                                                    <Text style={[styles.slotLabel, selectedPaymentMethod === 'online' && styles.slotLabelActive]}>Pay Online</Text>
                                                    <Text style={styles.slotSub}>Credit/Debit Card, UPI, Netbanking</Text>
                                                </View>
                                                {selectedPaymentMethod === 'online' && <CheckCircle2 size={18} color={PRIMARY} />}
                                            </TouchableOpacity>
                                        </View>
                                    </View>

                                    {/* Fare breakdown */}
                                    <View style={styles.fareCard}>
                                        <Text style={styles.fareTitle}>Estimated Fare</Text>
                                        <View style={styles.fareRow}>
                                            <Text style={styles.fareLabel}>Base Service Fare</Text>
                                            <Text style={styles.fareVal}>₹{estimate.base}</Text>
                                        </View>
                                        <View style={styles.fareRow}>
                                            <Text style={styles.fareLabel}>GST (18%)</Text>
                                            <Text style={styles.fareVal}>₹{estimate.tax}</Text>
                                        </View>
                                        <View style={styles.fareRow}>
                                            <Text style={styles.fareLabel}>Platform Fee</Text>
                                            <Text style={styles.fareVal}>₹{estimate.platform}</Text>
                                        </View>
                                        {selectedCoupon && (
                                            <View style={styles.fareRow}>
                                                <Text style={[styles.fareLabel, { color: '#059669', fontWeight: '700' }]}>Coupon Discount</Text>
                                                <Text style={[styles.fareVal, { color: '#059669', fontWeight: '700' }]}>- ₹{estimate.discount}</Text>
                                            </View>
                                        )}
                                        <View style={styles.fareTotalRow}>
                                            <Text style={styles.fareTotalLabel}>Total Amount</Text>
                                            <Text style={styles.fareTotalVal}>₹{estimate.total}</Text>
                                        </View>
                                        <View style={styles.fareNotice}>
                                            <AlertCircle size={13} color="#9CA3AF" />
                                            <Text style={styles.fareNoteText}>
                                                Final amount may vary. Surge pricing applies during peak hours.
                                            </Text>
                                        </View>
                                    </View>
                                </View>
                            )}
                        </>
                    )}

                    <View style={{ height: 120 }} />
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Footer CTA */}
            <View style={styles.footer}>
                {/* Add to Bucket — shown when task is selected and we're not at confirm */}
                {step === 'task' && selectedSubcategory && (
                    <TouchableOpacity
                        style={styles.bucketBtn}
                        activeOpacity={0.85}
                        onPress={() => {
                            const currentEstimate = getEstimate();
                            const added = useBucketStore.getState().addItem({
                                serviceId: selectedService!.id,
                                serviceName: selectedService!.name,
                                subcategoryId: selectedSubcategory!.id,
                                subcategoryName: selectedSubcategory!.name,
                                basePrice: parseFloat(currentEstimate.base),
                                mode: 'now',
                                scheduledDate: 'Today',
                                scheduledSlot: '8 AM – 12 PM',
                                specialInstructions: '',
                                paymentMethod: 'cod',
                                platformFee: parseFloat(currentEstimate.platform),
                                taxAmount: parseFloat(currentEstimate.tax),
                                totalAmount: parseFloat(currentEstimate.total),
                            });
                            if (!added) {
                                Alert.alert('Bucket Full', 'You can add up to 3 services at a time.');
                            } else {
                                router.back();
                            }
                        }}
                    >
                        <Text style={styles.bucketBtnText}>+ Add to Bucket</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.nextBtn, !canGoNext && styles.nextBtnDisabled, step === 'task' && selectedSubcategory && { flex: 1 }]}
                    onPress={handleNext}
                    disabled={!canGoNext || submitting}
                    activeOpacity={0.85}
                >
                    {submitting ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <>
                            <Text style={styles.nextBtnText}>
                                {step === 'confirm' ? 'Send Request' : 'Continue'}
                            </Text>
                            {step !== 'confirm' && <ChevronRight size={18} color="#FFF" />}
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Floating bucket button */}
            <BucketFAB />
        </SafeAreaView>
    );
}

const stepStyles = StyleSheet.create({
    bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    dotWrap: { alignItems: 'center', gap: 4, width: 44, overflow: 'visible' },
    dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center' },
    dotActive: { backgroundColor: PRIMARY },
    dotDone: { backgroundColor: '#10B981' },
    dotNum: { fontSize: 10, fontWeight: '700', color: '#9CA3AF' },
    dotLabel: { fontSize: 9, color: '#9CA3AF', fontWeight: '500' },
    dotLabelActive: { color: PRIMARY, fontWeight: '700' },
    line: { flex: 1, height: 2, backgroundColor: '#E5E7EB', marginHorizontal: -4 },
});

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFF' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
    scroll: { padding: 20 },

    tierHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
    stepTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 2 },
    stepSub: { fontSize: 13, color: '#9CA3AF', lineHeight: 19 },

    listContainer: { gap: 10, marginBottom: 20 },
    tierRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, padding: 16 },
    tierRowActive: { borderColor: PRIMARY, backgroundColor: '#EEF2FF' },
    tierIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
    tierName: { fontSize: 15, fontWeight: '700', color: '#374151' },
    tierNameActive: { color: PRIMARY },
    tierCode: { fontSize: 9, color: '#9CA3AF', fontWeight: '800', backgroundColor: '#F3F4F6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
    subPrice: { fontSize: 12, color: '#9CA3AF', marginTop: 4 },
    emptyText: { color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', marginVertical: 20 },

    // Info banner
    infoBanner: { flexDirection: 'row', backgroundColor: '#F5F3FF', borderRadius: 12, padding: 14, gap: 10, alignItems: 'flex-start', borderWidth: 1, borderColor: '#EDE9FE', marginTop: 10 },
    infoBannerText: { flex: 1, fontSize: 12, color: '#6D28D9', lineHeight: 18 },

    // Form fields
    fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 16 },
    inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    textAreaWrap: { alignItems: 'flex-start' },
    input: { flex: 1, fontSize: 14, color: '#111827' },
    textArea: { minHeight: 80 },
    // Date chips
    dateRow: { flexDirection: 'row', gap: 10 },
    dateChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
    dateChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    dateChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
    dateChipTextActive: { color: '#FFF' },
    // Time slots
    slotRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 14, padding: 14, marginBottom: 8 },
    slotRowActive: { borderColor: PRIMARY, backgroundColor: '#EEF2FF' },
    slotLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
    slotLabelActive: { color: PRIMARY },
    slotSub: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
    // Summary card
    summaryCard: { backgroundColor: '#F9FAFB', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
    summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 12 },
    summaryKey: { fontSize: 13, color: '#9CA3AF', fontWeight: '500', minWidth: 80 },
    summaryVal: { fontSize: 13, fontWeight: '700', color: '#111827' },
    // Fare card
    fareCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 16 },
    fareTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 12 },
    fareRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    fareLabel: { fontSize: 13, color: '#6B7280' },
    fareVal: { fontSize: 13, fontWeight: '600', color: '#111827' },
    fareTotalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 12, marginTop: 4, marginBottom: 10 },
    fareTotalLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
    fareTotalVal: { fontSize: 16, fontWeight: '800', color: PRIMARY },
    fareNotice: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    fareNoteText: { flex: 1, fontSize: 11, color: '#9CA3AF', lineHeight: 16 },

    footer: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 24, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
    nextBtn: { flex: 1, height: 52, borderRadius: 14, backgroundColor: PRIMARY, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, shadowColor: PRIMARY, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
    nextBtnDisabled: { backgroundColor: '#C7D2FE', shadowOpacity: 0 },
    nextBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
    bucketBtn: { height: 52, borderRadius: 14, borderWidth: 2, borderColor: PRIMARY, paddingHorizontal: 16, justifyContent: 'center', alignItems: 'center' },
    bucketBtnText: { fontSize: 14, fontWeight: '800', color: PRIMARY },
    // Saved address chips
    savedAddrChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: `${PRIMARY}40`, backgroundColor: '#EEF2FF' },
    savedAddrChipActive: { backgroundColor: PRIMARY, borderColor: PRIMARY },
    savedAddrLabel: { fontSize: 12, fontWeight: '700', color: PRIMARY },
    // Coupon Section
    couponSection: { marginBottom: 20 },
    sectionLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    sectionLabelCaps: { fontSize: 12, fontWeight: '800', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
    couponScroll: { gap: 10, paddingRight: 20 },
    couponChip: {
        backgroundColor: '#FFF',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        borderRadius: 14,
        paddingHorizontal: 16,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    couponChipActive: {
        borderColor: PRIMARY,
        backgroundColor: '#EEF2FF',
    },
    couponCode: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 2 },
    couponInfo: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
    couponTextActive: { color: PRIMARY },
    noCouponBox: { padding: 16, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, borderStyle: 'dashed' },
    noCouponText: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
    appliedMsg: { fontSize: 12, color: '#059669', fontWeight: '700', marginTop: 8 },
    addressSelectorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F9FAFB',
        borderWidth: 1.5,
        borderColor: '#E5E7EB',
        borderRadius: 12,
        padding: 16,
        marginBottom: 8,
    },
    addressSelectorLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        flex: 1,
        paddingRight: 10,
    },
    addressSelectorTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    addressSelectorBadge: {
        backgroundColor: '#EEF2FF',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    addressSelectorBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: PRIMARY,
        textTransform: 'uppercase',
    },
    addressSelectorAddress: {
        fontSize: 13,
        color: '#6B7280',
        lineHeight: 18,
    },
    addressSelectorPlaceholder: {
        fontSize: 14,
        color: '#6B7280',
    },
});
