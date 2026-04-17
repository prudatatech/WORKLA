import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, Phone, Send } from 'lucide-react-native';
import { initiateCall } from '../../lib/phone';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, Vibration, View } from 'react-native';
import { socketService } from '../../lib/socket';
import { supabase } from '../../lib/supabase';

export default function ProviderChatScreen() {
    const { id: bookingId } = useLocalSearchParams();
    const router = useRouter();

    const [messages, setMessages] = useState<any[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [bookingStatus, setBookingStatus] = useState<string>('confirmed');
    const [customer, setCustomer] = useState<any>(null);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        async function initChat() {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) setUserId(user.id);

            // Fetch existing messages
            const { data } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('booking_id', bookingId)
                .order('created_at', { ascending: true });

            if (data) setMessages(data);

            // Fetch booking status and customer details
            const { data: booking } = await supabase
                .from('bookings')
                .select('status, customer_id, profiles!bookings_customer_id_fkey(full_name, phone)')
                .eq('id', bookingId)
                .single();
            if (booking) {
                setBookingStatus(booking.status);
                setCustomer(booking.profiles);
            }

            // Socket.io Integration
            const socket = await socketService.getSocket();
            socket.emit('chat:join', { bookingId });

            const handleNewMessage = (msg: any) => {
                if (msg.booking_id === bookingId) {
                    setMessages(current => {
                        // 1. Replace optimistic message if tempId matches
                        if (msg.tempId && current.find(m => m.id === msg.tempId)) {
                            return current.map(m => m.id === msg.tempId ? msg : m);
                        }
                        // 2. Avoid duplicates for existing server-pushed messages
                        if (current.find(m => m.id === msg.id)) return current;
                        return [...current, msg];
                    });
                }
            };

            socket.on('chat:newMessage', handleNewMessage);

            // Subscribe to status changes (Keep Supabase Realtime for status for now as it is reliable for DB updates)
            const statusSub = supabase
                .channel(`status:${bookingId}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'bookings',
                    filter: `id=eq.${bookingId}`
                }, payload => {
                    setBookingStatus(payload.new.status);
                    if (payload.new.status === 'cancelled') {
                        Vibration.vibrate(500);
                        Alert.alert('Booking Cancelled', 'This booking has been cancelled. Chat is now read-only.');
                    }
                })
                .subscribe();

            return () => {
                socket.off('chat:newMessage', handleNewMessage);
                socket.emit('chat:leave', { bookingId });
                supabase.removeChannel(statusSub);
            };
        }

        if (bookingId) initChat();
    }, [bookingId]);

    const sendMessage = async () => {
        if (!newMessage.trim() || !userId) return;

        const messageText = newMessage.trim();
        setNewMessage(''); // optimistic clear

        const tempId = `temp-${Date.now()}`;
        const optimisticMsg = {
            id: tempId,
            booking_id: bookingId,
            sender_id: userId,
            content: messageText + '\u200B',
            created_at: new Date().toISOString(),
            status: 'sending'
        };
        setMessages(curr => [...curr, optimisticMsg]);

        try {
            const socket = await socketService.getSocket();
            socket.emit('chat:sendMessage', {
                bookingId,
                content: messageText + '\u200B', // Zero-width space tags it as provider
                tempId
            });
        } catch (error) {
            console.error("Error sending message:", error);
            setNewMessage(messageText);
        }
    };

    const renderMessage = ({ item }: { item: any }) => {
        const isMine = item.content?.endsWith('\u200B') || false;
        const cleanContent = item.content ? item.content.replace(/\u200B$/, '') : '';

        return (
            <View style={[styles.messageBubble, isMine ? styles.myMessage : styles.theirMessage]}>
                {item.media_url ? (
                    <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                        [Attachment Sent]
                    </Text>
                ) : (
                    <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                        {cleanContent}
                    </Text>
                )}
                <Text style={[styles.timeText, isMine ? styles.myTimeText : styles.theirTimeText]}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <ChevronLeft color="#111" size={28} />
                </TouchableOpacity>
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.headerTitle}>{customer?.full_name || 'Customer'}</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>Active Chat</Text>
                </View>
                <TouchableOpacity onPress={() => initiateCall(customer?.phone)}>
                    <Phone color={PRIMARY} size={24} />
                </TouchableOpacity>
            </View>

            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messageList}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            <View style={[styles.inputContainer, bookingStatus === 'cancelled' && styles.disabledInput]}>
                <TextInput
                    style={styles.input}
                    placeholder={bookingStatus === 'cancelled' ? "Booking Cancelled" : "Type a message..."}
                    value={newMessage}
                    onChangeText={setNewMessage}
                    multiline
                    editable={bookingStatus !== 'cancelled'}
                />
                <TouchableOpacity
                    style={[styles.sendButton, !newMessage.trim() && styles.sendButtonDisabled]}
                    onPress={sendMessage}
                    disabled={!newMessage.trim()}
                >
                    <Send color={newMessage.trim() ? '#FFF' : '#A0C4FF'} size={20} />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 20,
        paddingBottom: 16,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E0E0E0'
    },
    backButton: {
        padding: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#111',
    },
    messageList: {
        padding: 20,
        flexGrow: 1,
        justifyContent: 'flex-end',
    },
    messageBubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 16,
        marginBottom: 12,
    },
    myMessage: {
        alignSelf: 'flex-end',
        backgroundColor: '#0056FF',
        borderBottomRightRadius: 4,
    },
    theirMessage: {
        alignSelf: 'flex-start',
        backgroundColor: '#FFF',
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: '#E0E0E0',
    },
    messageText: {
        fontSize: 16,
        lineHeight: 22,
    },
    myMessageText: {
        color: '#FFF',
    },
    theirMessageText: {
        color: '#111',
    },
    timeText: {
        fontSize: 11,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    myTimeText: {
        color: 'rgba(255,255,255,0.7)',
    },
    theirTimeText: {
        color: '#999',
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 16,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E0E0E0',
        alignItems: 'flex-end',
    },
    input: {
        flex: 1,
        backgroundColor: '#F0F2F5',
        borderRadius: 20,
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 12,
        fontSize: 16,
        maxHeight: 100,
        color: '#111',
    },
    sendButton: {
        backgroundColor: '#0056FF',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 12,
        marginBottom: 2,
    },
    sendButtonDisabled: {
        backgroundColor: '#E3F2FD',
    },
    disabledInput: {
        backgroundColor: '#F3F4F6',
        opacity: 0.8
    }
});
