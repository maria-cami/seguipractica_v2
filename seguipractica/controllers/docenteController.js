const { db } = require('../database/db');

function getDashboard(req, res) {
  const docenteId = req.session.user.id;
  const total   = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE docente_id=?").get(docenteId).c;
  const sinSeg1 = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE docente_id=? AND req_seg1=0 AND estado='En Proceso'").get(docenteId).c;
  const sinSeg2 = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE docente_id=? AND req_seg2=0 AND estado='En Proceso'").get(docenteId).c;
  const finaliz = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE docente_id=? AND estado='Finalizada'").get(docenteId).c;

  const estudiantes = db.prepare(`
    SELECT p.id as practica_id, p.estado, p.nota_final, p.empresa_nombre,
           p.req_eps_cert, p.req_arl_cert, p.req_seg1, p.req_seg2,
           u.nombres, u.apellidos, u.cedula
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.docente_id = ?
    ORDER BY u.apellidos ASC
    LIMIT 6
  `).all(docenteId);

  res.render('docente/dashboard', {
    titulo: 'Mi Dashboard', total, sinSeg1, sinSeg2, finaliz, estudiantes
  });
}

function getMisEstudiantes(req, res) {
  const docenteId = req.session.user.id;
  const estudiantes = db.prepare(`
    SELECT p.id as practica_id, p.estado, p.nota_final, p.periodo, p.empresa_nombre,
           p.req_campus, p.req_eps_cert, p.req_arl_cert, p.req_seg1, p.req_seg2,
           u.nombres, u.apellidos, u.cedula
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.docente_id = ?
    ORDER BY u.apellidos ASC
  `).all(docenteId);

  res.render('docente/mis-estudiantes', { titulo: 'Mis Estudiantes', estudiantes });
}

function getRegistrarSeguimiento(req, res) {
  const docenteId = req.session.user.id;
  const { practica_id } = req.query;

  const estudiantes = db.prepare(`
    SELECT p.id, u.nombres, u.apellidos, p.req_campus, p.req_seg_social,
           p.req_eps_cert, p.req_arl_cert, p.req_matriculado, p.req_acta,
           p.req_seg1, p.req_seg2
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.docente_id = ?
    ORDER BY u.apellidos
  `).all(docenteId);

  let seleccionado = null;
  if (practica_id) {
    seleccionado = estudiantes.find(e => e.id == practica_id) || null;
  }

  res.render('docente/seguimiento', { titulo: 'Registrar Seguimiento', estudiantes, seleccionado });
}

function postRegistrarSeguimiento(req, res) {
  const docenteId = req.session.user.id;
  const {
    practica_id, tipo, fecha, nota, observacion,
    req_campus, req_seg_social, req_eps_cert, req_arl_cert,
    req_matriculado, req_acta, req_seg1, req_seg2,
    estado, nota_final
  } = req.body;

  if (!practica_id || !tipo || !fecha) {
    req.flash('error', 'Selecciona estudiante, tipo y fecha.');
    return res.redirect('/docente/seguimiento');
  }

  const practica = db.prepare('SELECT id FROM practicas WHERE id=? AND docente_id=?').get(practica_id, docenteId);
  if (!practica) {
    req.flash('error', 'No tienes permiso sobre ese estudiante.');
    return res.redirect('/docente/seguimiento');
  }

  const guardar = db.transaction(() => {
    db.prepare(`
      INSERT INTO seguimientos (practica_id, docente_id, tipo, fecha, nota, observacion)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(practica_id, docenteId, tipo, fecha, nota || '', observacion || '');

    db.prepare(`
      UPDATE practicas SET
        req_campus=?, req_seg_social=?, req_eps_cert=?, req_arl_cert=?,
        req_matriculado=?, req_acta=?, req_seg1=?, req_seg2=?,
        estado=?, nota_final=?,
        actualizado_en=datetime('now','localtime')
      WHERE id=?
    `).run(
      req_campus === 'on' ? 1 : 0, req_seg_social === 'on' ? 1 : 0,
      req_eps_cert === 'on' ? 1 : 0, req_arl_cert === 'on' ? 1 : 0,
      req_matriculado === 'on' ? 1 : 0, req_acta === 'on' ? 1 : 0,
      req_seg1 === 'on' ? 1 : 0, req_seg2 === 'on' ? 1 : 0,
      estado || 'En Proceso', nota_final || '',
      practica_id
    );
  });

  try {
    guardar();
    req.flash('success', 'Seguimiento registrado correctamente.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Error al guardar el seguimiento.');
  }

  res.redirect('/docente/mis-estudiantes');
}

function getEstudianteDocenteDetalle(req, res) {
  const { id } = req.params;
  const docenteId = req.session.user.id;

  const practica = db.prepare(`
    SELECT p.*, u.cedula, u.nombres, u.apellidos, u.email, u.celular
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.id = ? AND p.docente_id = ?
  `).get(id, docenteId);

  if (!practica) {
    req.flash('error', 'No tienes acceso a este estudiante.');
    return res.redirect('/docente/mis-estudiantes');
  }

  const documentos = db.prepare(
    'SELECT * FROM documentos WHERE practica_id = ? ORDER BY tipo, creado_en DESC'
  ).all(id);

  const seguimientos = db.prepare(`
    SELECT s.*, d.nombres as doc_n, d.apellidos as doc_a
    FROM seguimientos s
    LEFT JOIN usuarios d ON d.id = s.docente_id
    WHERE s.practica_id = ?
    ORDER BY s.fecha DESC
  `).all(id);

  res.render('docente/estudiante-detalle', {
    titulo: `${practica.nombres} ${practica.apellidos}`,
    practica, documentos, seguimientos
  });
}

function postEstadoDocumentoDocente(req, res) {
  const { id, practica_id } = req.params;
  const docenteId = req.session.user.id;
  const { estado, observacion } = req.body;

  const practica = db.prepare(
    'SELECT id FROM practicas WHERE id = ? AND docente_id = ?'
  ).get(practica_id, docenteId);

  if (!practica) {
    req.flash('error', 'No tienes acceso a este estudiante.');
    return res.redirect('/docente/mis-estudiantes');
  }

  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!doc) {
    req.flash('error', 'Documento no encontrado.');
    return res.redirect('back');
  }

  db.prepare(
    'UPDATE documentos SET estado = ?, observacion_doc = ? WHERE id = ?'
  ).run(estado, observacion || '', id);

  if (estado === 'Aprobado') {
    if (doc.tipo === 'Certificado EPS')  db.prepare('UPDATE practicas SET req_eps_cert=1 WHERE id=?').run(practica_id);
    if (doc.tipo === 'Certificado ARL')  db.prepare('UPDATE practicas SET req_arl_cert=1 WHERE id=?').run(practica_id);
    if (doc.tipo === 'Contrato Laboral') db.prepare('UPDATE practicas SET req_acta=1 WHERE id=?').run(practica_id);
  }
  if (estado === 'Rechazado') {
    if (doc.tipo === 'Certificado EPS')  db.prepare('UPDATE practicas SET req_eps_cert=0 WHERE id=?').run(practica_id);
    if (doc.tipo === 'Certificado ARL')  db.prepare('UPDATE practicas SET req_arl_cert=0 WHERE id=?').run(practica_id);
    if (doc.tipo === 'Contrato Laboral') db.prepare('UPDATE practicas SET req_acta=0 WHERE id=?').run(practica_id);
  }

  req.flash('success', `Documento ${estado.toLowerCase()} correctamente.`);
  res.redirect(`/docente/estudiantes/${practica_id}`);
}

function getDescargarDocumentoDocente(req, res) {
  const { id } = req.params;
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!doc) {
    req.flash('error', 'Documento no encontrado.');
    return res.redirect('back');
  }
  const filePath = require('path').join(__dirname, '../public/uploads', doc.nombre_file);
  res.download(filePath, doc.nombre_orig);
}

// ── EXPORTS ── (solo uno, al final)
module.exports = {
  getDashboard,
  getMisEstudiantes,
  getRegistrarSeguimiento,
  postRegistrarSeguimiento,
  getEstudianteDocenteDetalle,
  postEstadoDocumentoDocente,
  getDescargarDocumentoDocente
};