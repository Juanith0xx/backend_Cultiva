import express from 'express';
import { z } from 'zod';
import db from '../db.js';

const router = express.Router();

const contactoSchema = z.object({
  nombre: z.string().min(2),
  apellido_paterno: z.string().min(2),
  apellido_materno: z.string().min(2),
  correo: z.string().email(),
  telefono: z.string().optional(),
  mensaje: z.string().min(5)
});

router.post('/', async (req, res) => {
  try {
    const data = contactoSchema.parse(req.body);

    await db.execute(
      `INSERT INTO contactos 
      (nombre, apellido_paterno, apellido_materno, correo, telefono, mensaje)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [
        data.nombre,
        data.apellido_paterno,
        data.apellido_materno,
        data.correo,
        data.telefono || null,
        data.mensaje
      ]
    );

    res.json({ message: 'Contacto guardado correctamente' });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: 'Datos inválidos', details: err.errors });
    }

    console.error(err);
    res.status(500).json({ error: 'Error en servidor' });
  }
});

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM contactos ORDER BY fecha_creacion DESC'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener contactos' });
  }
});

export default router;
