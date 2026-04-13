import { useLocalSearchParams, useRouter } from 'expo-router';
import { pickAndCompressImage, prepareImageForSupabase } from '../../lib/image';
import {
    ArrowLeft,
    CheckCheck,
    Image as ImageIcon,
    Mic,
    Phone,
    Send,
    Star,
    Video,
} from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    KeyboardAvoidingView,
    Platform,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { socketService } from '../../lib/socket';
import { supabase } from '../../lib/supabase';
import EmptyState from '../../components/EmptyState';

const PRIMARY = '#1A3FFF';

// Quick replies common for service bookings
const QUICK_REPLIES = [
    "I'm on my way",
    "Give me 10 mins",
    "Please be ready",
    "At your door",
];

export default function ChatScreen() {
    const { id: bookingId } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const flatListRef = useRef<FlatList>(null);
    const inputRef = useRef<TextInput>(null);

    const [messages, setMessages] = useState<any[]>([]);
    const [text, setText] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [booking, setBooking] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        async function init() {
            setLoading(true);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);

            // Fetch booking info for header
            const { data: bk } = await supabase
                .from('bookings')
                .select('booking_number, customer_address, service_name_snapshot, provider_details(business_name, profiles(full_name))')
                .eq('id', bookingId)
                .single();
            if (bk) setBooking(bk);

            // Fetch existing messages (History)
            const { data: msgs } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: true });
            if (msgs) setMessages(msgs);

            setLoading(false);

            // Socket.io Integration
            const socket = await socketService.getSocket();

            socket.emit('chat:join', { bookingId });

            const handleNewMessage = (msg: any) => {
                if (msg.booking_id === bookingId) {
                    setMessages(current => {
                        // Avoid duplicates (optimistic message already added)
                        if (current.find(m => m.id === msg.id)) return current;
                        return [...current, msg];
                    });
                    scrollToEnd();
                }
            };

            socket.on('chat:newMessage', handleNewMessage);

            return () => {
                socket.off('chat:newMessage', handleNewMessage);
                socket.emit('chat:leave', { bookingId });
            };
        }
        if (bookingId) init();
    }, [bookingId]);

    const scrollToEnd = () => {
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const pickImage = async () => {
        const compressedImage = await pickAndCompressImage(0.6, 1080);
        if (compressedImage && compressedImage.uri) {
            uploadImage(compressedImage.uri);
        }
    };

    const uploadImage = async (uri: string) => {
        setSending(true);
        try {
            const fileInfo = prepareImageForSupabase(uri);
            const ext = fileInfo.type.split('/')[1] || 'jpeg';
            const filePath = `${bookingId}/${Date.now()}.${ext}`;

            // Fetch blob correctly for React Native
            const response = await fetch(uri);
            const blob = await response.blob();

            const { error } = await supabase.storage
                .from('chat-media')
                .upload(filePath, blob, { contentType: `image/${ext}` });

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from('chat-media')
                .getPublicUrl(filePath);

            await supabase.from('chat_messages').insert({
                booking_id: bookingId,
                sender_id: userId,
                media_url: publicUrl,
            });

        } catch (err: any) {
            Alert.alert('Upload Failed', err.message);
        } finally {
            setSending(false);
        }
    };

    const sendMessage = async (content: string = text) => {
        const trimmed = content.trim();
        if (!trimmed && !sending) return;

        if (trimmed) {
            setText('');
            setSending(true);

            // Optimistic UI
            const tempId = `temp-${Date.now()}`;
            const tempMsg = {
                id: tempId,
                sender_id: userId,
                content: trimmed,
                created_at: new Date().toISOString(),
                status: 'sending',
            };
            setMessages(curr => [...curr, tempMsg]);
            scrollToEnd();

            try {
                const socket = await socketService.getSocket();
                socket.emit('chat:sendMessage', {
                    bookingId,
                    content: trimmed
                });
            } catch (_err) {
                setMessages(curr => curr.filter(m => m.id !== tempId));
                setText(trimmed);
            } finally {
                setSending(false);
            }
        }
    };

    const providerName = booking?.provider_details?.business_name ?? booking?.provider_details?.profiles?.full_name ?? 'Worker';

    // ── Message Item ────────────────────────────────────────────────────────────
    const renderMessage = ({ item, index }: { item: any; index: number }) => {
        const isMine = item.sender_id === userId;
        const sending = item.status === 'sending';
        const prev = messages[index - 1];
        const showAvatar = !isMine && (!prev || prev.sender_id !== item.sender_id);
        const timeStr = new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
            <View style={[styles.msgRow, isMine && styles.msgRowMine]}>
                {!isMine && (
                    <View style={[styles.msgAvatar, !showAvatar && styles.msgAvatarHidden]}>
                        {showAvatar && <Text style={styles.msgAvatarText}>{providerName.charAt(0)}</Text>}
                    </View>
                )}
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs, item.media_url && styles.bubblePhoto]}>
                    {item.media_url && (
                        <Image source={{ uri: item.media_url }} style={styles.msgImage} resizeMode="cover" />
                    )}
                    {item.content && (
                        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{item.content}</Text>
                    )}
                    <View style={styles.bubbleMeta}>
                        <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{timeStr}</Text>
                        {isMine && !sending && <CheckCheck size={12} color="rgba(255,255,255,0.7)" />}
                        {isMine && sending && <ActivityIndicator size={10} color="rgba(255,255,255,0.7)" />}
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.safeArea} edges={['top']}>
            <StatusBar barStyle="dark-content" backgroundColor="#FFF" />

            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={20} color="#111827" />
                </TouchableOpacity>

                <View style={styles.headerInfo}>
                    <View style={styles.headerAvatar}>
                        <Text style={styles.headerAvatarText}>{providerName.charAt(0)}</Text>
                        {/* Online dot */}
                        <View style={styles.onlineDot} />
                    </View>
                    <View>
                        <Text style={styles.headerName}>{providerName}</Text>
                        <Text style={styles.headerSub}>
                            {booking?.service_name_snapshot ?? 'Service'} · #{booking?.booking_number ?? '—'}
                        </Text>
                    </View>
                </View>

                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.headerActionBtn}>
                        <Phone size={16} color="#374151" />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerActionBtn}>
                        <Video size={16} color="#374151" />
                    </TouchableOpacity>
                </View>
            </View>

            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                {/* Worker rating disclaimer */}
                <View style={styles.systemMsg}>
                    <Star size={12} color="#F59E0B" fill="#F59E0B" />
                    <Text style={styles.systemMsgText}>
                        Chat is encrypted. Don&apos;t share personal financial details.
                    </Text>
                </View>

                {loading ? (
                    <View style={styles.loadingWrap}>
                        <ActivityIndicator color={PRIMARY} />
                    </View>
                ) : (
                    <FlatList
                        ref={flatListRef}
                        data={messages}
                        keyExtractor={(item) => item.id}
                        renderItem={renderMessage}
                        contentContainerStyle={styles.msgList}
                        onContentSizeChange={scrollToEnd}
                        onLayout={scrollToEnd}
                        ListEmptyComponent={
                            <EmptyState 
                                title="No Messages Yet"
                                description={`Start a conversation with ${providerName} regarding your booking.`}
                                imageSource={require('../../assets/images/notifications-empty.png')}
                            />
                        }
                    />
                )}

                {/* Quick Replies */}
                <FlatList
                    data={QUICK_REPLIES}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item}
                    contentContainerStyle={styles.quickRepliesList}
                    renderItem={({ item }) => (
                        <TouchableOpacity
                            style={styles.quickReply}
                            onPress={() => sendMessage(item)}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.quickReplyText}>{item}</Text>
                        </TouchableOpacity>
                    )}
                />

                {/* Input bar */}
                <View style={styles.inputBar}>
                    <TouchableOpacity style={styles.inputIconBtn} onPress={pickImage} disabled={sending}>
                        <ImageIcon size={20} color={sending ? "#D1D5DB" : "#9CA3AF"} />
                    </TouchableOpacity>

                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        placeholder="Type a message..."
                        placeholderTextColor="#9CA3AF"
                        value={text}
                        onChangeText={setText}
                        multiline
                        maxLength={500}
                        onSubmitEditing={() => sendMessage()}
                        returnKeyType="send"
                    />

                    {text.trim().length === 0 ? (
                        <TouchableOpacity style={styles.inputIconBtn}>
                            <Mic size={20} color="#9CA3AF" />
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            style={styles.sendBtn}
                            onPress={() => sendMessage()}
                            disabled={sending}
                            activeOpacity={0.85}
                        >
                            {sending
                                ? <ActivityIndicator size={16} color="#FFF" />
                                : <Send size={16} color="#FFF" />
                            }
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#FFF' },
    // Header
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 12, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
        backgroundColor: '#FFF', gap: 10,
    },
    backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center', position: 'relative' },
    headerAvatarText: { fontSize: 16, fontWeight: '800', color: PRIMARY },
    onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#10B981', borderWidth: 1.5, borderColor: '#FFF' },
    headerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
    headerSub: { fontSize: 11, color: '#9CA3AF', marginTop: 1 },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerActionBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
    // System message
    systemMsg: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: '#FFFBEB', paddingHorizontal: 16, paddingVertical: 8,
    },
    systemMsgText: { fontSize: 11, color: '#92400E', flex: 1 },
    // Message list
    loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    msgList: { padding: 16, paddingBottom: 8, flexGrow: 1 },
    emptyWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 60, gap: 6 },
    emptyTitle: { fontSize: 16, fontWeight: '700', color: '#374151' },
    emptySub: { fontSize: 13, color: '#9CA3AF' },
    // Message bubbles
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6, gap: 8 },
    msgRowMine: { flexDirection: 'row-reverse' },
    msgAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF2FF', justifyContent: 'center', alignItems: 'center' },
    msgAvatarHidden: { opacity: 0 },
    msgAvatarText: { fontSize: 11, fontWeight: '700', color: PRIMARY },
    bubble: {
        maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    },
    bubbleMine: {
        backgroundColor: PRIMARY,
        borderBottomRightRadius: 4,
    },
    bubbleTheirs: {
        backgroundColor: '#F3F4F6',
        borderBottomLeftRadius: 4,
    },
    bubbleText: { fontSize: 14, color: '#111827', lineHeight: 20 },
    bubbleTextMine: { color: '#FFF' },
    bubbleMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 3 },
    bubbleTime: { fontSize: 10, color: '#9CA3AF' },
    bubbleTimeMine: { color: 'rgba(255,255,255,0.65)' },
    bubblePhoto: { padding: 4, borderRadius: 12 },
    msgImage: { width: 220, height: 280, borderRadius: 10, marginBottom: 4 },
    // Quick replies
    quickRepliesList: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
    quickReply: {
        backgroundColor: '#F3F4F6', borderRadius: 20,
        paddingHorizontal: 14, paddingVertical: 7,
        borderWidth: 1, borderColor: '#E5E7EB',
    },
    quickReplyText: { fontSize: 12, color: '#374151', fontWeight: '500' },
    // Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end',
        paddingHorizontal: 12, paddingVertical: 10,
        backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#F3F4F6',
        gap: 8,
    },
    inputIconBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
    input: {
        flex: 1, backgroundColor: '#F3F4F6', borderRadius: 22,
        paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10,
        fontSize: 14, color: '#111827', maxHeight: 100,
    },
    sendBtn: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: PRIMARY, justifyContent: 'center', alignItems: 'center',
        shadowColor: PRIMARY, shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
});
