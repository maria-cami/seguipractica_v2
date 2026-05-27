const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const ctrl    = require('../controllers/authController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../public/uploads'));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.jpg', '.jpeg', '.png'];
    const ext     = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Solo PDF, JPG y PNG.'), false);
  }
});

router.get('/login',             ctrl.getLogin);
router.post('/login',            ctrl.postLogin);
router.get('/verificar',         ctrl.getVerificar);
router.post('/verificar-cedula', ctrl.postVerificarCedula);
router.get('/registro',          ctrl.getRegistro);
router.post('/registro',         upload.fields([
  { name: 'archivo_contrato', maxCount: 1 },
  { name: 'archivo_eps',      maxCount: 1 },
  { name: 'archivo_arl',      maxCount: 1 }
]), ctrl.postRegistro);
router.post('/logout',           ctrl.postLogout);

router.get('/registro-siguiente', ctrl.getRegistroSiguiente);
router.post('/registro-siguiente', upload.fields([
  { name: 'archivo_contrato', maxCount: 1 },
  { name: 'archivo_eps',      maxCount: 1 },
  { name: 'archivo_arl',      maxCount: 1 }
]), ctrl.postRegistroSiguiente);

module.exports = router;