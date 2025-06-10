const express = require('express');
const {supabase} = require('../config/supabase');
const upload = require('../utils/fileUpload');
const router = express.Router();

// Chat home - show conversations
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's conversations with latest message
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:profiles!conversations_user1_id_fkey(id, username, avatar_url, full_name, is_online),
        user2:profiles!conversations_user2_id_fkey(id, username, avatar_url, full_name, is_online),
        messages(content, created_at, message_type)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    // Format conversations to show the other user
    const formattedConversations = conversations.map(conv => {
      const otherUser = conv.user1.id === userId ? conv.user2 : conv.user1;
      const lastMessage = conv.messages[conv.messages.length - 1];
      
      return {
        id: conv.id,
        otherUser,
        lastMessage,
        updatedAt: conv.updated_at
      };
    });
    
    res.render('chat/index', { 
      conversations: formattedConversations,
      user: req.user 
    });
  } catch (error) {
    console.error('Chat index error:', error);
    res.render('chat/index', { conversations: [], user: req.user });
  }
});

// Search users
// Update the search route
router.get('/search', async (req, res) => {
  const { q } = req.query;
  
  try {
    if (!q || q.trim().length < 2) {
      return res.json([]);
    }
    
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, username, email, full_name, avatar_url, is_online, last_seen')
      .or(`username.ilike.%${q}%,email.ilike.%${q}%,full_name.ilike.%${q}%`)
      .neq('id', req.user.id)
      .limit(10);
    
    if (error) throw error;
    
    res.json(users);
  } catch (error) {
    console.error('Search error:', error);
    res.json([]);
  }
});

// Update the conversation route
router.get('/conversation/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // Get conversation details
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:profiles!conversations_user1_id_fkey(id, username, avatar_url, full_name, is_online, last_seen),
        user2:profiles!conversations_user2_id_fkey(id, username, avatar_url, full_name, is_online, last_seen)
      `)
      .eq('id', id)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .single();
    
    if (error || !conversation) {
      return res.redirect('/chat');
    }
    
    // Get messages
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles(username, avatar_url, full_name)
      `)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    
    const otherUser = conversation.user1.id === userId ? conversation.user2 : conversation.user1;
    
    res.render('chat/conversation', {
      conversation,
      otherUser,
      messages: messages || [],
      user: req.user,
      conversationId: id
    });
  } catch (error) {
    console.error('Conversation error:', error);
    res.redirect('/chat');
  }
});

// Update the chat home route
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's conversations with latest message
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:profiles!conversations_user1_id_fkey(id, username, avatar_url, full_name, is_online, last_seen),
        user2:profiles!conversations_user2_id_fkey(id, username, avatar_url, full_name, is_online, last_seen),
        messages(content, created_at, message_type)
      `)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .order('updated_at', { ascending: false });
    
    if (error) throw error;
    
    // Format conversations to show the other user
    const formattedConversations = conversations.map(conv => {
      const otherUser = conv.user1.id === userId ? conv.user2 : conv.user1;
      const lastMessage = conv.messages[conv.messages.length - 1];
      
      return {
        id: conv.id,
        otherUser,
        lastMessage,
        updatedAt: conv.updated_at
      };
    });
    
    res.render('chat/index', { 
      conversations: formattedConversations,
      user: req.user 
    });
  } catch (error) {
    console.error('Chat index error:', error);
    res.render('chat/index', { conversations: [], user: req.user });
  }
});
// Conversation view
router.get('/conversation/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // Get conversation details
    const { data: conversation, error } = await supabase
      .from('conversations')
      .select(`
        *,
        user1:profiles!conversations_user1_id_fkey(id, username, avatar_url, full_name, is_online),
        user2:profiles!conversations_user2_id_fkey(id, username, avatar_url, full_name, is_online)
      `)
      .eq('id', id)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .single();
    
    if (error || !conversation) {
      return res.redirect('/chat');
    }
    
    // Get messages
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles(username, avatar_url, full_name)
      `)
      .eq('conversation_id', id)
      .order('created_at', { ascending: true });
    
    const otherUser = conversation.user1.id === userId ? conversation.user2 : conversation.user1;
    
    res.render('chat/conversation', {
      conversation,
      otherUser,
      messages: messages || [],
      user: req.user,
      conversationId: id
    });
  } catch (error) {
    console.error('Conversation error:', error);
    res.redirect('/chat');
  }
});

// Send message
router.post('/send', upload.single('image'), async (req, res) => {
  const { conversationId, content, messageType = 'text' } = req.body;
  const userId = req.user.id;
  
  try {
    let messageData = {
      conversation_id: conversationId,
      sender_id: userId,
      message_type: messageType
    };
    
    if (messageType === 'image' && req.file) {
      // Upload image to Supabase Storage
      const fileName = `${Date.now()}-${req.file.originalname}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('chat-images')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype
        });
      
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('chat-images')
          .getPublicUrl(fileName);
        
        messageData.image_url = urlData.publicUrl;
        messageData.content = content || 'Image';
      }
    } else {
      messageData.content = content;
    }
    
    const { data: message, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();
    
    if (error) throw error;
    
    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    res.json({ success: true, message });
  } catch (error) {
    console.error('Send message error:', error);
    res.json({ success: false, error: error.message });
  }
});

// Get messages (for real-time updates)
router.get('/messages/:conversationId', async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user.id;
  
  try {
    // Verify user has access to this conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('user1_id, user2_id')
      .eq('id', conversationId)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .single();
    
    if (!conversation) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const { data: messages } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles(username, avatar_url, full_name)
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    
    res.json(messages || []);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message });
  }
});
router.post('/send', upload.single('image'), async (req, res) => {
  const { conversationId, content, messageType = 'text' } = req.body;
  const userId = req.user.id;
  
  try {
    // Verify user has access to conversation
    const { data: conversation } = await supabase
      .from('conversations')
      .select('user1_id, user2_id')
      .eq('id', conversationId)
      .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
      .single();
    
    if (!conversation) {
      return res.status(403).json({ success: false, error: 'Unauthorized' });
    }

    let messageData = {
      conversation_id: conversationId,
      sender_id: userId,
      message_type: messageType
    };
    
    if (messageType === 'image' && req.file) {
      try {
        // Upload image to Supabase Storage
        const fileName = `${Date.now()}-${req.file.originalname}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-images')
          .upload(fileName, req.file.buffer, {
            contentType: req.file.mimetype
          });
        
        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          return res.json({ success: false, error: 'Failed to upload image' });
        }
        
        const { data: urlData } = supabase.storage
          .from('chat-images')
          .getPublicUrl(fileName);
        
        messageData.image_url = urlData.publicUrl;
        messageData.content = content || 'Image';
      } catch (storageError) {
        console.error('Storage error:', storageError);
        return res.json({ success: false, error: 'Storage configuration error' });
      }
    } else {
      messageData.content = content;
    }
    
    const { data: message, error } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single();
    
    if (error) {
      console.error('Insert message error:', error);
      return res.json({ success: false, error: error.message });
    }
    
    // Update conversation timestamp
    await supabase
      .from('conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    
    res.json({ success: true, message });
  } catch (error) {
    console.error('Send message error:', error);
    res.json({ success: false, error: error.message });
  }
});
// In routes/chat.js - add logging to the start conversation route
router.post('/start/:userId', async (req, res) => {
    console.log('=== START CONVERSATION DEBUG ===');
    console.log('Params:', req.params);
    console.log('Current user:', req.user);
    console.log('Session:', req.session);
    
    const { userId } = req.params;
    const currentUserId = req.user?.id;
    
    if (!currentUserId) {
        console.log('ERROR: No current user ID');
        return res.status(401).json({ error: 'Not authenticated' });
    }
    
    try {
        console.log('Checking for existing conversation...');
        // Check if conversation already exists
        const { data: existingConv, error: searchError } = await supabase
            .from('conversations')
            .select('id')
            .or(`and(user1_id.eq.${currentUserId},user2_id.eq.${userId}),and(user1_id.eq.${userId},user2_id.eq.${currentUserId})`)
            .single();
        
        console.log('Existing conversation:', existingConv);
        console.log('Search error:', searchError);
        
        if (existingConv) {
            console.log('Redirecting to existing conversation:', existingConv.id);
            return res.redirect(`/chat/conversation/${existingConv.id}`);
        }
        
        console.log('Creating new conversation...');
        // Create new conversation
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                user1_id: currentUserId,
                user2_id: userId
            })
            .select()
            .single();
        
        console.log('New conversation:', newConv);
        console.log('Insert error:', error);
        
        if (error) throw error;
        
        console.log('Redirecting to new conversation:', newConv.id);
        res.redirect(`/chat/conversation/${newConv.id}`);
    } catch (error) {
        console.error('Start conversation error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;