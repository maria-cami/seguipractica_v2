const path   = require('path');
const { db } = require('../database/db');

function getPractica(req, res) {
  const userId = req.session.user.id;

  // Traer TODAS las practicas del estudiante
  const practicas = db.prepare(`
    SELECT p.*,
           u.cedula, u.nombres, u.apellidos, u.email, u.celular, u.telefono,
           d.nombres as docente_nombres, d.apellidos as docente_apellidos,
           f.nombre as facultad_nombre,
           pr.nombre as programa_nombre
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios d ON d.id = p.docente_id
    LEFT JOIN facultades f ON f.id = p.facultad_id
    LEFT JOIN programas pr ON pr.id = p.programa_id
    WHERE p.usuario_id = ?
    ORDER BY p.creado_en ASC
  `).all(userId);

  if (practicas.length === 0) {
    return res.render('estudiante/sin-practica', { titulo: 'Mi Practica' });
  }

  // Practica actual = la ultima
  const practica = practicas[practicas.length - 1];

  const requisitos = [
    { key: 'req_campus',      label: 'Campus Virtual',      value: practica.req_campus },
    { key: 'req_seg_social',  label: 'Seguridad Social',    value: practica.req_seg_social },
    { key: 'req_eps_cert',    label: 'Certificado EPS',     value: practica.req_eps_cert },
    { key: 'req_arl_cert',    label: 'Certificado ARL',     value: practica.req_arl_cert },
    { key: 'req_matriculado', label: 'Matriculado',         value: practica.req_matriculado },
    { key: 'req_acta',        label: 'Acta de Compromisos', value: practica.req_acta },
    { key: 'req_seg1',        label: 'Seguimiento 1',       value: practica.req_seg1 },
    { key: 'req_seg2',        label: 'Seguimiento 2',       value: practica.req_seg2 },
  ];

  const completados = requisitos.filter(r => r.value === 1).length;
  const porcentaje  = Math.round((completados / requisitos.length) * 100);

  res.render('estudiante/practica', {
    titulo:    'Mi Practica',
    practica,
    practicas,
    requisitos,
    completados,
    porcentaje,
    pct: porcentaje
  });
}

function getMisSeguimientos(req, res) {
  const userId = req.session.user.id;

  // Ultima practica del estudiante
  const practica = db.prepare(
    'SELECT id FROM practicas WHERE usuario_id=? ORDER BY creado_en DESC LIMIT 1'
  ).get(userId);

  if (!practica) return res.render('estudiante/sin-practica', { titulo: 'Mis Seguimientos' });

  // Todos los seguimientos de todas sus practicas
  const seguimientos = db.prepare(`
    SELECT s.*, d.nombres as doc_n, d.apellidos as doc_a,
           p.semestre_practica
    FROM seguimientos s
    LEFT JOIN usuarios d ON d.id = s.docente_id
    JOIN practicas p ON p.id = s.practica_id
    WHERE p.usuario_id = ?
    ORDER BY s.fecha DESC
  `).all(userId);

  res.render('estudiante/seguimientos', { titulo: 'Mis Seguimientos', seguimientos });
}

function getMisDocumentos(req, res) {
  const userId = req.session.user.id;

  // Ultima practica activa
  const practica = db.prepare(
    'SELECT id FROM practicas WHERE usuario_id=? ORDER BY creado_en DESC LIMIT 1'
  ).get(userId);

  if (!practica) return res.render('estudiante/sin-practica', { titulo: 'Mis Documentos' });

  const documentos = db.prepare(
    'SELECT * FROM documentos WHERE practica_id=? ORDER BY tipo, creado_en DESC'
  ).all(practica.id);

  res.render('estudiante/documentos', { titulo: 'Mis Documentos', documentos, practicaId: practica.id });
}

function postSubirDocumento(req, res) {
  const userId   = req.session.user.id;
  const practica = db.prepare(
    'SELECT id FROM practicas WHERE usuario_id=? ORDER BY creado_en DESC LIMIT 1'
  ).get(userId);

  if (!practica) {
    req.flash('error', 'No tienes practica registrada.');
    return res.redirect('/estudiante/documentos');
  }
  if (!req.file) {
    req.flash('error', 'Selecciona un archivo valido.');
    return res.redirect('/estudiante/documentos');
  }

  const { tipo } = req.body;
  db.prepare(`
    INSERT INTO documentos (practica_id, tipo, nombre_orig, nombre_file, mime_type)
    VALUES (?, ?, ?, ?, ?)
  `).run(practica.id, tipo || 'Otro', req.file.originalname, req.file.filename, req.file.mimetype);

  if (tipo === 'Certificado EPS') db.prepare('UPDATE practicas SET req_eps_cert=1 WHERE id=?').run(practica.id);
  if (tipo === 'Certificado ARL') db.prepare('UPDATE practicas SET req_arl_cert=1 WHERE id=?').run(practica.id);

  req.flash('success', 'Documento subido correctamente.');
  res.redirect('/estudiante/documentos');
}

function getDescargarDocumento(req, res) {
  const { id }   = req.params;
  const userId   = req.session.user.id;
  const practica = db.prepare(
    'SELECT id FROM practicas WHERE usuario_id=? ORDER BY creado_en DESC LIMIT 1'
  ).get(userId);
  const doc = db.prepare('SELECT * FROM documentos WHERE id=? AND practica_id=?').get(id, practica?.id);

  if (!doc) {
    req.flash('error', 'Documento no encontrado.');
    return res.redirect('/estudiante/documentos');
  }

  const filePath = path.join(__dirname, '../public/uploads', doc.nombre_file);
  res.download(filePath, doc.nombre_orig);
}

module.exports = {
  getPractica,
  getMisSeguimientos,
  getMisDocumentos,
  postSubirDocumento,
  getDescargarDocumento
};