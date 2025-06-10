class ChatApp {
  constructor() {
    this.supabase = null;
    this.currentUser = null;
    this.currentConversationId = null;
    this.messagesContainer = null;
    this.messageInput = null;
    this.searchInput = null;
    this.searchResults = null;
    this.emojiPicker = null;
    this.isEmojiPickerVisible = false;
    this.messageSubscription = null;
    this.presenceSubscription = null;
    
    this.init();
  }

  async init() {
    try {
      // Check if Supabase variables are available
      if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
        console.error('Supabase configuration not found');
        return;
      }

      // Initialize Supabase client
      this.supabase = supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );

      // Get current user from session
      await this.getCurrentUser();

      this.setupEventListeners();
      this.setupRealtimeSubscriptions();
      this.updateOnlineStatus(true);
      
      // Auto-scroll to bottom on page load
      if (this.messagesContainer) {
        this.scrollToBottom();
      }
    } catch (error) {
      console.error('Chat initialization error:', error);
    }
  }

  async getCurrentUser() {
    try {
      const response = await fetch('/auth/user');
      if (response.ok) {
        const userData = await response.json();
        this.currentUser = userData.user;
      } else {
        console.error('Failed to get user data');
      }
    } catch (error) {
      console.error('Get current user error:', error);
    }
  }

  setupEventListeners() {
    // Search functionality
    this.searchInput = document.getElementById('searchInput');
    this.searchResults = document.getElementById('searchResults');
    
    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.debounce(this.searchUsers.bind(this), 300));
      this.searchInput.addEventListener('focus', () => {
        if (this.searchInput.value.trim()) {
          this.searchResults.style.display = 'block';
        }
      });
      
      // Hide search results when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
          this.searchResults.style.display = 'none';
        }
      });
    }

    // Message input
    this.messageInput = document.getElementById('messageInput');
    if (this.messageInput) {
      this.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      // Auto-resize textarea
      this.messageInput.addEventListener('input', () => {
        this.messageInput.style.height = 'auto';
        this.messageInput.style.height = Math.min(this.messageInput.scrollHeight, 120) + 'px';
      });
    }

    // Send button
    const sendButton = document.getElementById('sendButton');
    if (sendButton) {
      sendButton.addEventListener('click', () => this.sendMessage());
    }

    // Image upload
    const imageInput = document.getElementById('imageInput');
    const imageButton = document.getElementById('imageButton');
    
    if (imageInput && imageButton) {
      imageButton.addEventListener('click', () => imageInput.click());
      imageInput.addEventListener('change', (e) => {
        if (e.target.files[0]) {
          this.sendImage(e.target.files[0]);
          // Clear the input so the same file can be selected again
          e.target.value = '';
        }
      });
    }

    // Emoji picker
    const emojiButton = document.getElementById('emojiButton');
    this.emojiPicker = document.getElementById('emojiPicker');
    
    if (emojiButton && this.emojiPicker) {
      emojiButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleEmojiPicker();
      });
      
      // Emoji selection
      this.emojiPicker.addEventListener('click', (e) => {
        if (e.target.classList.contains('emoji-button')) {
          this.insertEmoji(e.target.textContent);
        }
      });
    }

    // Messages container
    this.messagesContainer = document.getElementById('messagesContainer');
    
    // Get conversation ID from URL or data attribute
    const conversationElement = document.querySelector('[data-conversation-id]');
    if (conversationElement) {
      this.currentConversationId = conversationElement.dataset.conversationId;
    }

    // Image preview
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('message-image')) {
        this.openImagePreview(e.target.src);
      }
    });

    // Hide emoji picker when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#emojiButton') && !e.target.closest('#emojiPicker')) {
        this.hideEmojiPicker();
      }
    });
  }

  setupRealtimeSubscriptions() {
    if (!this.supabase || !this.currentConversationId) return;

    console.log('Setting up real-time subscriptions for conversation:', this.currentConversationId);

    // Subscribe to new messages for current conversation
    this.messageSubscription = this.supabase
      .channel(`messages-${this.currentConversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${this.currentConversationId}`
      }, (payload) => {
        console.log('New message received:', payload.new);
        this.handleNewMessage(payload.new);
      })
      .subscribe((status) => {
        console.log('Message subscription status:', status);
      });

    // Subscribe to user presence/online status changes
    this.presenceSubscription = this.supabase
      .channel('profiles-presence')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles'
      }, (payload) => {
        console.log('Profile updated:', payload.new);
        this.updateUserStatus(payload.new);
      })
      .subscribe((status) => {
        console.log('Presence subscription status:', status);
      });
  }

  async updateOnlineStatus(isOnline) {
    if (!this.supabase || !this.currentUser) return;

    try {
      const updateData = {
        is_online: isOnline,
        last_seen: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('profiles')
        .update(updateData)
        .eq('id', this.currentUser.id);

      if (error) {
        console.error('Update online status error:', error);
      }
    } catch (error) {
      console.error('Update online status error:', error);
    }
  }

  async searchUsers(e) {
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      this.searchResults.style.display = 'none';
      this.searchResults.classList.remove("hidden");
      return;
    }

    try {
      const response = await fetch(`/chat/search?q=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error('Search failed');
      }
      const users = await response.json();
      
      this.displaySearchResults(users);
    } catch (error) {
      console.error('Search error:', error);
      this.searchResults.innerHTML = '<div class="search-result-item">Search failed</div>';
      this.searchResults.style.display = 'block';
    }
  }

  displaySearchResults(users) {
    if (!this.searchResults) return;
    
    if (users.length === 0) {
        this.searchResults.innerHTML = '<div class="search-result-item">No users found</div>';
    } else {
        this.searchResults.innerHTML = users.map(user => `
            <div class="search-result-item" onclick="chatApp.startConversation('${user.id}')">
                <div class="avatar">
                    ${user.avatar_url ? 
                        `<img src="${user.avatar_url}" alt="${user.username}">` : 
                        user.username.charAt(0).toUpperCase()
                    }
                    ${user.is_online ? '<div class="online-indicator"></div>' : ''}
                </div>
                <div>
                    <div class="conversation-name">${user.full_name || user.username}</div>
                    <div class="conversation-preview">
                        @${user.username} • ${this.getPresenceText(user)}
                    </div>
                </div>
            </div>
        `).join('');
    }
    this.searchResults.classList.remove("hidden");
    this.searchResults.style.display = 'block';
}
  getPresenceText(user) {
    if (user.is_online) {
      return '<span class="status-online">Online</span>';
    } else if (user.last_seen) {
      return `Last seen ${this.formatLastSeen(user.last_seen)}`;
    }
    return '<span class="status-offline">Offline</span>';
  }

  formatLastSeen(lastSeen) {
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMs = now - lastSeenDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return lastSeenDate.toLocaleDateString();
  }
async startConversation(userId) {
    console.log('Starting conversation with userId:', userId);
    try {
        const response = await fetch(`/chat/start/${userId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Add CSRF token if you're using it
            },
            credentials: 'same-origin' // Important for session cookies
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers);
        
        if (response.redirected) {
            console.log('Redirecting to:', response.url);
            window.location.href = response.url;
        } else if (!response.ok) {
            console.error('Response not ok:', response.status, response.statusText);
            const text = await response.text();
            console.error('Response body:', text);
        }
    } catch (error) {
        console.error('Start conversation error:', error);
    }
}

  async sendMessage() {
    const content = this.messageInput.value.trim();
    
    if (!content || !this.currentConversationId) return;

    // Disable send button to prevent double sending
    const sendButton = document.getElementById('sendButton');
    if (sendButton) {
      sendButton.disabled = true;
    }

    try {
      const formData = new FormData();
      formData.append('conversationId', this.currentConversationId);
      formData.append('content', content);
      formData.append('messageType', 'text');

      const response = await fetch('/chat/send', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        this.messageInput.value = '';
        this.messageInput.style.height = 'auto';
        this.hideEmojiPicker();
        
        // Add message to UI immediately for sender
        const messageWithSender = {
          ...result.message,
          sender: {
            username: this.currentUser.user_metadata?.username || this.currentUser.email,
            avatar_url: this.currentUser.user_metadata?.avatar_url,
            full_name: this.currentUser.user_metadata?.full_name
          }
        };
        this.addMessageToUI(messageWithSender);
        this.scrollToBottom();
      } else {
        console.error('Send message error:', result.error);
        this.showError('Failed to send message: ' + result.error);
      }
    } catch (error) {
      console.error('Send message error:', error);
      this.showError('Failed to send message');
    } finally {
      // Re-enable send button
      if (sendButton) {
        sendButton.disabled = false;
      }
    }
  }

  async sendImage(file) {
    if (!this.currentConversationId) return;

    // Validate file type and size
    if (!file.type.startsWith('image/')) {
      this.showError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
      this.showError('Image size must be less than 5MB');
      return;
    }

    // Show uploading indicator
    this.showUploadProgress();

    try {
      const formData = new FormData();
      formData.append('conversationId', this.currentConversationId);
      formData.append('image', file);
      formData.append('messageType', 'image');

      const response = await fetch('/chat/send', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();
      
      if (result.success) {
        // Add message to UI immediately for sender
        const messageWithSender = {
          ...result.message,
          sender: {
            username: this.currentUser.user_metadata?.username || this.currentUser.email,
            avatar_url: this.currentUser.user_metadata?.avatar_url,
            full_name: this.currentUser.user_metadata?.full_name
          }
        };
        this.addMessageToUI(messageWithSender);
        this.scrollToBottom();
      } else {
        console.error('Send image error:', result.error);
        this.showError('Failed to send image: ' + result.error);
      }
    } catch (error) {
      console.error('Send image error:', error);
      this.showError('Failed to send image');
    } finally {
      this.hideUploadProgress();
    }
  }

  handleNewMessage(message) {
    // Only add message if it's NOT from current user (to avoid duplicates)
    if (message.sender_id === this.currentUser?.id) return;

    // Fetch sender details and add message
    this.fetchMessageWithSender(message).then(fullMessage => {
      this.addMessageToUI(fullMessage);
      this.scrollToBottom();
      this.playNotificationSound();
    });
  }

  async fetchMessageWithSender(message) {
    try {
      const { data: profile } = await this.supabase
        .from('profiles')
        .select('username, avatar_url, full_name')
        .eq('id', message.sender_id)
        .single();
      
      return {
        ...message,
        sender: profile || { username: 'Unknown', avatar_url: null, full_name: null }
      };
    } catch (error) {
      console.error('Error fetching sender:', error);
      return {
        ...message,
        sender: { username: 'Unknown', avatar_url: null, full_name: null }
      };
    }
  }

  addMessageToUI(message) {
    if (!this.messagesContainer) return;

    const messageElement = this.createMessageElement(message);
    this.messagesContainer.appendChild(messageElement);
    
    // Animate the new message
    messageElement.style.opacity = '0';
    messageElement.style.transform = 'translateY(20px)';
    
    setTimeout(() => {
      messageElement.style.transition = 'all 0.3s ease-out';
      messageElement.style.opacity = '1';
      messageElement.style.transform = 'translateY(0)';
    }, 10);
  }

  createMessageElement(message) {
    const div = document.createElement('div');
    const isOwn = message.sender_id === this.currentUser?.id;
    
    div.className = `flex ${isOwn ? 'justify-end' : 'justify-start'} animate-fade-in`;
    
    const timeString = new Date(message.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    let content = '';
    if (message.message_type === 'image' && message.image_url) {
      content = `<img src="${message.image_url}" alt="Image" class="message-image max-w-full rounded-xl cursor-pointer hover:scale-105 transition-transform duration-200" loading="lazy">`;
    } else {
      content = `<p class="text-sm leading-relaxed">${this.escapeHtml(message.content)}</p>`;
    }

    div.innerHTML = `
      <div class="max-w-xs sm:max-w-sm lg:max-w-md">
        <div class="${isOwn ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white/80 backdrop-blur-sm text-gray-900 rounded-r-2xl rounded-tl-2xl border border-gray-200/50'} px-4 py-3 shadow-lg">
          ${content}
        </div>
        <div class="flex ${isOwn ? 'justify-end' : 'justify-start'} mt-1">
          <span class="text-xs text-gray-400 px-2">${timeString}</span>
        </div>
      </div>
    `;

    return div;
  }

  updateUserStatus(profile) {
    // Update online status indicators
    const statusElements = document.querySelectorAll(`[data-user-id="${profile.id}"]`);
    statusElements.forEach(element => {
      const indicator = element.querySelector('.online-indicator');
      const statusText = element.querySelector('.status-text');
      
      if (indicator) {
        indicator.style.display = profile.is_online ? 'block' : 'none';
      }
      
      if (statusText) {
        statusText.textContent = profile.is_online ? 'Online' : 
          `Last seen ${this.formatLastSeen(profile.last_seen)}`;
        statusText.className = profile.is_online ? 'status-online' : 'status-offline';
      }
    });

    // Update header status in conversation view
    const headerStatus = document.querySelector('.chat-header .status-text');
    if (headerStatus) {
      headerStatus.textContent = profile.is_online ? 'Online' : 
        `Last seen ${this.formatLastSeen(profile.last_seen)}`;
      headerStatus.className = profile.is_online ? 'status-online' : 'status-offline';
    }
  }

  toggleEmojiPicker() {
    if (this.isEmojiPickerVisible) {
      this.hideEmojiPicker();
    } else {
      this.showEmojiPicker();
    }
  }

  showEmojiPicker() {
    if (this.emojiPicker) {
      this.emojiPicker.style.display = 'block';
      this.isEmojiPickerVisible = true;
    }
  }

  hideEmojiPicker() {
    if (this.emojiPicker) {
      this.emojiPicker.style.display = 'none';
      this.isEmojiPickerVisible = false;
    }
  }

  insertEmoji(emoji) {
    if (this.messageInput) {
      const start = this.messageInput.selectionStart;
      const end = this.messageInput.selectionEnd;
      const value = this.messageInput.value;
      
      this.messageInput.value = value.substring(0, start) + emoji + value.substring(end);
      this.messageInput.focus();
      this.messageInput.setSelectionRange(start + emoji.length, start + emoji.length);
      
      // Trigger input event to resize textarea
      this.messageInput.dispatchEvent(new Event('input'));
      
      this.hideEmojiPicker();
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  openImagePreview(src) {
    // Simple image preview modal
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      cursor: pointer;
    `;
    
    const img = document.createElement('img');
    img.src = src;
    img.style.cssText = `
      max-width: 90%;
      max-height: 90%;
      object-fit: contain;
      border-radius: 8px;
    `;
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
  }

  showError(message) {
    // Simple error notification
    const errorDiv = document.createElement('div');
    errorDiv.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
    errorDiv.textContent = message;
    document.body.appendChild(errorDiv);
    
    setTimeout(() => {
      if (document.body.contains(errorDiv)) {
        document.body.removeChild(errorDiv);
      }
    }, 5000);
  }

  showUploadProgress() {
    const imageButton = document.getElementById('imageButton');
    if (imageButton) {
      imageButton.innerHTML = `
        <svg class="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
      `;
      imageButton.disabled = true;
    }
  }

  hideUploadProgress() {
    const imageButton = document.getElementById('imageButton');
    if (imageButton) {
      imageButton.innerHTML = `
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      `;
      imageButton.disabled = false;
    }
  }

  playNotificationSound() {
    // Optional: Play a subtle notification sound
    try {
      const audio = new Audio('/sounds/notification.mp3'); // Add a notification sound file
      audio.volume = 0.3;
      audio.play().catch(() => {
        // Ignore audio play errors (user hasn't interacted with page yet)
      });
    } catch (error) {
      // Ignore audio errors
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // Cleanup method
  cleanup() {
    if (this.messageSubscription) {
      this.supabase.removeChannel(this.messageSubscription);
    }
    if (this.presenceSubscription) {
      this.supabase.removeChannel(this.presenceSubscription);
    }
    this.updateOnlineStatus(false);
  }

  // Connection status monitoring
  monitorConnection() {
    if (!this.supabase) return;

    // Monitor connection status
    window.addEventListener('online', () => {
      console.log('Connection restored');
      this.setupRealtimeSubscriptions();
      this.updateOnlineStatus(true);
    });

    window.addEventListener('offline', () => {
      console.log('Connection lost');
      this.updateOnlineStatus(false);
    });
  }
}

// Initialize chat app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.chatApp = new ChatApp();
});

// Update user online status on page events
window.addEventListener('beforeunload', () => {
  if (window.chatApp) {
    window.chatApp.cleanup();
  }
});

window.addEventListener('load', () => {
  if (window.chatApp) {
    window.chatApp.updateOnlineStatus(true);
    window.chatApp.monitorConnection();
  }
});

// Handle visibility changes (tab switch)
document.addEventListener('visibilitychange', () => {
  if (window.chatApp) {
    window.chatApp.updateOnlineStatus(!document.hidden);
  }
});

// Handle page focus/blur
window.addEventListener('focus', () => {
  if (window.chatApp) {
    window.chatApp.updateOnlineStatus(true);
  }
});

window.addEventListener('blur', () => {
  if (window.chatApp) {
    window.chatApp.updateOnlineStatus(false);
  }
});