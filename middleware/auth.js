const supabase = require('../config/supabase').supabase;

const requireAuth = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  // Update last_seen timestamp on every authenticated request
  try {
    await supabase
      .from('profiles')
      .update({ 
        last_seen: new Date().toISOString(),
        is_online: true 
      })
      .eq('id', req.session.user.id);
  } catch (error) {
    console.error('Failed to update last seen:', error);
  }
  
  req.user = req.session.user;
  next();
};

module.exports = { requireAuth };