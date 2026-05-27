const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const ctrl    = require('../controllers/estudianteController');
const { requireRole, verificarProgresoPractica } = require('../middleware/auth');

// Configuracion de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext    = path.extname(file.originalname);
    cb(null, unique + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
  const ext     = path.extname(file.originalname).toLowerCase();
  if (allowed.includes(ext)) cb(null, true);
  else cb(new Error('Solo se permiten PDF, JPG y PNG.'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Middlewares
router.use(requireRole('estudiante'));
router.use(verificarProgresoPractica);

// Rutas
router.get('/practica',                  ctrl.getPractica);
router.get('/seguimientos',              ctrl.getMisSeguimientos);
router.get('/documentos',                ctrl.getMisDocumentos);
router.post('/documentos/subir',         upload.single('archivo'), ctrl.postSubirDocumento);
router.get('/documentos/:id/descargar',  ctrl.getDescargarDocumento);

module.exports = router;