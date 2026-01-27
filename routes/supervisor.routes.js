import express from 'express';
import { auth } from '../middleware/auth.js';
import db from '../db.js';
import { z } from 'zod';

const router = express.Router();

/* =====================
   VALIDACIONES ZOD
===================== */
const visitaSchema = z.object({
  localId: z.number().int({ message: 'localId inválido' }),
  reponedorId: z.number().int({ message: 'reponedorId inválido' }),
  hora: z.string().regex(/^\d{2}:\d{2}$/, 'Hora inválida, formato HH:MM'),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida, formato YYYY-MM-DD')
});

/* =====================
   CREAR TAREA
===================== */
router.post('/tasks', auth, async (req, res) => {
  if (!['SUPERVISOR', 'ADMIN'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Solo supervisores o admin pueden crear tareas' });
  }

  const { reponedorId, descripcion, fecha, estado } = req.body;
  if (!reponedorId || !descripcion || !fecha) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const [result] = await db.query(
      `INSERT INTO tasks (reponedor_id, descripcion, fecha_visita, estado, creado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [reponedorId, descripcion, fecha, estado || 'PENDIENTE', req.user.id]
    );
    res.json({ message: 'Tarea creada correctamente', tareaId: result.insertId });
  } catch (err) {
    console.error('CREATE TASK ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   LISTAR TAREAS
===================== */
router.get('/tasks', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        t.id,
        t.descripcion,
        t.fecha_visita AS fecha,
        t.estado,
        r.id AS reponedor_id,
        r.empresa,
        u.nombre AS reponedor_nombre
      FROM tasks t
      JOIN reponedores r ON t.reponedor_id = r.id
      JOIN usuarios u ON r.usuario_id = u.id
      ORDER BY t.fecha_visita DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET TASKS ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   RESOLVER TAREA
===================== */
router.put('/tasks/:id/resolver', auth, async (req, res) => {
  try {
    const [result] = await db.query(
      'UPDATE tasks SET estado = ? WHERE id = ?',
      ['RESUELTA', req.params.id]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada' });

    res.json({ message: 'Tarea marcada como resuelta' });
  } catch (err) {
    console.error('RESOLVE TASK ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   ELIMINAR TAREA
===================== */
router.delete('/tasks/:id', auth, async (req, res) => {
  if (!['SUPERVISOR', 'ADMIN'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const [result] = await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Tarea no encontrada' });

    res.json({ message: 'Tarea eliminada correctamente' });
  } catch (err) {
    console.error('DELETE TASK ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   LISTAR REPONEDORES
===================== */
router.get('/reponedores', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        r.id,
        u.nombre,
        r.empresa,
        r.empresa_servicio
      FROM reponedores r
      JOIN usuarios u ON r.usuario_id = u.id
      ORDER BY u.nombre ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET REPONEDORES ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   LISTAR LOCALES
===================== */
router.get('/locales', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, nombre_empresa, comuna, direccion, horarios
      FROM locales
      ORDER BY nombre_empresa ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET LOCALES ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   AGENDAR VISITA + CREAR SEMANA
===================== */
router.post('/visitas', auth, async (req, res) => {
  if (!['SUPERVISOR', 'ADMIN'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'No autorizado' });
  }

  try {
    const parsedBody = {
      ...req.body,
      localId: Number(req.body.localId),
      reponedorId: Number(req.body.reponedorId)
    };

    const { localId, reponedorId, hora, fecha } = visitaSchema.parse(parsedBody);

    const [local] = await db.query('SELECT id FROM locales WHERE id = ?', [localId]);
    if (!local.length) return res.status(404).json({ error: 'Local no encontrado' });

    const [reponedor] = await db.query('SELECT usuario_id FROM reponedores WHERE id = ?', [reponedorId]);
    if (!reponedor.length) return res.status(404).json({ error: 'Reponedor no encontrado' });

    const usuarioId = reponedor[0].usuario_id;

    const [exist] = await db.query(
      'SELECT id FROM visitas_agendadas WHERE reponedor_id = ? AND fecha = ? AND hora = ?',
      [usuarioId, fecha, hora]
    );
    if (exist.length > 0) return res.status(400).json({ error: 'El reponedor ya tiene una visita agendada a esa hora' });

    const [result] = await db.query(
      `INSERT INTO visitas_agendadas (local_id, supervisor_id, reponedor_id, hora, fecha)
       VALUES (?, ?, ?, ?, ?)`,
      [localId, req.user.id, usuarioId, hora, fecha]
    );

    const visitaId = result.insertId;

    // Crear registros en visitas_semana
    const startDate = new Date(fecha);
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + i);
      const diaISO = day.toISOString().split('T')[0];
      await db.query(
        'INSERT INTO visitas_semana (visita_id, dia, estado) VALUES (?, ?, ?)',
        [visitaId, diaISO, 'NO_REALIZADA']
      );
    }

    res.status(201).json({ message: 'Visita agendada correctamente', visitaId });
  } catch (err) {
    console.error('CREATE VISITA ERROR:', err);
    if (err instanceof z.ZodError) {
      const errores = err.errors.map(e => ({ campo: e.path.join('.'), mensaje: e.message }));
      return res.status(400).json({ errores });
    }
    res.status(500).json({ error: err.message || 'Error al agendar visita' });
  }
});

/* =====================
   LISTAR VISITAS
===================== */
router.get('/visitas', auth, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        v.id, v.local_id, l.nombre_empresa, l.direccion,
        v.reponedor_id, u.nombre AS reponedor_nombre,
        v.fecha, v.hora, v.estado
      FROM visitas_agendadas v
      JOIN locales l ON v.local_id = l.id
      JOIN usuarios u ON v.reponedor_id = u.id
      ORDER BY v.fecha DESC, v.hora ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET VISITAS ERROR:', err);
    res.status(500).json({ error: err.message });
  }
});

/* =====================
   EDITAR VISITA
===================== */
router.put('/visitas/:id', auth, async (req, res) => {
  if (!['SUPERVISOR', 'ADMIN'].includes(req.user.rol)) return res.status(403).json({ error: 'No autorizado' });

  try {
    const visitaId = Number(req.params.id);
    const parsedBody = { ...req.body, localId: Number(req.body.localId), reponedorId: Number(req.body.reponedorId) };
    const { localId, reponedorId, hora, fecha } = visitaSchema.parse(parsedBody);

    const [exist] = await db.query('SELECT * FROM visitas_agendadas WHERE id = ?', [visitaId]);
    if (!exist.length) return res.status(404).json({ error: 'Visita no encontrada' });

    const [local] = await db.query('SELECT id FROM locales WHERE id = ?', [localId]);
    if (!local.length) return res.status(404).json({ error: 'Local no encontrado' });

    const [reponedor] = await db.query('SELECT usuario_id FROM reponedores WHERE id = ?', [reponedorId]);
    if (!reponedor.length) return res.status(404).json({ error: 'Reponedor no encontrado' });

    const usuarioId = reponedor[0].usuario_id;

    await db.query(
      `UPDATE visitas_agendadas SET local_id = ?, reponedor_id = ?, hora = ?, fecha = ? WHERE id = ?`,
      [localId, usuarioId, hora, fecha, visitaId]
    );

    // Actualizar fechas en visitas_semana
    await db.query('DELETE FROM visitas_semana WHERE visita_id = ?', [visitaId]);
    const startDate = new Date(fecha);
    for (let i = 0; i < 7; i++) {
      const day = new Date(startDate);
      day.setDate(day.getDate() + i);
      const diaISO = day.toISOString().split('T')[0];
      await db.query('INSERT INTO visitas_semana (visita_id, dia, estado) VALUES (?, ?, ?)', [visitaId, diaISO, 'NO_REALIZADA']);
    }

    res.json({ message: 'Visita actualizada correctamente' });
  } catch (err) {
    console.error('UPDATE VISITA ERROR:', err);
    if (err instanceof z.ZodError) {
      const errores = err.errors.map(e => ({ campo: e.path.join('.'), mensaje: e.message }));
      return res.status(400).json({ errores });
    }
    res.status(500).json({ error: err.message || 'Error al actualizar visita' });
  }
});

/* =====================
   ELIMINAR VISITA
===================== */
router.delete('/visitas/:id', auth, async (req, res) => {
  if (!['SUPERVISOR', 'ADMIN'].includes(req.user.rol)) return res.status(403).json({ error: 'No autorizado' });

  try {
    const visitaId = Number(req.params.id);
    const [exist] = await db.query('SELECT * FROM visitas_agendadas WHERE id = ?', [visitaId]);
    if (!exist.length) return res.status(404).json({ error: 'Visita no encontrada' });

    await db.query('DELETE FROM visitas_agendadas WHERE id = ?', [visitaId]);
    await db.query('DELETE FROM visitas_semana WHERE visita_id = ?', [visitaId]);

    res.json({ message: 'Visita eliminada correctamente' });
  } catch (err) {
    console.error('DELETE VISITA ERROR:', err);
    res.status(500).json({ error: err.message || 'Error al eliminar visita' });
  }
});

/* =====================
   RESUMEN SEMANAL POR LOCAL
===================== */
router.get('/visitas/resumen', auth, async (req, res) => {
  try {
    const localId = Number(req.query.localId);
    const weekDate = req.query.week; // YYYY-MM-DD
    if (!localId || !weekDate) return res.status(400).json({ error: 'localId y week son obligatorios' });

    const refDate = new Date(weekDate);
    const day = refDate.getDay();
    const diff = refDate.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(refDate.setDate(diff));
    const weekDays = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });

    const [rows] = await db.query(
      `SELECT vs.dia, vs.estado
       FROM visitas_semana vs
       JOIN visitas_agendadas v ON v.id = vs.visita_id
       WHERE v.local_id = ? AND vs.dia IN (?, ?, ?, ?, ?, ?, ?)`,
      [localId, ...weekDays]
    );

    const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const summary = days.map((label, i) => ({
      dia: label,
      estado: rows[i]?.estado || 'NO_REALIZADA'
    }));

    res.json(summary);
  } catch (err) {
    console.error('WEEKLY SUMMARY ERROR:', err);
    res.status(500).json({ error: 'Error generando resumen semanal' });
  }
});

/* =====================
   CAMBIAR ESTADO VISITA POR DÍA
===================== */
router.put('/visitas/:visitaId/estado', auth, async (req, res) => {
  try {
    if (!['SUPERVISOR', 'ADMIN'].includes(req.user.rol)) return res.status(403).json({ error: 'No autorizado' });

    const visitaId = Number(req.params.visitaId);
    const { estado, dia } = req.body;

    const allowed = ['FINALIZADA', 'EN_PROGRESO', 'NO_REALIZADA'];
    if (!allowed.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

    if (dia) {
      await db.query('UPDATE visitas_semana SET estado = ? WHERE visita_id = ? AND dia = ?', [estado, visitaId, dia]);
    } else {
      await db.query('UPDATE visitas_semana SET estado = ? WHERE visita_id = ?', [estado, visitaId]);
    }

    res.json({ message: 'Estado actualizado correctamente' });
  } catch (err) {
    console.error('UPDATE VISITA SEMANA ERROR:', err);
    res.status(500).json({ error: 'Error actualizando estado' });
  }
});

export default router;
