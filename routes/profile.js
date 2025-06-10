const express = require('express');
const {supabase} = require('../config/supabase');
const upload = require('../utils/fileUpload');
const router = express.Router();

// Profile page
router.get('/', async (req, res) => {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();
    
    if (error) throw error;
    
    res.render('profile/index', { profile, user: req.user });
  } catch (error) {
    console.error('Profile error:', error);
    res.render('profile/index', { profile: null, user: req.user });
  }
});

// Update profile
router.post('/update', upload.single('avatar'), async (req, res) => {
  const { username, fullName, bio } = req.body;
  const userId = req.user.id;
  
  try {
    let updateData = {
      username,
      full_name: fullName,
      bio,
      updated_at: new Date().toISOString()
    };
    
    if (req.file) {
      // Upload avatar to Supabase Storage
      const fileName = `avatar-${userId}-${Date.now()}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, req.file.buffer, {
          contentType: req.file.mimetype
        });
      
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('avatars')
          .getPublicUrl(fileName);
        
        updateData.avatar_url = urlData.publicUrl;
      }
    }
    
    const { error } = await supabase
      .from('profiles')
      .update(updateData)
      .eq('id', userId);
    
    if (error) throw error;
    
    res.redirect('/profile?success=1');
  } catch (error) {
    console.error('Profile update error:', error);
    res.redirect('/profile?error=1');
  }
});

module.exports = router;