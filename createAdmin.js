import bcrypt from 'bcryptjs';
import db from './db.js';

const createAdmin = async () => {
  const nombre = 'Administrador';
  const correo = 'admin@cultiva.cl';
  const password = 'Admin123!';
  const rol = 'ADMIN';

  const hash = await bcrypt.hash(password, 10);

  try {
    await db.execute(
      'INSERT INTO usuarios (nombre, correo, password, rol) VALUES (?, ?, ?, ?)',
      [nombre, correo, hash, rol]
    );

    console.log('✅ Admin creado correctamente');
  } catch (err) {
    console.error('❌ Error creando admin:', err.message);
  } finally {
    process.exit();
  }
};

createAdmin();
