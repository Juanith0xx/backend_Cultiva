import jwt from 'jsonwebtoken';

export function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(403).json({ error: 'Token inválido' });
  }
}

export function isAdmin(req, res, next) {
  if (req.user.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso solo administrador' });
  }
  next();
}

export function isSupervisor(req, res, next) {
  if (req.user.rol !== 'SUPERVISOR' && req.user.rol !== 'ADMIN') {
    // Permitimos ADMIN para pruebas o gestión completa
    return res.status(403).json({ error: 'Acceso solo supervisor' });
  }
  next();
}
