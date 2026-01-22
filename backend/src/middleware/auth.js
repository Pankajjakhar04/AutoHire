import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const accessSecret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Authorization header missing.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, accessSecret);
    const user = await User.findById(payload.sub);
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      isVerified: user.isVerified
    };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

export function requireRole(roles = []) {
  return function roleGuard(req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'Unauthorized.' });
    if (!roles.length || roles.includes(req.user.role)) return next();
    return res.status(403).json({ message: 'Forbidden.' });
  };
}
