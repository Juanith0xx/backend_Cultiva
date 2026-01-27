import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import db from '../db.js';
import { auth, isAdmin } from '../middleware/auth.js';

const router = express.Router();

// =====================
// Schemas
// =====================
const userSchema = z.object({
  nombre: z.string().min(2),
  correo: z.string().email(),
  password: z.string().min(6),
  rol: z.enum(['ADMIN', 'REPONEDOR', 'SUPERVISOR', 'PROVEEDOR'])
});

const updateUserSchema = userSchema.partial();

// =====================
// LOGIN
// =====================
router.post('/login', async (req, res) => {
  try {
    const { correo, password } = req.body;

    const [rows] = await db.execute('SELECT * FROM usuarios WHERE correo = ?', [correo]);
    if (!rows.length) return res.status(400).json({ error: 'Usuario no existe' });

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Password incorrecta' });

    const token = jwt.sign(
      { id: user.id, rol: user.rol.toUpperCase(), nombre: user.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Devuelve payload consistente
    res.json({
      token,
      rol: user.rol.toUpperCase(),
      nombre: user.nombre
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

// =====================
// CREAR USUARIO (ADMIN)
// =====================
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const data = userSchema.parse(req.body);

    // Verificar correo duplicado
    const [existing] = await db.execute('SELECT id FROM usuarios WHERE correo = ?', [data.correo]);
    if (existing.length > 0) return res.status(400).json({ error: 'Correo ya registrado' });

    const hash = await bcrypt.hash(data.password, 10);

    await db.execute(
      'INSERT INTO usuarios (nombre, correo, password, rol) VALUES (?, ?, ?, ?)',
      [data.nombre, data.correo, hash, data.rol.toUpperCase()]
    );

    res.json({ message: 'Usuario creado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Datos inválidos' });
  }
});

// =====================
// LISTAR USUARIOS (ADMIN)
// =====================
router.get('/', auth, isAdmin, async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT id, nombre, correo, rol, creado_en FROM usuarios');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// =====================
// OBTENER USUARIO POR ID (ADMIN)
// =====================
router.get('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      'SELECT id, nombre, correo, rol, creado_en FROM usuarios WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener usuario' });
  }
});

// =====================
// EDITAR USUARIO (ADMIN)
// =====================
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const data = updateUserSchema.parse(req.body);

    const fields = [];
    const values = [];

    // Validaciones y actualización
    if (data.nombre) {
      fields.push('nombre = ?');
      values.push(data.nombre);
    }

    if (data.correo) {
      // Verificar correo duplicado
      const [existing] = await db.execute('SELECT id FROM usuarios WHERE correo = ? AND id != ?', [data.correo, id]);
      if (existing.length > 0) return res.status(400).json({ error: 'Correo ya registrado por otro usuario' });

      fields.push('correo = ?');
      values.push(data.correo);
    }

    if (data.password) {
      const hash = await bcrypt.hash(data.password, 10);
      fields.push('password = ?');
      values.push(hash);
    }

    if (data.rol) {
      fields.push('rol = ?');
      values.push(data.rol.toUpperCase());
    }

    if (!fields.length) return res.status(400).json({ error: 'No hay datos para actualizar' });

    values.push(id);

    await db.execute(`UPDATE usuarios SET ${fields.join(', ')} WHERE id = ?`, values);

    res.json({ message: 'Usuario actualizado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Datos inválidos' });
  }
});

// =====================
// ELIMINAR USUARIO (ADMIN)
// =====================
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.execute('DELETE FROM usuarios WHERE id = ?', [id]);

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Usuario no encontrado' });

    res.json({ message: 'Usuario eliminado correctamente' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
});

export default router;
