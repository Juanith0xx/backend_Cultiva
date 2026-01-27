import express from 'express';
import db from '../db.js'; // tu conexión MySQL
import { auth, isSupervisor } from '../middleware/auth.js'; // middleware de seguridad

const router = express.Router();

/* ======================
   GET TODOS LOS LOCALES
====================== */
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM locales ORDER BY creado_en DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================
   CREAR LOCAL
====================== */
router.post('/', auth, isSupervisor, async (req, res) => {
  const { nombre_empresa, comuna, direccion, horarios } = req.body;

  if (!nombre_empresa || !comuna || !direccion) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    const [result] = await db.execute(
      'INSERT INTO locales (nombre_empresa, comuna, direccion, horarios) VALUES (?, ?, ?, ?)',
      [nombre_empresa, comuna, direccion, horarios || null]
    );

    const [newLocal] = await db.execute('SELECT * FROM locales WHERE id = ?', [result.insertId]);
    res.status(201).json(newLocal[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================
   EDITAR LOCAL
====================== */
router.put('/:id', auth, isSupervisor, async (req, res) => {
  const { nombre_empresa, comuna, direccion, horarios } = req.body;
  const { id } = req.params;

  if (!nombre_empresa || !comuna || !direccion) {
    return res.status(400).json({ error: 'Faltan datos obligatorios' });
  }

  try {
    await db.execute(
      'UPDATE locales SET nombre_empresa=?, comuna=?, direccion=?, horarios=? WHERE id=?',
      [nombre_empresa, comuna, direccion, horarios || null, id]
    );

    const [updated] = await db.execute('SELECT * FROM locales WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ======================
   ELIMINAR LOCAL
====================== */
router.delete('/:id', auth, isSupervisor, async (req, res) => {
  const { id } = req.params;

  try {
    await db.execute('DELETE FROM locales WHERE id=?', [id]);
    res.json({ message: 'Local eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
