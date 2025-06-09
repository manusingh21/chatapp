const express = require('express');
const supabase = require('../config/supabase');
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

module.exports = router;