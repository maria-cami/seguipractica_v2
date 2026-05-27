const Database = require('better-sqlite3');
const path     = require('path');
const bcrypt   = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'seguipractica.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS facultades (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre    TEXT NOT NULL,
      codigo    TEXT UNIQUE NOT NULL,
      activo    INTEGER DEFAULT 1,
      creado_en TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS programas (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      facultad_id     INTEGER NOT NULL REFERENCES facultades(id),
      nombre          TEXT NOT NULL,
      codigo          TEXT UNIQUE NOT NULL,
      total_practicas INTEGER NOT NULL DEFAULT 1,
      activo          INTEGER DEFAULT 1,
      creado_en       TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS semestres_practica (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      programa_id INTEGER NOT NULL REFERENCES programas(id),
      numero      INTEGER NOT NULL,
      nombre      TEXT NOT NULL,
      descripcion TEXT,
      creado_en   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS estudiantes_habilitados (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula        TEXT UNIQUE NOT NULL,
      nombres       TEXT NOT NULL,
      apellidos     TEXT NOT NULL,
      creditos      INTEGER NOT NULL DEFAULT 0,
      tds006        INTEGER NOT NULL DEFAULT 0,
      habilitado    INTEGER NOT NULL DEFAULT 0,
      observacion   TEXT,
      creado_en     TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cedula      TEXT UNIQUE NOT NULL,
      nombres     TEXT NOT NULL,
      apellidos   TEXT NOT NULL,
      email       TEXT UNIQUE NOT NULL,
      celular     TEXT,
      telefono    TEXT,
      role        TEXT NOT NULL CHECK(role IN ('admin','docente','estudiante')),
      password    TEXT NOT NULL,
      activo      INTEGER DEFAULT 1,
      creado_en   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS empresas (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      nit              TEXT UNIQUE NOT NULL,
      nombre           TEXT NOT NULL,
      direccion        TEXT,
      telefono         TEXT,
      barrio           TEXT,
      punto_referencia TEXT,
      sector           TEXT,
      naturaleza       TEXT,
      clasificacion    TEXT,
      creado_en        TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS practicas (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      usuario_id          INTEGER NOT NULL REFERENCES usuarios(id),
      docente_id          INTEGER REFERENCES usuarios(id),
      empresa_id          INTEGER REFERENCES empresas(id),
      facultad_id         INTEGER REFERENCES facultades(id),
      programa_id         INTEGER REFERENCES programas(id),
      semestre_practica   TEXT,
      periodo             TEXT NOT NULL,
      codigo_curso        TEXT,
      empresa_nombre      TEXT,
      empresa_nit         TEXT,
      empresa_dir         TEXT,
      empresa_tel         TEXT,
      empresa_barrio      TEXT,
      empresa_pref        TEXT,
      empresa_sector      TEXT,
      empresa_naturaleza  TEXT,
      empresa_clasif      TEXT,
      jefe_nombre         TEXT,
      jefe_email          TEXT,
      jefe_telefono       TEXT,
      jefe_celular        TEXT,
      cargo               TEXT,
      tipo_contrato       TEXT,
      carta_laboral       TEXT,
      funcion             TEXT,
      tiempo_empresa      TEXT,
      salario             TEXT,
      fecha_inicio        TEXT,
      fecha_fin           TEXT,
      eps                 TEXT,
      arl                 TEXT,
      desarrollo          TEXT,
      observacion         TEXT,
      estado              TEXT DEFAULT 'Pendiente Docs',
      nota_final          TEXT,
      observacion_final   TEXT,
      req_campus          INTEGER DEFAULT 0,
      req_seg_social      INTEGER DEFAULT 0,
      req_eps_cert        INTEGER DEFAULT 0,
      req_arl_cert        INTEGER DEFAULT 0,
      req_matriculado     INTEGER DEFAULT 0,
      req_acta            INTEGER DEFAULT 0,
      req_seg1            INTEGER DEFAULT 0,
      req_seg2            INTEGER DEFAULT 0,
      creado_en           TEXT DEFAULT (datetime('now','localtime')),
      actualizado_en      TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS seguimientos (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      practica_id INTEGER NOT NULL REFERENCES practicas(id),
      docente_id  INTEGER REFERENCES usuarios(id),
      tipo        TEXT NOT NULL,
      fecha       TEXT NOT NULL,
      nota        TEXT,
      observacion TEXT,
      creado_en   TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS documentos (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      practica_id     INTEGER NOT NULL REFERENCES practicas(id),
      tipo            TEXT NOT NULL,
      nombre_orig     TEXT NOT NULL,
      nombre_file     TEXT NOT NULL,
      mime_type       TEXT,
      estado          TEXT DEFAULT 'Pendiente',
      observacion_doc TEXT,
      creado_en       TEXT DEFAULT (datetime('now','localtime'))
    );
  `);

  const adminExiste = db.prepare('SELECT id FROM usuarios WHERE cedula = ?').get('admin');
  if (!adminExiste) {
    const hash    = bcrypt.hashSync('admin123', 10);
    const hashDoc = bcrypt.hashSync('docente123', 10);

    db.prepare(`INSERT INTO usuarios (cedula,nombres,apellidos,email,role,password) VALUES (?,?,?,?,?,?)`)
      .run('admin','Administrador','Principal','admin@sistema.edu.co','admin',hash);
    db.prepare(`INSERT INTO usuarios (cedula,nombres,apellidos,email,celular,role,password) VALUES (?,?,?,?,?,?,?)`)
      .run('DOC001','Maria Elena','Lopez Gomez','mlopez@sistema.edu.co','3104567890','docente',hashDoc);
    db.prepare(`INSERT INTO usuarios (cedula,nombres,apellidos,email,celular,role,password) VALUES (?,?,?,?,?,?,?)`)
      .run('DOC002','Carlos Alberto','Martinez Rios','cmartinez@sistema.edu.co','3115678901','docente',hashDoc);

    // Facultad
    const fac = db.prepare(`INSERT INTO facultades (nombre,codigo) VALUES (?,?)`)
      .run('Ingenieria y Arquitectura','FIA');

    // Programa
    const prog = db.prepare(`INSERT INTO programas (facultad_id,nombre,codigo,total_practicas) VALUES (?,?,?,?)`)
      .run(fac.lastInsertRowid,'Tecnologia en Desarrollo de Software','TDS',3);

    // Semestres
    const insSem = db.prepare(`INSERT INTO semestres_practica (programa_id,numero,nombre,descripcion) VALUES (?,?,?,?)`);
    insSem.run(prog.lastInsertRowid, 1, 'Practica I',   'Primera experiencia laboral. Vinculacion con empresa del sector.');
    insSem.run(prog.lastInsertRowid, 2, 'Practica II',  'Profundizacion de competencias. Mayor autonomia en la empresa.');
    insSem.run(prog.lastInsertRowid, 3, 'Practica III', 'Practica de cierre. Aplicacion integral e informe final.');

    // Estudiantes habilitados
    const ins = db.prepare(`INSERT INTO estudiantes_habilitados (cedula,nombres,apellidos,creditos,tds006,habilitado,observacion) VALUES (?,?,?,?,?,?,?)`);
    ins.run('1023626875','Samuel','Arias Valencia',       48,1,1,'Cumple todos los requisitos');
    ins.run('1000008313','Juan Felipe','Acosta Cuadros',  50,1,1,'Cumple todos los requisitos');
    ins.run('1023456789','Paula','Restrepo Gomez',        46,1,1,'Cumple todos los requisitos');
    ins.run('1044567890','Laura','Betancur Morales',      52,1,1,'Cumple todos los requisitos');
    ins.run('1055678901','Miguel','Cardona Zapata',       47,1,1,'Cumple todos los requisitos');
    ins.run('1066789012','Andres','Vargas Molina',        48,0,0,'Pendiente aprobar TDS006');
    ins.run('1077890123','Isabella','Montoya Sierra',     38,1,0,'Creditos insuficientes: 38 de 46');
    ins.run('1088901234','Sebastian','Giraldo Pena',      30,0,0,'No cumple creditos ni TDS006');

    console.log('Base de datos inicializada.');
    console.log('Facultad: Ingenieria y Arquitectura');
    console.log('Programa: Tecnologia en Desarrollo de Software');
    console.log('Semestres: Practica I, II y III');
  }
}

module.exports = { db, initDB };