import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { login, logout, refreshToken, register, verify, updateProfile, deleteAccount } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { USER_ROLES } from '../models/User.js';

const router = Router();

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  return next();
};

router.post(
  '/register',
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('password').isLength({ min: 6 }).withMessage('Password min 6 chars'),
    body('role').optional().isIn(USER_ROLES).withMessage('Invalid role'),
    body('name').optional().isString()
  ],
  handleValidation,
  register
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  handleValidation,
  login
);

router.post('/logout', logout);
router.get('/verify', authenticate, verify);
router.post('/refresh-token', refreshToken);
router.put('/profile', authenticate, updateProfile);
router.delete('/account', authenticate, deleteAccount);

export default router;
