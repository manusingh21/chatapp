const express = require('express');
const {supabase }= require('../config/supabase');
const router = express.Router();

// Login page
router.get('/login', (req, res) => {
  res.render('auth/login', { error: null });
});

// Register page
router.get('/register', (req, res) => {
  res.render('auth/register', { error: null });
});

// Login POST
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      return res.render('auth/login', { error: error.message });
    }
    
    req.session.user = data.user;
    req.session.accessToken = data.session.access_token;
    
    res.redirect('/chat');
  } catch (error) {
    res.render('auth/login', { error: 'Login failed' });
  }
});

// Register POST
router.post('/register', async (req, res) => {
  const { email, password, username, fullName } = req.body;
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          full_name: fullName
        }
      }
    });
    
    if (error) {
      return res.render('auth/register', { error: error.message });
    }
    
    res.render('auth/login', { 
      error: null, 
      message: 'Registration successful! Please check your email to verify your account.' 
    });
  } catch (error) {
    res.render('auth/register', { error: 'Registration failed' });
  }
});

// Logout
router.post('/logout', async (req, res) => {
  try {
    await supabase.auth.signOut();
    req.session.destroy();
    res.redirect('/auth/login');
  } catch (error) {
    console.error('Logout error:', error);
    req.session.destroy();
    res.redirect('/auth/login');
  }
});


// Get current user for client-side
router.get('/user', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ user: req.session.user });
});

// Update user online status
router.post('/update-status', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { is_online, last_seen } = req.body;
  
  try {
    const { error } = await supabase
      .from('profiles')
      .update({
        is_online: is_online,
        last_seen: last_seen
      })
      .eq('id', req.session.user.id);

    if (error) throw error;
    
    res.json({ success: true });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ error: error.message });
  }
});
// Add this to your auth routes
router.get('/user', async (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(req.session.accessToken);
    
    if (error || !user) {
      req.session.destroy();
      return res.status(401).json({ error: 'Invalid session' });
    }
    
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;