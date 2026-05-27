const passport       = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { db }         = require('../database/db');

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL:  process.env.BASE_URL + '/auth/google/callback'
},
function(accessToken, refreshToken, profile, done) {
  const email  = profile.emails[0].value;
  const nombre = profile.name.givenName  || '';
  const apell  = profile.name.familyName || '';

  // Buscar si ya existe el usuario con ese email
  let user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email);

  if (user) {
    // Ya existe — inicia sesion directo
    return done(null, user);
  }

  // No existe — verificar si es dominio Luis Amigo
  // Puedes cambiar 'amigo.edu.co' por el dominio real de la universidad
  const dominiosPermitidos = ['amigo.edu.co', 'gmail.com']; // agrega los dominios que necesites
  const dominio = email.split('@')[1];

  if (!dominiosPermitidos.includes(dominio)) {
    return done(null, false, { message: `El dominio @${dominio} no esta autorizado para usar esta plataforma.` });
  }

  // Es un dominio valido pero no tiene cuenta — retornar datos para pre-llenar el registro
  return done(null, false, {
    googleId:  profile.id,
    email,
    nombres:   nombre,
    apellidos: apell,
    foto:      profile.photos?.[0]?.value || null,
    nuevo:     true
  });
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM usuarios WHERE id=?').get(id);
  done(null, user || null);
});

module.exports = passport;