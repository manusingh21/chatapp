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
      // Initialize Supabase client - you need to add these to your EJS template
      this.supabase = supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );

      // Get current user
      const { data: { user } } = await this.supabase.auth.getUser();
      this.currentUser = user;

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
        this.messageInput.style.height = this.messageInput.scrollHeight + 'px';
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
        }
      });
    }

    // Emoji picker
    const emojiButton = document.getElementById('emojiButton');
    this.emojiPicker = document.getElementById('emojiPicker');
    
    if (emojiButton && this.emojiPicker) {
      emojiButton.addEventListener('click', () => this.toggleEmojiPicker());
      
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
  }

  setupRealtimeSubscriptions() {
    if (!this.supabase) return;

    // Subscribe to new messages for current conversation
    if (this.currentConversationId) {
      this.messageSubscription = this.supabase
        .channel(`messages-${this.currentConversationId}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${this.currentConversationId}`
        }, (payload) => {
          this.handleNewMessage(payload.new);
        })
        .subscribe();
    }

    // Subscribe to user presence/online status changes
    this.presenceSubscription = this.supabase
      .channel('profiles-presence')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles'
      }, (payload) => {
        this.updateUserStatus(payload.new);
      })
      .subscribe();
  }

  async updateOnlineStatus(isOnline) {
    if (!this.supabase || !this.currentUser) return;

    try {
      const updateData = {
        is_online: isOnline,
        last_seen: new Date().toISOString()
      };

      await this.supabase
        .from('profiles')
        .update(updateData)
        .eq('id', this.currentUser.id);
    } catch (error) {
      console.error('Update online status error:', error);
    }
  }

  async searchUsers(e) {
    const query = e.target.value.trim();
    
    if (query.length < 2) {
      this.searchResults.style.display = 'none';
      return;
    }

    try {
      const response = await fetch(`/chat/search?q=${encodeURIComponent(query)}`);
      const users = await response.json();
      
      this.displaySearchResults(users);
    } catch (error) {
      console.error('Search error:', error);
    }
  }

  displaySearchResults(users) {
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
    try {
      const response = await fetch(`/chat/start/${userId}`, {
        method: 'POST',
      });
      
      if (response.redirected) {
        window.location.href = response.url;
      }
    } catch (error) {
      console.error('Start conversation error:', error);
    }
  }

  async sendMessage() {
    const content = this.messageInput.value.trim();
    
    if (!content || !this.currentConversationId) return;

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
        this.addMessageToUI(result.message);
        this.scrollToBottom();
      }
    } catch (error) {
      console.error('Send message error:', error);
    }
  }

  async sendImage(file) {
    if (!this.currentConversationId) return;

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
        this.addMessageToUI(result.message);
        this.scrollToBottom();
      } else {
        alert('Failed to send image');
      }
    } catch (error) {
      console.error('Send image error:', error);
    }
  }

  handleNewMessage(message) {
    // Only add message if it's NOT from current user (to avoid duplicates)
    if (message.sender_id === this.currentUser?.id) return;

    this.addMessageToUI(message);
    this.scrollToBottom();
  }

  addMessageToUI(message) {
    if (!this.messagesContainer) return;

    const messageElement = this.createMessageElement(message);
    this.messagesContainer.appendChild(messageElement);
  }

  createMessageElement(message) {
    const div = document.createElement('div');
    const isOwn = message.sender_id === this.currentUser?.id;
    
    div.className = `message ${isOwn ? 'own' : ''}`;
    
    const timeString = new Date(message.created_at).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    let content = '';
    if (message.message_type === 'image' && message.image_url) {
      content = `<img src="${message.image_url}" alt="Image" class="message-image" loading="lazy">`;
    } else {
      content = this.escapeHtml(message.content);
    }

    div.innerHTML = `
      <div class="message-bubble">
        ${content}
        <div class="message-time">${timeString}</div>
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
    `;
    
    modal.appendChild(img);
    document.body.appendChild(modal);
    
    modal.addEventListener('click', () => {
      document.body.removeChild(modal);
    });
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
  }
});

// Handle visibility changes (tab switch)
document.addEventListener('visibilitychange', () => {
  if (window.chatApp) {
    window.chatApp.updateOnlineStatus(!document.hidden);
  }
});