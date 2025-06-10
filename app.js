const express = require('express');
const session = require('express-session');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const {supabase} = require('./config/supabase.js'); // Ensure this points to your Supabase client setup
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const profileRoutes = require('./routes/profile');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
app.use('/auth', authRoutes);
app.use('/chat', authMiddleware.requireAuth, chatRoutes);
app.use('/profile', authMiddleware.requireAuth, profileRoutes);

// Home route
app.get('/', (req, res) => {
  if (req.session.user) {
    res.redirect('/chat');
  } else {
    res.redirect('/auth/login');
  }
});
// Periodic cleanup to mark users as offline after 5 minutes of inactivity
setInterval(async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    await supabase
      .from('profiles')
      .update({ is_online: false })
      .lt('last_seen', fiveMinutesAgo)
      .eq('is_online', true);
    
    console.log('Updated offline users');
  } catch (error) {
    console.error('Failed to update offline users:', error);
  }
}, 2 * 60 * 1000); // Run every 2 minutes

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
module.exports = app;

// Only listen when not in serverless environment
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}