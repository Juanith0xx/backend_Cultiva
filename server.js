import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Rutas existentes
import contactosRoutes from './routes/contactos.routes.js';
import usuariosRoutes from './routes/usuarios.routes.js';
import reponedorRoutes from './routes/reponedor.routes.js';
import supervisorRoutes from './routes/supervisor.routes.js';
import localesRoutes from './routes/locales.routes.js';

dotenv.config();

const app = express();

// ======================
// CONFIGURACIÓN CORS
// ======================
app.use(cors({
  origin: 'http://localhost:5173', // tu frontend
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// ======================
// PARSEO DE JSON
// ======================
app.use(express.json());

// ======================
// SERVIR ARCHIVOS ESTÁTICOS
// ======================
app.use('/uploads', express.static('uploads'));

// ======================
// RUTAS
// ======================
app.use('/api/contactos', contactosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/reponedor', reponedorRoutes);
app.use('/api/supervisor', supervisorRoutes);
app.use('/api/locales', localesRoutes);

// ======================
// MANEJO DE RUTAS NO ENCONTRADAS
// ======================
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// ======================
// MANEJO GLOBAL DE ERRORES
// ======================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ======================
// INICIO DEL SERVIDOR
// ======================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
