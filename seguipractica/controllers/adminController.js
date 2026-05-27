const bcrypt = require('bcryptjs');
const { db } = require('../database/db');

// ── DASHBOARD ────────────────────────────────────────────────
function getDashboard(req, res) {
  const total     = db.prepare("SELECT COUNT(*) as c FROM practicas").get().c;
  const enProceso = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE estado='En Proceso'").get().c;
  const finaliz   = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE estado='Finalizada'").get().c;
  const pendDocs  = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE estado='Pendiente Docs'").get().c;
  const cancelada = db.prepare("SELECT COUNT(*) as c FROM practicas WHERE estado='Cancelada/Perdida'").get().c;

  const cumplimiento = {
    campus:      db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_campus=1").get().c,
    segSocial:   db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_seg_social=1").get().c,
    epsCert:     db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_eps_cert=1").get().c,
    arlCert:     db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_arl_cert=1").get().c,
    matriculado: db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_matriculado=1").get().c,
    acta:        db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_acta=1").get().c,
    seg1:        db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_seg1=1").get().c,
    seg2:        db.prepare("SELECT COUNT(*) as c FROM practicas WHERE req_seg2=1").get().c,
  };

  const alertas = db.prepare(`
    SELECT p.id, p.estado, u.nombres, u.apellidos, u.cedula,
           p.req_eps_cert, p.req_arl_cert, p.req_acta
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    WHERE p.req_eps_cert=0 OR p.req_arl_cert=0 OR p.req_acta=0
    LIMIT 5
  `).all();

  const docentes = db.prepare(`
    SELECT u.id, u.nombres, u.apellidos,
           COUNT(p.id) as total_estudiantes
    FROM usuarios u
    LEFT JOIN practicas p ON p.docente_id = u.id
    WHERE u.role = 'docente' AND u.activo = 1
    GROUP BY u.id
  `).all();

  const facultades = db.prepare("SELECT * FROM facultades WHERE activo=1").all();
  const programas  = db.prepare(`
    SELECT p.*, f.nombre as facultad_nombre
    FROM programas p
    JOIN facultades f ON f.id = p.facultad_id
    WHERE p.activo = 1
  `).all();
  const semestres  = db.prepare(`
    SELECT s.*, p.nombre as programa_nombre
    FROM semestres_practica s
    JOIN programas p ON p.id = s.programa_id
    ORDER BY s.programa_id, s.numero
  `).all();

  const practicasPorSemestre = {};
  semestres.forEach(s => {
    const cnt = db.prepare(
      "SELECT COUNT(*) as c FROM practicas WHERE semestre_practica = ?"
    ).get(s.nombre);
    practicasPorSemestre[s.nombre] = cnt.c;
  });

  res.render('admin/dashboard', {
    titulo: 'Dashboard',
    total, enProceso, finaliz, pendDocs, cancelada,
    cumplimiento, alertas, docentes,
    facultades, programas, semestres, practicasPorSemestre
  });
}

// ── ESTUDIANTES ──────────────────────────────────────────────
function getEstudiantes(req, res) {
  const { buscar = '', estado = '' } = req.query;
  let sql = `
    SELECT p.id as practica_id, p.estado, p.nota_final, p.periodo, p.codigo_curso,
           p.empresa_nombre, p.req_campus, p.req_eps_cert, p.req_arl_cert,
           p.req_seg1, p.req_seg2,
           u.id as user_id, u.cedula, u.nombres, u.apellidos, u.email,
           d.nombres as docente_nombres, d.apellidos as docente_apellidos
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios d ON d.id = p.docente_id
    WHERE 1=1
  `;
  const params = [];
  if (buscar) {
    sql += ` AND (u.nombres LIKE ? OR u.apellidos LIKE ? OR u.cedula LIKE ? OR p.empresa_nombre LIKE ?)`;
    const b = `%${buscar}%`;
    params.push(b, b, b, b);
  }
  if (estado) {
    sql += ` AND p.estado = ?`;
    params.push(estado);
  }
  sql += ' ORDER BY u.apellidos ASC';
  const estudiantes = db.prepare(sql).all(...params);
  res.render('admin/estudiantes', { titulo: 'Estudiantes', estudiantes, buscar, estado });
}

function getEstudianteDetalle(req, res) {
  const { id } = req.params;

  const practica = db.prepare(`
    SELECT p.*, u.cedula, u.nombres, u.apellidos, u.email, u.celular, u.telefono,
           d.nombres as docente_nombres, d.apellidos as docente_apellidos
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios d ON d.id = p.docente_id
    WHERE p.id = ?
  `).get(id);

  if (!practica) {
    req.flash('error', 'Practica no encontrada.');
    return res.redirect('/admin/estudiantes');
  }

  const seguimientos = db.prepare(`
    SELECT s.*, d.nombres as doc_n, d.apellidos as doc_a
    FROM seguimientos s
    LEFT JOIN usuarios d ON d.id = s.docente_id
    WHERE s.practica_id = ?
    ORDER BY s.fecha DESC
  `).all(id);

  const documentos = db.prepare(
    'SELECT * FROM documentos WHERE practica_id = ? ORDER BY tipo, creado_en DESC'
  ).all(id);

  const docentes = db.prepare(
    "SELECT id, nombres, apellidos FROM usuarios WHERE role='docente' AND activo=1"
  ).all();

  const historialPracticas = db.prepare(`
    SELECT p.*, d.nombres as doc_n, d.apellidos as doc_a
    FROM practicas p
    LEFT JOIN usuarios d ON d.id = p.docente_id
    WHERE p.usuario_id = ?
    ORDER BY p.creado_en ASC
  `).all(practica.usuario_id);

  res.render('admin/estudiante-detalle', {
    titulo: `${practica.nombres} ${practica.apellidos}`,
    practica, seguimientos, documentos, docentes, historialPracticas
  });
}

function postEditarPractica(req, res) {
  const { id } = req.params;
  const {
    docente_id, periodo, codigo_curso, estado, nota_final, observacion_final,
    empresa_nombre, empresa_nit, empresa_dir, empresa_tel, empresa_barrio,
    empresa_pref, empresa_sector, empresa_naturaleza, empresa_clasif,
    jefe_nombre, jefe_email, jefe_telefono, jefe_celular,
    cargo, tipo_contrato, carta_laboral, funcion, tiempo_empresa,
    salario, fecha_inicio, fecha_fin, eps, arl, desarrollo, observacion,
    req_campus, req_seg_social, req_eps_cert, req_arl_cert,
    req_matriculado, req_acta, req_seg1, req_seg2
  } = req.body;

  db.prepare(`
    UPDATE practicas SET
      docente_id=?, periodo=?, codigo_curso=?, estado=?, nota_final=?, observacion_final=?,
      empresa_nombre=?, empresa_nit=?, empresa_dir=?, empresa_tel=?, empresa_barrio=?,
      empresa_pref=?, empresa_sector=?, empresa_naturaleza=?, empresa_clasif=?,
      jefe_nombre=?, jefe_email=?, jefe_telefono=?, jefe_celular=?,
      cargo=?, tipo_contrato=?, carta_laboral=?, funcion=?, tiempo_empresa=?,
      salario=?, fecha_inicio=?, fecha_fin=?, eps=?, arl=?,
      desarrollo=?, observacion=?,
      req_campus=?, req_seg_social=?, req_eps_cert=?, req_arl_cert=?,
      req_matriculado=?, req_acta=?, req_seg1=?, req_seg2=?,
      actualizado_en=datetime('now','localtime')
    WHERE id=?
  `).run(
    docente_id || null, periodo, codigo_curso,
    estado, nota_final || '', observacion_final || '',
    empresa_nombre, empresa_nit, empresa_dir, empresa_tel, empresa_barrio,
    empresa_pref, empresa_sector, empresa_naturaleza, empresa_clasif,
    jefe_nombre, jefe_email, jefe_telefono, jefe_celular,
    cargo, tipo_contrato, carta_laboral, funcion, tiempo_empresa,
    salario, fecha_inicio, fecha_fin, eps, arl,
    desarrollo, observacion,
    req_campus === 'on' ? 1 : 0,
    req_seg_social === 'on' ? 1 : 0,
    req_eps_cert === 'on' ? 1 : 0,
    req_arl_cert === 'on' ? 1 : 0,
    req_matriculado === 'on' ? 1 : 0,
    req_acta === 'on' ? 1 : 0,
    req_seg1 === 'on' ? 1 : 0,
    req_seg2 === 'on' ? 1 : 0,
    id
  );

  req.flash('success', 'Practica actualizada correctamente.');
  res.redirect(`/admin/estudiantes/${id}`);
}

// ── CREAR ESTUDIANTE (desde admin) ───────────────────────────
function getCrearEstudiante(req, res) {
  const docentes = db.prepare("SELECT id,nombres,apellidos FROM usuarios WHERE role='docente' AND activo=1").all();
  res.render('admin/crear-estudiante', { titulo: 'Nuevo Estudiante', docentes });
}

function postCrearEstudiante(req, res) {
  const { cedula, nombres, apellidos, email, celular, password, docente_id, periodo, codigo_curso } = req.body;

  if (!cedula || !nombres || !apellidos || !email || !password) {
    req.flash('error', 'Completa los campos obligatorios.');
    return res.redirect('/admin/estudiantes/crear');
  }
  if (db.prepare('SELECT id FROM usuarios WHERE cedula=?').get(cedula)) {
    req.flash('error', 'Ya existe un usuario con esa cedula.');
    return res.redirect('/admin/estudiantes/crear');
  }

  const crear = db.transaction(() => {
    const hash = bcrypt.hashSync(password || '123456', 10);
    const r = db.prepare(`
      INSERT INTO usuarios (cedula,nombres,apellidos,email,celular,role,password)
      VALUES (?,?,?,?,?,'estudiante',?)
    `).run(cedula, nombres, apellidos, email, celular || '', hash);

    db.prepare(`
      INSERT INTO practicas (usuario_id, docente_id, periodo, codigo_curso, estado)
      VALUES (?, ?, ?, ?, 'Pendiente Docs')
    `).run(r.lastInsertRowid, docente_id || null, periodo || '2025-1', codigo_curso || '');
  });

  try {
    crear();
    req.flash('success', `Estudiante ${nombres} creado correctamente.`);
    res.redirect('/admin/estudiantes');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Error al crear el estudiante.');
    res.redirect('/admin/estudiantes/crear');
  }
}

// ── USUARIOS ─────────────────────────────────────────────────
function getUsuarios(req, res) {
  const usuarios = db.prepare('SELECT id,cedula,nombres,apellidos,email,celular,role,activo,creado_en FROM usuarios ORDER BY role,apellidos').all();
  res.render('admin/usuarios', { titulo: 'Usuarios', usuarios });
}

function postCrearUsuario(req, res) {
  const { cedula, nombres, apellidos, email, celular, role, password } = req.body;
  if (!cedula || !nombres || !email || !password || !role) {
    req.flash('error', 'Completa todos los campos.');
    return res.redirect('/admin/usuarios');
  }
  if (db.prepare('SELECT id FROM usuarios WHERE cedula=?').get(cedula)) {
    req.flash('error', 'Ya existe un usuario con esa cedula.');
    return res.redirect('/admin/usuarios');
  }
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO usuarios (cedula,nombres,apellidos,email,celular,role,password) VALUES (?,?,?,?,?,?,?)`).run(cedula, nombres, apellidos, email, celular || '', role, hash);
  req.flash('success', 'Usuario creado.');
  res.redirect('/admin/usuarios');
}

function postToggleUsuario(req, res) {
  const { id } = req.params;
  const u = db.prepare('SELECT activo FROM usuarios WHERE id=?').get(id);
  if (!u) return res.redirect('/admin/usuarios');
  db.prepare('UPDATE usuarios SET activo=? WHERE id=?').run(u.activo ? 0 : 1, id);
  req.flash('success', `Usuario ${u.activo ? 'desactivado' : 'activado'}.`);
  res.redirect('/admin/usuarios');
}

// ── SEGUIMIENTOS ─────────────────────────────────────────────
function getSeguimientos(req, res) {
  const seguimientos = db.prepare(`
    SELECT s.*, u.nombres, u.apellidos, u.cedula,
           d.nombres as doc_n, d.apellidos as doc_a
    FROM seguimientos s
    JOIN practicas p ON p.id = s.practica_id
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios d ON d.id = s.docente_id
    ORDER BY s.fecha DESC
  `).all();
  res.render('admin/seguimientos', { titulo: 'Seguimientos', seguimientos });
}

// ── EMPRESAS ─────────────────────────────────────────────────
function getEmpresas(req, res) {
  const empresas = db.prepare(`
    SELECT
      p.empresa_nit         as nit,
      p.empresa_nombre      as nombre,
      p.empresa_dir         as direccion,
      p.empresa_tel         as telefono,
      p.empresa_barrio      as barrio,
      p.empresa_sector      as sector,
      p.empresa_naturaleza  as naturaleza,
      p.empresa_clasif      as clasificacion,
      COUNT(p.id)           as total_estudiantes
    FROM practicas p
    WHERE p.empresa_nit IS NOT NULL AND p.empresa_nit != ''
    GROUP BY p.empresa_nit
    ORDER BY p.empresa_nombre ASC
  `).all();

  res.render('admin/empresas', { titulo: 'Empresas', empresas });
}

function getEmpresaDetalle(req, res) {
  const { nit } = req.params;

  const empresa = db.prepare(`
    SELECT
      p.empresa_nit         as nit,
      p.empresa_nombre      as nombre,
      p.empresa_dir         as direccion,
      p.empresa_tel         as telefono,
      p.empresa_barrio      as barrio,
      p.empresa_pref        as punto_referencia,
      p.empresa_sector      as sector,
      p.empresa_naturaleza  as naturaleza,
      p.empresa_clasif      as clasificacion,
      COUNT(p.id)           as total_estudiantes
    FROM practicas p
    WHERE p.empresa_nit = ?
    GROUP BY p.empresa_nit
  `).get(nit);

  if (!empresa) {
    req.flash('error', 'Empresa no encontrada.');
    return res.redirect('/admin/empresas');
  }

  const estudiantes = db.prepare(`
    SELECT p.id as practica_id, p.estado, p.cargo, p.semestre_practica,
           p.fecha_inicio, p.fecha_fin, p.nota_final,
           u.nombres, u.apellidos, u.cedula, u.email,
           d.nombres as doc_nombres, d.apellidos as doc_apellidos
    FROM practicas p
    JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN usuarios d ON d.id = p.docente_id
    WHERE p.empresa_nit = ?
    ORDER BY u.apellidos ASC
  `).all(nit);

  res.render('admin/empresa-detalle', {
    titulo: empresa.nombre,
    empresa, estudiantes
  });
}
// ── DOCUMENTOS ───────────────────────────────────────────────
function postEstadoDocumento(req, res) {
  const { id, practica_id } = req.params;
  const { estado, observacion } = req.body;
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!doc) { req.flash('error', 'Documento no encontrado.'); return res.redirect('back'); }
  db.prepare('UPDATE documentos SET estado = ?, observacion_doc = ? WHERE id = ?').run(estado, observacion || '', id);
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
  res.redirect(`/admin/estudiantes/${practica_id}`);
}

function getDescargarDocumentoAdmin(req, res) {
  const { id } = req.params;
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(id);
  if (!doc) { req.flash('error', 'Documento no encontrado.'); return res.redirect('back'); }
  const filePath = require('path').join(__dirname, '../public/uploads', doc.nombre_file);
  res.download(filePath, doc.nombre_orig);
}

// ── HABILITADOS ───────────────────────────────────────────────
function getHabilitados(req, res) {
  const lista = db.prepare(`
    SELECT h.*, CASE WHEN u.id IS NOT NULL THEN 1 ELSE 0 END as ya_registrado
    FROM estudiantes_habilitados h
    LEFT JOIN usuarios u ON u.cedula = h.cedula AND u.role = 'estudiante'
    ORDER BY h.habilitado DESC, h.apellidos ASC
  `).all();
  const total = lista.length;
  const habilitados = lista.filter(e => e.habilitado).length;
  const pendientes  = lista.filter(e => !e.habilitado).length;
  const registrados = lista.filter(e => e.ya_registrado).length;
  res.render('admin/habilitados', { titulo:'Estudiantes Habilitados', lista, total, habilitados, pendientes, registrados });
}

function postCrearHabilitado(req, res) {
  const { cedula, nombres, apellidos, creditos, tds006, habilitado, observacion } = req.body;
  if (!cedula||!nombres||!apellidos) { req.flash('error','Cedula, nombres y apellidos son obligatorios.'); return res.redirect('/admin/habilitados'); }
  if (db.prepare('SELECT id FROM estudiantes_habilitados WHERE cedula=?').get(cedula)) { req.flash('error','Ya existe un registro con esa cedula.'); return res.redirect('/admin/habilitados'); }
  const creditosNum = parseInt(creditos)||0;
  const tds006Val   = tds006==='on'?1:0;
  const cumpleReqs  = creditosNum>=46 && tds006Val===1;
  const habVal      = habilitado==='on' && cumpleReqs?1:0;
  let obs = observacion||'';
  if (!cumpleReqs) { const f=[]; if(creditosNum<46)f.push(`Creditos insuficientes (${creditosNum}/46)`); if(!tds006Val)f.push('TDS006 no aprobado'); obs=obs||f.join(', '); }
  db.prepare(`INSERT INTO estudiantes_habilitados (cedula,nombres,apellidos,creditos,tds006,habilitado,observacion) VALUES (?,?,?,?,?,?,?)`).run(cedula,nombres.trim(),apellidos.trim(),creditosNum,tds006Val,habVal,obs);
  req.flash('success',`Estudiante ${nombres} agregado correctamente.`);
  res.redirect('/admin/habilitados');
}

function postEditarHabilitado(req, res) {
  const { id } = req.params;
  const { creditos, tds006, habilitado, observacion } = req.body;
  const creditosNum = parseInt(creditos)||0;
  const tds006Val   = tds006==='on'?1:0;
  const cumpleReqs  = creditosNum>=46 && tds006Val===1;
  const habVal      = habilitado==='on' && cumpleReqs?1:0;
  let obs = observacion||'';
  if (!cumpleReqs&&!obs) { const f=[]; if(creditosNum<46)f.push(`Creditos insuficientes (${creditosNum}/46)`); if(!tds006Val)f.push('TDS006 no aprobado'); obs=f.join(', '); }
  if (cumpleReqs&&!obs) obs='Cumple todos los requisitos';
  db.prepare(`UPDATE estudiantes_habilitados SET creditos=?,tds006=?,habilitado=?,observacion=? WHERE id=?`).run(creditosNum,tds006Val,habVal,obs,id);
  req.flash('success','Registro actualizado.');
  res.redirect('/admin/habilitados');
}

function postEliminarHabilitado(req, res) {
  const { id } = req.params;
  db.prepare('DELETE FROM estudiantes_habilitados WHERE id=?').run(id);
  req.flash('success','Registro eliminado.');
  res.redirect('/admin/habilitados');
}

// ── DOCENTES ─────────────────────────────────────────────────
function getDocentes(req, res) {
  const docentes = db.prepare(`
    SELECT u.*, COUNT(p.id) as total_estudiantes
    FROM usuarios u
    LEFT JOIN practicas p ON p.docente_id = u.id
    WHERE u.role = 'docente'
    GROUP BY u.id
    ORDER BY u.apellidos ASC
  `).all();
  res.render('admin/docentes', { titulo:'Docentes', docentes });
}

function postCrearDocente(req, res) {
  const { cedula, nombres, apellidos, email, celular, telefono, password } = req.body;
  if (!cedula||!nombres||!apellidos||!email||!password) { req.flash('error','Completa todos los campos obligatorios.'); return res.redirect('/admin/docentes'); }
  if (password.length<6) { req.flash('error','La contrasena debe tener minimo 6 caracteres.'); return res.redirect('/admin/docentes'); }
  if (db.prepare('SELECT id FROM usuarios WHERE cedula=?').get(cedula)) { req.flash('error','Ya existe un usuario con esa cedula.'); return res.redirect('/admin/docentes'); }
  if (db.prepare('SELECT id FROM usuarios WHERE email=?').get(email)) { req.flash('error','Ya existe un usuario con ese correo.'); return res.redirect('/admin/docentes'); }
  const hash = bcrypt.hashSync(password,10);
  db.prepare(`INSERT INTO usuarios (cedula,nombres,apellidos,email,celular,telefono,role,password) VALUES (?,?,?,?,?,?,'docente',?)`).run(cedula,nombres,apellidos,email,celular||'',telefono||'',hash);
  req.flash('success',`Docente ${nombres} ${apellidos} creado correctamente.`);
  res.redirect('/admin/docentes');
}

function postEditarDocente(req, res) {
  const { id } = req.params;
  const { nombres, apellidos, email, celular, telefono, password } = req.body;
  if (!nombres||!apellidos||!email) { req.flash('error','Nombres, apellidos y correo son obligatorios.'); return res.redirect('/admin/docentes'); }
  const emailExiste = db.prepare('SELECT id FROM usuarios WHERE email=? AND id!=?').get(email,id);
  if (emailExiste) { req.flash('error','Ese correo ya lo usa otro usuario.'); return res.redirect('/admin/docentes'); }
  if (password&&password.length>=6) {
    const hash = bcrypt.hashSync(password,10);
    db.prepare(`UPDATE usuarios SET nombres=?,apellidos=?,email=?,celular=?,telefono=?,password=? WHERE id=? AND role='docente'`).run(nombres,apellidos,email,celular||'',telefono||'',hash,id);
  } else {
    db.prepare(`UPDATE usuarios SET nombres=?,apellidos=?,email=?,celular=?,telefono=? WHERE id=? AND role='docente'`).run(nombres,apellidos,email,celular||'',telefono||'',id);
  }
  req.flash('success','Docente actualizado correctamente.');
  res.redirect('/admin/docentes');
}

// ── FACULTADES ────────────────────────────────────────────────
function getFacultades(req, res) {
  const facultades = db.prepare(`
    SELECT f.*, COUNT(p.id) as total_programas
    FROM facultades f
    LEFT JOIN programas p ON p.facultad_id = f.id
    GROUP BY f.id
    ORDER BY f.nombre ASC
  `).all();
  res.render('admin/facultades', { titulo: 'Facultades', facultades });
}

function postCrearFacultad(req, res) {
  const { nombre, codigo } = req.body;
  if (!nombre || !codigo) {
    req.flash('error', 'Nombre y codigo son obligatorios.');
    return res.redirect('/admin/facultades');
  }
  if (db.prepare('SELECT id FROM facultades WHERE codigo=?').get(codigo.toUpperCase())) {
    req.flash('error', 'Ya existe una facultad con ese codigo.');
    return res.redirect('/admin/facultades');
  }
  db.prepare(`INSERT INTO facultades (nombre, codigo) VALUES (?, ?)`).run(nombre.trim(), codigo.toUpperCase().trim());
  req.flash('success', `Facultad ${nombre} creada correctamente.`);
  res.redirect('/admin/facultades');
}

function postEditarFacultad(req, res) {
  const { id } = req.params;
  const { nombre, codigo, activo } = req.body;
  if (!nombre || !codigo) {
    req.flash('error', 'Nombre y codigo son obligatorios.');
    return res.redirect('/admin/facultades');
  }
  const duplicado = db.prepare('SELECT id FROM facultades WHERE codigo=? AND id!=?').get(codigo.toUpperCase(), id);
  if (duplicado) {
    req.flash('error', 'Ya existe otra facultad con ese codigo.');
    return res.redirect('/admin/facultades');
  }
  db.prepare(`UPDATE facultades SET nombre=?, codigo=?, activo=? WHERE id=?`)
    .run(nombre.trim(), codigo.toUpperCase().trim(), activo === 'on' ? 1 : 0, id);
  req.flash('success', 'Facultad actualizada correctamente.');
  res.redirect('/admin/facultades');
}

function postEliminarFacultad(req, res) {
  const { id } = req.params;
  const conProgramas = db.prepare('SELECT COUNT(*) as c FROM programas WHERE facultad_id=?').get(id).c;
  if (conProgramas > 0) {
    req.flash('error', `No puedes eliminar esta facultad porque tiene ${conProgramas} programa(s) asociado(s).`);
    return res.redirect('/admin/facultades');
  }
  db.prepare('DELETE FROM facultades WHERE id=?').run(id);
  req.flash('success', 'Facultad eliminada correctamente.');
  res.redirect('/admin/facultades');
}

// ── PROGRAMAS ────────────────────────────────────────────────
function getProgramas(req, res) {
  const programas = db.prepare(`
    SELECT p.*, f.nombre as facultad_nombre,
           COUNT(pr.id) as total_estudiantes
    FROM programas p
    JOIN facultades f ON f.id = p.facultad_id
    LEFT JOIN practicas pr ON pr.programa_id = p.id
    GROUP BY p.id
    ORDER BY f.nombre, p.nombre ASC
  `).all();
  const facultades = db.prepare('SELECT * FROM facultades WHERE activo=1 ORDER BY nombre').all();
  const semestres  = db.prepare('SELECT s.*, p.nombre as prog_nombre FROM semestres_practica s JOIN programas p ON p.id=s.programa_id ORDER BY s.programa_id, s.numero').all();
  res.render('admin/programas', { titulo: 'Programas', programas, facultades, semestres });
}

function postCrearPrograma(req, res) {
  const { facultad_id, nombre, codigo, total_practicas } = req.body;
  if (!facultad_id || !nombre || !codigo || !total_practicas) {
    req.flash('error', 'Todos los campos son obligatorios.');
    return res.redirect('/admin/programas');
  }
  if (db.prepare('SELECT id FROM programas WHERE codigo=?').get(codigo.toUpperCase())) {
    req.flash('error', 'Ya existe un programa con ese codigo.');
    return res.redirect('/admin/programas');
  }
  const total = parseInt(total_practicas);
  if (total < 1 || total > 10) {
    req.flash('error', 'El numero de practicas debe estar entre 1 y 10.');
    return res.redirect('/admin/programas');
  }

  const crearPrograma = db.transaction(() => {
    const r = db.prepare(`INSERT INTO programas (facultad_id, nombre, codigo, total_practicas) VALUES (?,?,?,?)`)
      .run(parseInt(facultad_id), nombre.trim(), codigo.toUpperCase().trim(), total);

    const progId = r.lastInsertRowid;
    const insSem = db.prepare(`INSERT INTO semestres_practica (programa_id, numero, nombre, descripcion) VALUES (?,?,?,?)`);

    for (let i = 1; i <= total; i++) {
      const nombreSem = total === 1 ? 'Practica' : `Practica ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][i-1]}`;
      insSem.run(progId, i, nombreSem, `Semestre ${i} de practica empresarial del programa ${nombre}.`);
    }
  });

  try {
    crearPrograma();
    req.flash('success', `Programa ${nombre} creado con ${total} semestre(s) de practica.`);
  } catch (e) {
    console.error(e);
    req.flash('error', 'Error al crear el programa.');
  }
  res.redirect('/admin/programas');
}

function postEditarPrograma(req, res) {
  const { id } = req.params;
  const { facultad_id, nombre, codigo, total_practicas, activo } = req.body;
  if (!facultad_id || !nombre || !codigo || !total_practicas) {
    req.flash('error', 'Todos los campos son obligatorios.');
    return res.redirect('/admin/programas');
  }
  const duplicado = db.prepare('SELECT id FROM programas WHERE codigo=? AND id!=?').get(codigo.toUpperCase(), id);
  if (duplicado) {
    req.flash('error', 'Ya existe otro programa con ese codigo.');
    return res.redirect('/admin/programas');
  }

  const total    = parseInt(total_practicas);
  const totalAnt = db.prepare('SELECT total_practicas FROM programas WHERE id=?').get(id).total_practicas;

  const actualizarPrograma = db.transaction(() => {
    db.prepare(`UPDATE programas SET facultad_id=?, nombre=?, codigo=?, total_practicas=?, activo=? WHERE id=?`)
      .run(parseInt(facultad_id), nombre.trim(), codigo.toUpperCase().trim(), total, activo === 'on' ? 1 : 0, id);

    // Si cambio el numero de practicas, recrea los semestres
    if (total !== totalAnt) {
      db.prepare('DELETE FROM semestres_practica WHERE programa_id=?').run(id);
      const insSem = db.prepare(`INSERT INTO semestres_practica (programa_id, numero, nombre, descripcion) VALUES (?,?,?,?)`);
      for (let i = 1; i <= total; i++) {
        const nombreSem = total === 1 ? 'Practica' : `Practica ${['I','II','III','IV','V','VI','VII','VIII','IX','X'][i-1]}`;
        insSem.run(id, i, nombreSem, `Semestre ${i} de practica empresarial del programa ${nombre}.`);
      }
    }
  });

  try {
    actualizarPrograma();
    req.flash('success', 'Programa actualizado correctamente.');
  } catch (e) {
    console.error(e);
    req.flash('error', 'Error al actualizar el programa.');
  }
  res.redirect('/admin/programas');
}

function postEliminarPrograma(req, res) {
  const { id } = req.params;
  const conEst = db.prepare('SELECT COUNT(*) as c FROM practicas WHERE programa_id=?').get(id).c;
  if (conEst > 0) {
    req.flash('error', `No puedes eliminar este programa porque tiene ${conEst} estudiante(s) registrado(s).`);
    return res.redirect('/admin/programas');
  }
  db.prepare('DELETE FROM semestres_practica WHERE programa_id=?').run(id);
  db.prepare('DELETE FROM programas WHERE id=?').run(id);
  req.flash('success', 'Programa eliminado correctamente.');
  res.redirect('/admin/programas');
}

function postEliminarDocente(req, res) {
  const { id } = req.params;
  const conEst = db.prepare('SELECT COUNT(*) as c FROM practicas WHERE docente_id=?').get(id).c;
  if (conEst>0) { req.flash('error',`No puedes eliminar este docente porque tiene ${conEst} estudiante(s) asignado(s).`); return res.redirect('/admin/docentes'); }
  db.prepare("DELETE FROM usuarios WHERE id=? AND role='docente'").run(id);
  req.flash('success','Docente eliminado correctamente.');
  res.redirect('/admin/docentes');
}

function postToggleDocente(req, res) {
  const { id } = req.params;
  const d = db.prepare("SELECT activo FROM usuarios WHERE id=? AND role='docente'").get(id);
  if (!d) return res.redirect('/admin/docentes');
  db.prepare('UPDATE usuarios SET activo=? WHERE id=?').run(d.activo?0:1,id);
  req.flash('success',`Docente ${d.activo?'desactivado':'activado'} correctamente.`);
  res.redirect('/admin/docentes');
}

module.exports = {
  getDashboard,
  getEstudiantes, getEstudianteDetalle, postEditarPractica,
  getCrearEstudiante, postCrearEstudiante,
  getUsuarios, postCrearUsuario, postToggleUsuario,
  getSeguimientos,
  getEmpresas, getEmpresaDetalle,
  getHabilitados, postCrearHabilitado, postEditarHabilitado, postEliminarHabilitado,
  postEstadoDocumento, getDescargarDocumentoAdmin,
  getDocentes, postCrearDocente, postEditarDocente, postEliminarDocente, postToggleDocente,
  getFacultades, postCrearFacultad, postEditarFacultad, postEliminarFacultad,
  getProgramas, postCrearPrograma, postEditarPrograma, postEliminarPrograma
};