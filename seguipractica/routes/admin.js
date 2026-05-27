const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/adminController');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('admin'));

// Dashboard
router.get('/dashboard',                ctrl.getDashboard);

// Estudiantes
router.get('/estudiantes',              ctrl.getEstudiantes);
router.get('/estudiantes/crear',        ctrl.getCrearEstudiante);
router.post('/estudiantes/crear',       ctrl.postCrearEstudiante);
router.get('/estudiantes/:id',          ctrl.getEstudianteDetalle);
router.post('/estudiantes/:id/editar',  ctrl.postEditarPractica);
router.post('/estudiantes/:practica_id/documentos/:id/estado', ctrl.postEstadoDocumento);

// Documentos
router.get('/documentos/:id/descargar', ctrl.getDescargarDocumentoAdmin);

// Usuarios
router.get('/usuarios',                 ctrl.getUsuarios);
router.post('/usuarios/crear',          ctrl.postCrearUsuario);
router.post('/usuarios/:id/toggle',     ctrl.postToggleUsuario);

// Seguimientos
router.get('/seguimientos',             ctrl.getSeguimientos);

// Empresas
router.get('/empresas',                 ctrl.getEmpresas);
router.get('/empresas/:nit',            ctrl.getEmpresaDetalle);

// Habilitados
router.get('/habilitados',                    ctrl.getHabilitados);
router.post('/habilitados/crear',             ctrl.postCrearHabilitado);
router.post('/habilitados/:id/editar',        ctrl.postEditarHabilitado);
router.post('/habilitados/:id/eliminar',      ctrl.postEliminarHabilitado);

// Docentes
router.get('/docentes',                       ctrl.getDocentes);
router.post('/docentes/crear',                ctrl.postCrearDocente);
router.post('/docentes/:id/editar',           ctrl.postEditarDocente);
router.post('/docentes/:id/eliminar',         ctrl.postEliminarDocente);
router.post('/docentes/:id/toggle',           ctrl.postToggleDocente);

// Facultades
router.get('/facultades',                     ctrl.getFacultades);
router.post('/facultades/crear',              ctrl.postCrearFacultad);
router.post('/facultades/:id/editar',         ctrl.postEditarFacultad);
router.post('/facultades/:id/eliminar',       ctrl.postEliminarFacultad);

// Programas
router.get('/programas',                      ctrl.getProgramas);
router.post('/programas/crear',               ctrl.postCrearPrograma);
router.post('/programas/:id/editar',          ctrl.postEditarPrograma);
router.post('/programas/:id/eliminar',        ctrl.postEliminarPrograma);

module.exports = router;

