const supabase = require('../config/supabase');

const requireAuth = async (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  
  try {
    // Verify token is still valid
    const { data: { user }, error } = await supabase.auth.getUser(req.session.accessToken);
    
    if (error || !user) {
      req.session.destroy();
      return res.redirect('/auth/login');
    }
    
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    req.session.destroy();
    res.redirect('/auth/login');
  }
};

module.exports = { requireAuth };