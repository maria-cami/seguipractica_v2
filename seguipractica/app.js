const express        = require('express');
const session        = require('express-session');
const flash          = require('connect-flash');
const methodOverride = require('method-override');
const path           = require('path');
require('dotenv').config();

const { initDB } = require('./database/db');

// Rutas
const authRoutes       = require('./routes/auth');
const adminRoutes      = require('./routes/admin');
const docenteRoutes    = require('./routes/docente');
const estudianteRoutes = require('./routes/estudiante');
const googleRoutes     = require('./routes/google');

const app = express();

// ── Motor de vistas ──────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Middleware ───────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'seguipractica_secret_2025',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

app.use(flash());

// ── Passport (debe ir despues de session y flash) ────────────
const passport = require('./config/passport');
app.use(passport.initialize());
app.use(passport.session());

// Variables globales disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.user        = req.session.user || null;
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg   = req.flash('error');
  next();
});

// ── Rutas ────────────────────────────────────────────────────
app.use('/', authRoutes);
app.use('/admin', adminRoutes);
app.use('/docente', docenteRoutes);
app.use('/estudiante', estudianteRoutes);
app.use('/auth/google', googleRoutes);

// Ruta raiz
app.get('/', (req, res) => {
  if (req.session.user) {
    const redirects = {
      admin:      '/admin/dashboard',
      docente:    '/docente/dashboard',
      estudiante: '/estudiante/practica'
    };
    return res.redirect(redirects[req.session.user.role] || '/login');
  }
  res.redirect('/login');
});

// 404
app.use((req, res) => {
  res.status(404).render('partials/error', {
    titulo:  'Pagina no encontrada',
    mensaje: 'La ruta que buscas no existe.'
  });
});

// ── Iniciar ──────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

initDB();
app.listen(PORT, () => {
  console.log(`SeguiPractica corriendo en http://localhost:${PORT}`);
  console.log(`Admin por defecto: usuario=admin / password=admin123`);
});