const bcrypt = require('bcryptjs');
const { db } = require('../database/db');

function getLogin(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('auth/login', { titulo: 'Iniciar Sesion' });
}

function postLogin(req, res) {
  const { cedula, password } = req.body;
  if (!cedula || !password) {
    req.flash('error', 'Completa todos los campos.');
    return res.redirect('/login');
  }
  const user = db.prepare('SELECT * FROM usuarios WHERE cedula = ? AND activo = 1').get(cedula);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Cedula o contrasena incorrectos.');
    return res.redirect('/login');
  }
  req.session.user = {
    id: user.id, cedula: user.cedula,
    nombres: user.nombres, apellidos: user.apellidos,
    email: user.email, role: user.role
  };
  const redirects = { admin:'/admin/dashboard', docente:'/docente/dashboard', estudiante:'/estudiante/practica' };
  req.flash('success', `Bienvenido, ${user.nombres}!`);
  res.redirect(redirects[user.role] || '/');
}

function getVerificar(req, res) {
  if (req.session.user) return res.redirect('/');
  res.render('auth/verificar', { titulo: 'Verificar Habilitacion' });
}

function postVerificarCedula(req, res) {
  const { cedula } = req.body;
  if (!cedula) return res.json({ habilitado:false, titulo:'Cedula requerida', mensaje:'Ingresa tu cedula.', requisitos:[] });

  const est = db.prepare('SELECT * FROM estudiantes_habilitados WHERE cedula = ?').get(cedula);
  if (!est) return res.json({ habilitado:false, titulo:'Cedula no encontrada', mensaje:'Tu cedula no esta registrada. Contacta a coordinacion academica.', requisitos:[] });

  const yaRegistrado = db.prepare("SELECT id FROM usuarios WHERE cedula = ? AND role = 'estudiante'").get(cedula);
  if (yaRegistrado) return res.json({ habilitado:false, titulo:'Ya tienes una cuenta', mensaje:'Ya existe una cuenta con esta cedula. Inicia sesion directamente.', requisitos:[] });

  const tieneTDS006   = est.tds006 === 1;
  const tieneCreditos = est.creditos >= 46;
  const estaActivo    = est.habilitado === 1;
  const requisitos = [
    { label:`TDS006 - Proyecto Integrador: ${tieneTDS006 ? 'APROBADO':'PENDIENTE'}`, ok:tieneTDS006 },
    { label:`Creditos academicos: ${est.creditos} de 46 requeridos`, ok:tieneCreditos },
    { label:`Habilitado por coordinacion: ${estaActivo ? 'Si':'No'}`, ok:estaActivo },
  ];
  if (!tieneTDS006 && !tieneCreditos) return res.json({ habilitado:false, titulo:'No cumples los requisitos', mensaje:'No tienes TDS006 aprobado ni los 46 creditos minimos.', requisitos });
  if (!tieneTDS006)   return res.json({ habilitado:false, titulo:'TDS006 no aprobado', mensaje:'Debes tener APROBADO el curso TDS006 - Proyecto Integrador de Desarrollo de Software.', requisitos });
  if (!tieneCreditos) return res.json({ habilitado:false, titulo:'Creditos insuficientes', mensaje:`Tienes ${est.creditos} creditos. Se requieren minimo 46.`, requisitos });
  if (!estaActivo)    return res.json({ habilitado:false, titulo:'Pendiente de habilitacion', mensaje:est.observacion || 'Pendiente de aprobacion por coordinacion academica.', requisitos });

  return res.json({ habilitado:true, nombres:est.nombres, apellidos:est.apellidos, creditos:est.creditos });
}

function getRegistro(req, res) {
  if (req.session.user) return res.redirect('/');
  const docentes   = db.prepare("SELECT id,nombres,apellidos FROM usuarios WHERE role='docente' AND activo=1").all();
  const facultades = db.prepare("SELECT * FROM facultades WHERE activo=1").all();
  const programas  = db.prepare("SELECT p.*,f.nombre as facultad_nombre FROM programas p JOIN facultades f ON f.id=p.facultad_id WHERE p.activo=1").all();
  const semestres  = db.prepare("SELECT s.*,p.nombre as programa_nombre FROM semestres_practica s JOIN programas p ON p.id=s.programa_id ORDER BY s.programa_id,s.numero").all();
  res.render('auth/registro', { titulo:'Registro de Estudiante', docentes, facultades, programas, semestres });
}

// GET /registro-siguiente — formulario para matricular siguiente practica
function getRegistroSiguiente(req, res) {
  // Solo estudiantes autenticados
  if (!req.session.user || req.session.user.role !== 'estudiante') {
    return res.redirect('/login');
  }

  const { semestre } = req.query;
  const docentes   = db.prepare("SELECT id,nombres,apellidos FROM usuarios WHERE role='docente' AND activo=1").all();
  const facultades = db.prepare("SELECT * FROM facultades WHERE activo=1").all();
  const programas  = db.prepare("SELECT p.*,f.nombre as facultad_nombre FROM programas p JOIN facultades f ON f.id=p.facultad_id WHERE p.activo=1").all();
  const semestres  = db.prepare("SELECT s.*,p.nombre as programa_nombre FROM semestres_practica s JOIN programas p ON p.id=s.programa_id ORDER BY s.programa_id,s.numero").all();

  // Datos del usuario actual
  const usuario = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.session.user.id);

  // Practica anterior para pre-llenar datos de empresa si quiere
  const practicaAnterior = db.prepare(
    'SELECT * FROM practicas WHERE usuario_id=? ORDER BY creado_en DESC LIMIT 1'
  ).get(req.session.user.id);

  res.render('auth/registro-siguiente', {
    titulo:          'Matricular ' + (semestre || 'siguiente practica'),
    docentes, facultades, programas, semestres,
    usuario, practicaAnterior,
    semestreSeleccionado: semestre || ''
  });
}

// POST /registro-siguiente — guarda la nueva practica
function postRegistroSiguiente(req, res) {
  if (!req.session.user || req.session.user.role !== 'estudiante') {
    return res.redirect('/login');
  }

  const userId = req.session.user.id;
  const {
    facultad_id, programa_id, semestre_practica, docente_id,
    empresa_nit, empresa_nombre, empresa_dir, empresa_tel,
    empresa_barrio, empresa_pref, empresa_sector, empresa_naturaleza, empresa_clasif,
    jefe_nombre, jefe_email, jefe_telefono, jefe_celular,
    cargo, tipo_contrato, carta_laboral, funcion, tiempo_empresa,
    salario, fecha_inicio, fecha_fin,
    eps, arl, eps_cert, arl_cert,
    desarrollo, observacion
  } = req.body;

  if (!semestre_practica || !empresa_nombre || !fecha_inicio) {
    req.flash('error', 'Completa los campos obligatorios: semestre, empresa y fecha de inicio.');
    return res.redirect('back');
  }

  // Verificar que no ya este matriculado en ese semestre
  const yaExiste = db.prepare(
    "SELECT id FROM practicas WHERE usuario_id=? AND semestre_practica=?"
  ).get(userId, semestre_practica);

  if (yaExiste) {
    req.flash('error', `Ya estas matriculado en ${semestre_practica}.`);
    return res.redirect('/estudiante/practica');
  }

  // Crear la nueva practica directamente sin pasar por habilitados
  const insertarPractica = db.transaction(() => {
    const practica = db.prepare(`
      INSERT INTO practicas (
        usuario_id, docente_id, facultad_id, programa_id, semestre_practica, periodo,
        empresa_nit, empresa_nombre, empresa_dir, empresa_tel, empresa_barrio, empresa_pref,
        empresa_sector, empresa_naturaleza, empresa_clasif,
        jefe_nombre, jefe_email, jefe_telefono, jefe_celular,
        cargo, tipo_contrato, carta_laboral, funcion, tiempo_empresa,
        salario, fecha_inicio, fecha_fin, eps, arl,
        req_eps_cert, req_arl_cert,
        desarrollo, observacion, estado
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pendiente Docs')
    `).run(
      userId, docente_id||null, facultad_id||null, programa_id||null,
      semestre_practica, semestre_practica,
      empresa_nit||'', empresa_nombre||'', empresa_dir||'', empresa_tel||'',
      empresa_barrio||'', empresa_pref||'', empresa_sector||'', empresa_naturaleza||'', empresa_clasif||'',
      jefe_nombre||'', jefe_email||'', jefe_telefono||'', jefe_celular||'',
      cargo||'', tipo_contrato||'', carta_laboral||'', funcion||'', tiempo_empresa||'',
      salario||'', fecha_inicio||'', fecha_fin||'', eps||'', arl||'',
      eps_cert==='on'?1:0, arl_cert==='on'?1:0,
      desarrollo||'', observacion||''
    );

    const practicaId = practica.lastInsertRowid;
    const insertDoc  = db.prepare(`INSERT INTO documentos (practica_id,tipo,nombre_orig,nombre_file,mime_type) VALUES (?,?,?,?,?)`);

    if (req.files?.['archivo_contrato']?.[0]) {
      const f = req.files['archivo_contrato'][0];
      insertDoc.run(practicaId, 'Contrato Laboral', f.originalname, f.filename, f.mimetype);
    }
    if (req.files?.['archivo_eps']?.[0]) {
      const f = req.files['archivo_eps'][0];
      insertDoc.run(practicaId, 'Certificado EPS', f.originalname, f.filename, f.mimetype);
      db.prepare('UPDATE practicas SET req_eps_cert=1 WHERE id=?').run(practicaId);
    }
    if (req.files?.['archivo_arl']?.[0]) {
      const f = req.files['archivo_arl'][0];
      insertDoc.run(practicaId, 'Certificado ARL', f.originalname, f.filename, f.mimetype);
      db.prepare('UPDATE practicas SET req_arl_cert=1 WHERE id=?').run(practicaId);
    }
  });

  try {
    insertarPractica();
    req.flash('success', `¡${semestre_practica} matriculada correctamente! Bienvenido a tu nueva practica.`);
    res.redirect('/estudiante/practica');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error al matricular la practica. Intenta de nuevo.');
    res.redirect('back');
  }
}

function postRegistro(req, res) {
  const {
    cedula, nombres, apellidos, email, celular, telefono,
    password, password2, docente_id,
    facultad_id, programa_id, semestre_practica,
    empresa_nit, empresa_nombre, empresa_dir, empresa_tel,
    empresa_barrio, empresa_pref, empresa_sector, empresa_naturaleza, empresa_clasif,
    jefe_nombre, jefe_email, jefe_telefono, jefe_celular,
    cargo, tipo_contrato, carta_laboral, funcion, tiempo_empresa,
    salario, fecha_inicio, fecha_fin,
    eps, arl, eps_cert, arl_cert,
    desarrollo, observacion
  } = req.body;

  const docentes   = db.prepare("SELECT id,nombres,apellidos FROM usuarios WHERE role='docente' AND activo=1").all();
  const facultades = db.prepare("SELECT * FROM facultades WHERE activo=1").all();
  const programas  = db.prepare("SELECT p.*,f.nombre as facultad_nombre FROM programas p JOIN facultades f ON f.id=p.facultad_id WHERE p.activo=1").all();
  const semestres  = db.prepare("SELECT s.*,p.nombre as programa_nombre FROM semestres_practica s JOIN programas p ON p.id=s.programa_id ORDER BY s.programa_id,s.numero").all();
  const renderReg  = () => res.render('auth/registro', { titulo:'Registro de Estudiante', docentes, facultades, programas, semestres });

  if (!cedula||!nombres||!apellidos||!email||!password) { req.flash('error','Completa todos los campos obligatorios.'); return renderReg(); }
  if (password.length < 6) { req.flash('error','La contrasena debe tener minimo 6 caracteres.'); return renderReg(); }
  if (password !== password2) { req.flash('error','Las contrasenas no coinciden.'); return renderReg(); }

  const hab = db.prepare('SELECT * FROM estudiantes_habilitados WHERE cedula=?').get(cedula);
  if (!hab) { req.flash('error','Tu cedula no esta registrada. Contacta a coordinacion academica.'); return renderReg(); }
  if (!hab.tds006)        { req.flash('error','No puedes registrarte: TDS006 no esta APROBADO.'); return renderReg(); }
  if (hab.creditos < 46)  { req.flash('error',`No puedes registrarte: creditos insuficientes. Tienes ${hab.creditos} de 46.`); return renderReg(); }
  if (!hab.habilitado)    { req.flash('error',`Tu cuenta aun no esta habilitada. ${hab.observacion||'Contacta a coordinacion.'}`); return renderReg(); }
  if (db.prepare('SELECT id FROM usuarios WHERE cedula=?').get(cedula)) { req.flash('error','Ya existe un usuario con esa cedula.'); return renderReg(); }
  if (db.prepare('SELECT id FROM usuarios WHERE email=?').get(email))   { req.flash('error','Ya existe un usuario con ese correo.'); return renderReg(); }

  const insertarTodo = db.transaction(() => {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare(`INSERT INTO usuarios (cedula,nombres,apellidos,email,celular,telefono,role,password) VALUES (?,?,?,?,?,?,'estudiante',?)`)
      .run(cedula, nombres, apellidos, email, celular||'', telefono||'', hash);
    const userId = r.lastInsertRowid;

    db.prepare(`
      INSERT INTO practicas (
        usuario_id,docente_id,facultad_id,programa_id,semestre_practica,periodo,codigo_curso,
        empresa_nit,empresa_nombre,empresa_dir,empresa_tel,empresa_barrio,empresa_pref,
        empresa_sector,empresa_naturaleza,empresa_clasif,
        jefe_nombre,jefe_email,jefe_telefono,jefe_celular,
        cargo,tipo_contrato,carta_laboral,funcion,tiempo_empresa,
        salario,fecha_inicio,fecha_fin,eps,arl,req_eps_cert,req_arl_cert,
        desarrollo,observacion,estado
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'Pendiente Docs')
    `).run(
      userId, docente_id||null, facultad_id||null, programa_id||null, semestre_practica||'',
      semestre_practica||'2025-1', '',
      empresa_nit||'', empresa_nombre||'', empresa_dir||'', empresa_tel||'',
      empresa_barrio||'', empresa_pref||'', empresa_sector||'', empresa_naturaleza||'', empresa_clasif||'',
      jefe_nombre||'', jefe_email||'', jefe_telefono||'', jefe_celular||'',
      cargo||'', tipo_contrato||'', carta_laboral||'', funcion||'', tiempo_empresa||'',
      salario||'', fecha_inicio||'', fecha_fin||'', eps||'', arl||'',
      eps_cert==='on'?1:0, arl_cert==='on'?1:0,
      desarrollo||'', observacion||''
    );
    return userId;
  });

  try {
    const userId = insertarTodo();
    const practica = db.prepare('SELECT id FROM practicas WHERE usuario_id=?').get(userId);
    if (practica) {
      const insertDoc = db.prepare(`INSERT INTO documentos (practica_id,tipo,nombre_orig,nombre_file,mime_type) VALUES (?,?,?,?,?)`);
      if (req.files?.['archivo_contrato']?.[0]) {
        const f = req.files['archivo_contrato'][0];
        insertDoc.run(practica.id,'Contrato Laboral',f.originalname,f.filename,f.mimetype);
      }
      if (req.files?.['archivo_eps']?.[0]) {
        const f = req.files['archivo_eps'][0];
        insertDoc.run(practica.id,'Certificado EPS',f.originalname,f.filename,f.mimetype);
        db.prepare('UPDATE practicas SET req_eps_cert=1 WHERE id=?').run(practica.id);
      }
      if (req.files?.['archivo_arl']?.[0]) {
        const f = req.files['archivo_arl'][0];
        insertDoc.run(practica.id,'Certificado ARL',f.originalname,f.filename,f.mimetype);
        db.prepare('UPDATE practicas SET req_arl_cert=1 WHERE id=?').run(practica.id);
      }
    }
    req.flash('success','Cuenta creada exitosamente. Ya puedes iniciar sesion.');
    res.redirect('/login');
  } catch (err) {
    console.error(err);
    req.flash('error','Error al crear la cuenta. Intenta de nuevo.');
    renderReg();
  }
}

function postLogout(req, res) {
  req.session.destroy();
  res.redirect('/login');
}

module.exports = {
  getLogin, postLogin,
  getVerificar, postVerificarCedula,
  getRegistro, postRegistro,
  getRegistroSiguiente, postRegistroSiguiente,
  postLogout
};