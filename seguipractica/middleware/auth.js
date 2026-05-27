const { db } = require('../database/db');

// Verifica que el usuario este autenticado
function requireLogin(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Debes iniciar sesion para acceder.');
    return res.redirect('/login');
  }
  next();
}

// Verifica un rol especifico
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user) {
      req.flash('error', 'Debes iniciar sesion.');
      return res.redirect('/login');
    }
    if (!roles.includes(req.session.user.role)) {
      req.flash('error', 'No tienes permiso para acceder a esta seccion.');
      return res.redirect('/');
    }
    next();
  };
}

// Verifica el progreso de practicas del estudiante
function verificarProgresoPractica(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'estudiante') return next();

  const userId = req.session.user.id;

  const practicas = db.prepare(`
    SELECT p.*, sp.numero as num_semestre
    FROM practicas p
    LEFT JOIN semestres_practica sp ON sp.nombre = p.semestre_practica
    WHERE p.usuario_id = ?
    ORDER BY sp.numero ASC, p.creado_en ASC
  `).all(userId);

  if (practicas.length === 0) return next();

  const ultima = practicas[practicas.length - 1];

  if (ultima.estado === 'Finalizada') {
    const numSiguiente = (ultima.num_semestre || 0) + 1;

    const semSiguiente = db.prepare(`
      SELECT s.* FROM semestres_practica s
      WHERE s.programa_id = ? AND s.numero = ?
    `).get(ultima.programa_id, numSiguiente);

    if (semSiguiente) {
      const yaMatriculo = practicas.find(p => p.semestre_practica === semSiguiente.nombre);
      if (!yaMatriculo) {
        return res.render('estudiante/practica-pendiente', {
          titulo:   'Matricula Pendiente',
          semestre: semSiguiente,
          anterior: ultima
        });
      }
    }
  }

  next();
}

module.exports = { requireLogin, requireRole, verificarProgresoPractica };