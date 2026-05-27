const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/docenteController');
const { requireRole } = require('../middleware/auth');

router.use(requireRole('docente'));

router.get('/dashboard',                                        ctrl.getDashboard);
router.get('/mis-estudiantes',                                  ctrl.getMisEstudiantes);
router.get('/seguimiento',                                      ctrl.getRegistrarSeguimiento);
router.post('/seguimiento',                                     ctrl.postRegistrarSeguimiento);
router.get('/estudiantes/:id',                                  ctrl.getEstudianteDocenteDetalle);
router.post('/estudiantes/:practica_id/documentos/:id/estado',  ctrl.postEstadoDocumentoDocente);
router.get('/documentos/:id/descargar',                         ctrl.getDescargarDocumentoDocente);

module.exports = router;