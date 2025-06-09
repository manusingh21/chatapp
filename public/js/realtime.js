// Real-time messaging with Supabase
class RealtimeChat {
    constructor(supabaseUrl, supabaseKey) {
        this.supabase = supabase.createClient(supabaseUrl, supabaseKey);
        this.subscription = null;
    }

    subscribeToMessages(conversationId, callback) {
        this.subscription = this.supabase
            .channel(`conversation-${conversationId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `conversation_id=eq.${conversationId}`
            }, (payload) => {
                callback(payload.new);
            })
            .subscribe();
    }

    unsubscribe() {
        if (this.subscription) {
            this.supabase.removeChannel(this.subscription);
        }
    }

    async sendMessage(conversationId, content, senderId) {
        const { data, error } = await this.supabase
            .from('messages')
            .insert({
                conversation_id: conversationId,
                content: content,
                sender_id: senderId
            })
            .select(`
                *,
                sender:profiles(*)
            `)
            .single();

        if (error) {
            throw error;
        }

        return data;
    }
}

// Initialize real-time chat if on conversation page
if (document.getElementById('conversationId')) {
    const realtimeChat = new RealtimeChat(
        'YOUR_SUPABASE_URL',
        'YOUR_SUPABASE_ANON_KEY'
    );

    const conversationId = document.getElementById('conversationId').value;
    
    realtimeChat.subscribeToMessages(conversationId, (message) => {
        addMessageToChat(message);
    });

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        realtimeChat.unsubscribe();
    });
}

function addMessageToChat(message) {
    const messagesContainer = document.getElementById('messagesContainer');
    const currentUserId = getCurrentUserId(); // You'll need to implement this
    
    const messageElement = document.createElement('div');
    messageElement.className = `flex ${message.sender_id === currentUserId ? 'justify-end' : 'justify-start'} chat-message`;
    
    messageElement.innerHTML = `
        <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${message.sender_id === currentUserId ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}">
            <p>${message.content}</p>
            <p class="text-xs mt-1 ${message.sender_id === currentUserId ? 'text-blue-200' : 'text-gray-500'}">
                ${new Date(message.created_at).toLocaleTimeString()}
            </p>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}