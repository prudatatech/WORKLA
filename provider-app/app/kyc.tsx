import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { pickAndCompressImage } from '../lib/image';
import { useRouter } from 'expo-router';
import { ChevronRight, FileText, Landmark } from 'lucide-react-native';
import React, { useState, useEffect, useCallback } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View, Platform } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { supabase } from '../lib/supabase';

export default function KycScreen() {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const router = useRouter();

    const TOTAL_STEPS = 2;

    const [aadhaarUri, setAadhaarUri] = useState<string | null>(null);
    const [aadhaarNumber, setAadhaarNumber] = useState('');
    const [aadhaarName, setAadhaarName] = useState<string>('');

    const [panUri, setPanUri] = useState<string | null>(null);
    const [panName, setPanName] = useState<string>('');
    const [panNumber, setPanNumber] = useState('');

    const [bankAccountName, setBankAccountName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [ifscCode, setIfscCode] = useState('');

    const loadExistingData = useCallback(async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: docs } = await supabase.from('provider_documents').select('*').eq('provider_id', user.id);
            if (docs) {
                const aadhaar = docs.find(d => d.document_type === 'aadhaar');
                const pan = docs.find(d => d.document_type === 'pan');
                if (aadhaar) {
                    setAadhaarNumber(aadhaar.document_number || '');
                    if (aadhaar.verified_status !== 'rejected') setAadhaarUri('EXISTING');
                }
                if (pan) {
                    setPanNumber(pan.document_number || '');
                    if (pan.verified_status !== 'rejected') setPanUri('EXISTING');
                }
            }
            
            const { data: bank } = await supabase.from('provider_bank_accounts').select('*').eq('provider_id', user.id).maybeSingle();
            if (bank) {
                setBankAccountName(bank.account_holder_name || '');
                setIfscCode(bank.ifsc_code || '');
            }

        } catch (e) {
            console.error('Error loading KYC data:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadExistingData();
    }, [loadExistingData]);

    const pickDocument = async (type: 'aadhaar' | 'pan') => {
        try {
            const compressed = await pickAndCompressImage(0.7, 1200);
            if (compressed && compressed.uri) {
                if (type === 'aadhaar') {
                    setAadhaarUri(compressed.uri);
                    setAadhaarName(`Aadhaar_${Date.now()}.jpg`);
                } else {
                    setPanUri(compressed.uri);
                    setPanName(`PAN_${Date.now()}.jpg`);
                }
            }
        } catch (e) {
            Alert.alert('Error', 'Failed to pick image');
        }
    };

    const uploadDocument = async (userId: string, uri: string, type: 'aadhaar' | 'pan') => {
        if (uri === 'EXISTING') return null;

        const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
        const filePath = `${userId}/${type}_${Date.now()}.jpg`;
        
        const { error: uploadError } = await supabase.storage
            .from('provider-documents')
            .upload(filePath, decode(base64), { contentType: 'image/jpeg' });

        if (uploadError) throw uploadError;

        return filePath;
    };

    const submitKYC = async () => {
        setLoading(true);
        setErrorMsg(null);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            // Documents
            const docPromises = [];
            
            if (aadhaarUri && aadhaarNumber) {
                docPromises.push((async () => {
                    const urlOrPath = await uploadDocument(user.id, aadhaarUri, 'aadhaar');
                    const update: any = {
                        provider_id: user.id,
                        document_type: 'aadhaar',
                        document_number: aadhaarNumber.trim(),
                        verified_status: 'pending'
                    };
                    if (urlOrPath) update.document_url = urlOrPath;

                    return supabase.from('provider_documents').upsert(update, { onConflict: 'provider_id, document_type' });
                })());
            }

            if (panUri && panNumber) {
                docPromises.push((async () => {
                    const urlOrPath = await uploadDocument(user.id, panUri, 'pan');
                    const update: any = {
                        provider_id: user.id,
                        document_type: 'pan',
                        document_number: panNumber.trim().toUpperCase(),
                        verified_status: 'pending'
                    };
                    if (urlOrPath) update.document_url = urlOrPath;

                    return supabase.from('provider_documents').upsert(update, { onConflict: 'provider_id, document_type' });
                })());
            }

            console.log('Starting KYC submission for user:', user.id);
            await Promise.all(docPromises);
            console.log('Documents submitted successfully');

            // Bank Details
            if (bankAccountName && accountNumber) {
                await supabase
                    .from('provider_bank_accounts')
                    .upsert({
                        provider_id: user.id,
                        account_holder_name: bankAccountName,
                        account_number_encrypted: accountNumber,
                        ifsc_code: ifscCode,
                        is_primary: true
                    }, { onConflict: 'provider_id' });
            }

            // Update verification status to pending
            await supabase
                .from('provider_details')
                .update({
                    verification_status: 'pending',
                    updated_at: new Date()
                })
                .eq('provider_id', user.id);

            Alert.alert(
                'KYC Submitted! 🛡️',
                'Your documents are being reviewed by our team. This usually takes 24-48 hours. You will be able to go online after verification.',
                [{ text: 'Got it', onPress: () => router.replace('/(tabs)/' as any) }]
            );
        } catch (error: any) {
            let userFriendlyMsg = error.message || "KYC submission failed";
            if (error.code === '23505' || error.message?.includes('unique constraint')) {
                userFriendlyMsg = "This identity document is already registered with another account.";
            }
            setErrorMsg(userFriendlyMsg);
            Alert.alert('Submission Error', userFriendlyMsg);
        } finally {
            setLoading(false);
        }
    };

    const nextStep = () => {
        if (step === 1) {
            const aadhaarRegex = /^\d{12}$/;
            const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

            if (!aadhaarRegex.test(aadhaarNumber)) return Alert.alert('Invalid Aadhaar', 'Aadhaar number must be exactly 12 digits.');
            if (!aadhaarUri) return Alert.alert('Missing Document', 'Please upload your Aadhaar card image.');
            if (!panRegex.test(panNumber.toUpperCase())) return Alert.alert('Invalid PAN', 'Please enter a valid PAN card number.');
            if (!panUri) return Alert.alert('Missing Document', 'Please upload your PAN card image.');
            
            setStep(2);
        }
        else if (step === 2 && bankAccountName && accountNumber && ifscCode) submitKYC();
        else Alert.alert('Missing Info', 'Please fill all required fields to continue.');
    };

    const prevStep = () => {
        if (step > 1) setStep(step - 1);
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>KYC Verification</Text>
                <Text style={styles.subtitle}>Step {step} of {TOTAL_STEPS}</Text>
            </View>

            <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
            </View>

            {errorMsg && (
                <View style={styles.errorBanner}>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
            )}

            <KeyboardAwareScrollView 
                contentContainerStyle={{ padding: 24, paddingBottom: 60 }} 
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                enableOnAndroid={true}
                extraScrollHeight={100}
                extraHeight={100}
            >

                {step === 1 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <FileText color="#10B981" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Identity Verification 🛡️</Text>

                        <Text style={styles.label}>Aadhaar Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="1234 5678 9012"
                            keyboardType="number-pad"
                            value={aadhaarNumber.replace(/(\d{4})(?=\d)/g, '$1 ')}
                            onChangeText={(val) => setAadhaarNumber(val.replace(/\s/g, ''))}
                            maxLength={14}
                        />
                        <TouchableOpacity style={styles.uploadButton} onPress={() => pickDocument('aadhaar')}>
                            <Text style={styles.uploadButtonText}>
                                {aadhaarUri ? (aadhaarUri === 'EXISTING' ? 'Aadhaar Uploaded ✅' : 'Aadhaar Selected ✅') : 'Upload Aadhaar Card'}
                            </Text>
                        </TouchableOpacity>

                        <Text style={styles.label}>PAN Card Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="ABCDE1234F"
                            autoCapitalize="characters"
                            value={panNumber}
                            onChangeText={setPanNumber}
                            maxLength={10}
                        />
                        <TouchableOpacity style={styles.uploadButton} onPress={() => pickDocument('pan')}>
                            <Text style={styles.uploadButtonText}>
                                {panUri ? (panUri === 'EXISTING' ? 'PAN Uploaded ✅' : 'PAN Selected ✅') : 'Upload PAN Card'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {step === 2 && (
                    <View style={styles.stepContainer}>
                        <View style={styles.iconContainer}>
                            <Landmark color="#10B981" size={32} />
                        </View>
                        <Text style={styles.stepTitle}>Bank Details for Payouts</Text>

                        <Text style={styles.label}>Account Holder Name</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="John Doe"
                            value={bankAccountName}
                            onChangeText={setBankAccountName}
                        />

                        <Text style={styles.label}>Account Number</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="1234567890"
                            keyboardType="number-pad"
                            value={accountNumber}
                            onChangeText={setAccountNumber}
                        />

                        <Text style={styles.label}>IFSC Code</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="SBIN0001234"
                            autoCapitalize="characters"
                            value={ifscCode}
                            onChangeText={setIfscCode}
                        />
                    </View>
                )}

            </KeyboardAwareScrollView>

            <View style={styles.footer}>
                <View style={styles.footerButtons}>
                    {step > 1 && (
                        <TouchableOpacity style={[styles.button, styles.backButton]} onPress={prevStep} disabled={loading}>
                            <Text style={styles.backButtonText}>Back</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity style={[styles.button, { flex: 1 }]} onPress={nextStep} disabled={loading}>
                        {loading ? (
                            <ActivityIndicator color="#FFF" />
                        ) : (
                            <>
                                <Text style={styles.buttonText}>{step === TOTAL_STEPS ? 'Submit KYC' : 'Continue'}</Text>
                                {step !== TOTAL_STEPS && <ChevronRight color="#FFF" size={20} />}
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#FFFFFF' },
    errorBanner: { backgroundColor: '#FEF2F2', padding: 12, marginHorizontal: 24, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#FEE2E2' },
    errorText: { color: '#B91C1C', fontSize: 14, fontWeight: '600', textAlign: 'center' },
    header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 20, backgroundColor: '#10B981' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 4 },
    subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
    progressContainer: { height: 4, backgroundColor: '#E0E0E0', width: '100%' },
    progressBar: { height: '100%', backgroundColor: '#059669' },
    scrollContent: { padding: 24 },
    stepContainer: { paddingTop: 20 },
    iconContainer: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#ECFDF5', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
    stepTitle: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 32 },
    label: { fontSize: 14, color: '#555', marginBottom: 8, fontWeight: '500' },
    input: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, height: 56, paddingHorizontal: 16, fontSize: 16, color: '#111', marginBottom: 24, backgroundColor: '#F8F9FA' },
    footer: { padding: 24, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#F0F0F0', backgroundColor: '#FFF' },
    footerButtons: { flexDirection: 'row', gap: 12 },
    button: { backgroundColor: '#10B981', height: 56, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    backButton: { backgroundColor: '#ECFDF5', flex: 0.4 },
    backButtonText: { color: '#10B981', fontSize: 16, fontWeight: '600' },
    buttonDisabled: { backgroundColor: '#A0AEC0' },
    buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600', marginRight: 8 },
    uploadButton: { borderWidth: 1, borderColor: '#10B981', borderStyle: 'dashed', borderRadius: 12, height: 56, justifyContent: 'center', alignItems: 'center', backgroundColor: '#ECFDF5', marginBottom: 24 },
    uploadButtonText: { color: '#10B981', fontSize: 16, fontWeight: '500' }
});
