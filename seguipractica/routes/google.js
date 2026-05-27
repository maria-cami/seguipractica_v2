const express  = require('express');
const router   = express.Router();
const passport = require('../config/passport');
const { db }   = require('../database/db');
const bcrypt   = require('bcryptjs');

// Iniciar login con Google
router.get('/', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Callback de Google
router.get('/callback',
  passport.authenticate('google', {
    failureRedirect: '/auth/google/no-cuenta',
    failureMessage:  true
  }),
  function(req, res) {
    // Login exitoso — sesion ya creada por passport
    const user = req.user;
    req.session.user = {
      id:       user.id,
      cedula:   user.cedula,
      nombres:  user.nombres,
      apellidos:user.apellidos,
      email:    user.email,
      role:     user.role
    };
    const redirects = {
      admin:      '/admin/dashboard',
      docente:    '/docente/dashboard',
      estudiante: '/estudiante/practica'
    };
    req.flash('success', `Bienvenido, ${user.nombres}!`);
    res.redirect(redirects[user.role] || '/');
  }
);

// Usuario autenticado con Google pero sin cuenta en el sistema
router.get('/no-cuenta', (req, res) => {
  // Obtener info del intento fallido de la sesion de passport
  const info = req.session.messages?.[req.session.messages.length - 1] || '';
  res.render('auth/google-no-cuenta', {
    titulo:  'Acceso no permitido',
    mensaje: info || 'Tu cuenta de Google no esta registrada en SeguiPractica.'
  });
});

module.exports = router;