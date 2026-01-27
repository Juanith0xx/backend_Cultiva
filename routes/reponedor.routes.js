import express from 'express';
import QRCode from 'qrcode';
import db from '../db.js';
import { auth } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const router = express.Router();

// ===============================
// MULTER CONFIG
// ===============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/reponedor';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `foto_${req.user.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// ===============================
// PERFIL + QR
// ===============================
router.get('/profile', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.execute(
      `SELECT r.*, u.nombre, u.correo, u.rol
       FROM reponedores r
       JOIN usuarios u ON r.usuario_id = u.id
       WHERE u.id = ?
       ORDER BY r.id DESC LIMIT 1`,
      [userId]
    );

    if (!rows.length) return res.status(404).json({ error: 'Reponedor no encontrado' });

    const r = rows[0];
    const vigenciaFormateada = r.vigencia
      ? format(new Date(r.vigencia), "dd MMMM yyyy", { locale: es })
      : null;

    const qrText = `Nombre: ${r.nombre}\nCorreo: ${r.correo}\nEmpresa: ${r.empresa}\nServicio: ${r.empresa_servicio}\nRUT: ${r.rut}`;
    const qrDataURL = await QRCode.toDataURL(qrText);

    res.json({
      id: r.id,
      usuario_id: r.usuario_id,
      nombre: r.nombre,
      correo: r.correo,
      rol: r.rol,
      rut: r.rut,
      empresa: r.empresa,
      empresa_servicio: r.empresa_servicio,
      vigencia: vigenciaFormateada,
      foto: r.foto ? `${req.protocol}://${req.get('host')}/uploads/reponedor/${r.foto}` : null,
      qrDataURL,
      geolocalizacion: r.geolocalizacion,
      observaciones: r.observaciones || '',
      creado_en: r.creado_en
    });
  } catch (err) {
    console.error('PROFILE ERROR:', err);
    res.status(500).json({ error: 'Error al obtener perfil del reponedor' });
  }
});

// ===============================
// CREAR REPONEDOR (ADMIN)
// ===============================
router.post('/', auth, upload.single('foto'), async (req, res) => {
  try {
    const { usuario_id, rut, empresa, empresa_servicio, vigencia } = req.body;
    const foto = req.file ? req.file.filename : null;

    if (!usuario_id || !rut || !empresa || !empresa_servicio || !vigencia) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }

    await db.execute(
      `INSERT INTO reponedores (usuario_id, rut, empresa, empresa_servicio, vigencia, foto) VALUES (?, ?, ?, ?, ?, ?)`,
      [usuario_id, rut, empresa, empresa_servicio, vigencia, foto]
    );

    res.json({ message: 'Reponedor creado correctamente' });
  } catch (err) {
    console.error('CREATE REPONEDOR ERROR:', err);
    res.status(500).json({ error: 'Error al crear reponedor' });
  }
});

// ===============================
// LISTAR VISITAS
// ===============================
router.get('/visitas', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.execute(
      `SELECT 
         v.id, v.fecha, v.hora, v.estado, v.inicio_real, v.fin_real,
         v.foto_inicio, v.foto_fin, v.fotos_productos, v.geolocalizacion,
         l.nombre_empresa AS local_nombre, l.direccion, l.comuna
       FROM visitas_agendadas v
       JOIN locales l ON v.local_id = l.id
       WHERE v.reponedor_id = ?
       ORDER BY v.fecha ASC, v.hora ASC`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET VISITAS ERROR:', err);
    res.status(500).json({ error: 'Error al obtener visitas agendadas' });
  }
});

// ===============================
// INICIAR VISITA
// ===============================
router.post('/visitas/:id/start', auth, upload.single('foto_inicio'), async (req, res) => {
  try {
    const visitaId = req.params.id;
    const userId = req.user.id;

    if (!req.file) return res.status(400).json({ error: 'Se requiere la foto de inicio' });
    const { lat, lng } = req.body;
    if (!lat || !lng) return res.status(400).json({ error: 'Se requiere geolocalización' });

    const [result] = await db.execute(
      `UPDATE visitas_agendadas
       SET estado = 'EN_PROGRESO',
           foto_inicio = ?,
           inicio_real = NOW(),
           geolocalizacion = ?
       WHERE id = ? AND reponedor_id = ?`,
      [req.file.filename, `${lat},${lng}`, visitaId, userId]
    );

    if (!result.affectedRows) return res.status(404).json({ error: 'Visita no encontrada o no autorizada' });

    res.json({
      message: 'Visita iniciada correctamente',
      foto_inicio: `${req.protocol}://${req.get('host')}/uploads/reponedor/${req.file.filename}`
    });
  } catch (err) {
    console.error('INICIAR VISITA ERROR:', err);
    res.status(500).json({ error: 'Error al iniciar visita' });
  }
});

// ===============================
// FINALIZAR VISITA
// ===============================
router.post('/visitas/:id/end', auth, upload.array('fotos_productos', 50), async (req, res) => {
  try {
    const visitaId = req.params.id;
    const userId = req.user.id;
    const { foto_fin, observaciones } = req.body;

    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Debe subir fotos de productos' });
    if (!foto_fin) return res.status(400).json({ error: 'Debe subir la foto final de la visita' });

    const fotosProductos = req.files.map(f => f.filename).join(',');

    await db.execute(
      `UPDATE visitas_agendadas
       SET fotos_productos = ?,
           foto_fin = ?,
           observaciones = ?,
           estado = 'FINALIZADA',
           fin_real = NOW()
       WHERE id = ? AND reponedor_id = ?`,
      [fotosProductos, foto_fin, observaciones || null, visitaId, userId]
    );

    res.json({ message: 'Visita finalizada correctamente' });
  } catch (err) {
    console.error('FINALIZAR VISITA ERROR:', err);
    res.status(500).json({ error: 'Error al finalizar visita' });
  }
});

export default router;
