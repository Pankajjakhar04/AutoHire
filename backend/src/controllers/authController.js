import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendWelcomeEmail } from '../services/email.js';

const USER_ROLES = ['candidate', 'hrManager', 'recruiterAdmin'];

const accessSecret = process.env.JWT_ACCESS_SECRET || 'dev_access_secret';
const refreshSecret = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const accessTtl = process.env.ACCESS_TOKEN_TTL || '15m';
const refreshTtl = process.env.REFRESH_TOKEN_TTL || '7d';

function ttlToMs(ttl) {
  if (!ttl) return 0;
  const match = /^([0-9]+)([smhd])?$/.exec(ttl);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2] || 's';
  const multipliers = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] || 1000);
}

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      name: user.name || ''
    },
    accessSecret,
    { expiresIn: accessTtl }
  );
}

function signRefreshToken(user) {
  return jwt.sign({ sub: user.id, tokenType: 'refresh' }, refreshSecret, { expiresIn: refreshTtl });
}

const isProduction = process.env.NODE_ENV === 'production';

function setRefreshCookie(res, token) {
  const maxAge = ttlToMs(refreshTtl) || 7 * 24 * 60 * 60 * 1000;
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax', // 'none' required for cross-origin in production
    maxAge,
    path: '/'
  });
}

export async function register(req, res) {
  try {
    const { email, password, name, role = 'candidate', employeeId, companyName, highestQualificationDegree, specialization, cgpaOrPercentage, passoutYear } = req.body;

    console.log(`[Registration] Attempt:`, { email, role, name });

    if (!email || !password) {
      console.log(`[Registration] Failed: Missing email or password`);
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    if (!USER_ROLES.includes(role)) {
      console.log(`[Registration] Failed: Invalid role - ${role}`);
      return res.status(400).json({ message: 'Invalid role.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      console.log(`[Registration] Failed: User already exists - ${email}`);
      return res.status(409).json({ message: 'User already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    let userData = {
      email: email.toLowerCase().trim(),
      password: passwordHash,
      name,
      role,
      employeeId: role !== 'candidate' ? employeeId : undefined,
      companyName: role !== 'candidate' ? companyName : undefined,
      highestQualificationDegree,
      specialization,
      cgpaOrPercentage,
      passoutYear
    };

    // Only add candidateId if role is candidate
    if (role === 'candidate') {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 6).toUpperCase();
      userData.candidateId = `CAND-${timestamp}-${random}`;
      console.log(`[Registration] Generated candidateId: ${userData.candidateId}`);
    }

    console.log(`[Registration] Creating user with data:`, { ...userData, password: '[HIDDEN]' });

    const user = await User.create(userData);
    console.log(`[Registration] User created successfully:`, user._id);

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    user.refreshToken = refreshHash;
    await user.save();

    setRefreshCookie(res, refreshToken);
    console.log(`[Registration] Success: User ${email} registered successfully`);

    // ✅ Respond immediately — don't block on email
    res.status(201).json({ user, accessToken });

    // Send welcome email in background (non-blocking)
    sendWelcomeEmail({ to: email, userName: name, role, userId: user._id })
      .then((result) => console.log('[Registration] Welcome email sent:', result))
      .catch((emailErr) => console.error('[Registration] Failed to send welcome email:', emailErr.message));
  } catch (err) {
    console.error('[Registration] Error details:', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      code: err.code
    });
    
    // Handle specific MongoDB errors
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue)[0];
      return res.status(409).json({ message: `${field} already exists.` });
    }
    
    if (err.name === 'ValidationError') {
      const field = Object.keys(err.errors)[0];
      return res.status(400).json({ message: `${field} is required or invalid.` });
    }
    
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);
    user.refreshToken = await bcrypt.hash(refreshToken, 10);
    await user.save();

    setRefreshCookie(res, refreshToken);
    return res.json({ user, accessToken });
  } catch (err) {
    console.error('Login error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function refreshToken(req, res) {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) return res.status(401).json({ message: 'No refresh token.' });

    let payload;
    try {
      payload = jwt.verify(token, refreshSecret);
    } catch (err) {
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    const user = await User.findById(payload.sub);
    if (!user || !user.refreshToken) {
      return res.status(401).json({ message: 'Refresh token not recognized.' });
    }

    const matches = await bcrypt.compare(token, user.refreshToken);
    if (!matches) {
      return res.status(401).json({ message: 'Refresh token mismatch.' });
    }

    const accessToken = signAccessToken(user);
    const newRefresh = signRefreshToken(user);
    user.refreshToken = await bcrypt.hash(newRefresh, 10);
    await user.save();
    setRefreshCookie(res, newRefresh);

    return res.json({ user, accessToken });
  } catch (err) {
    console.error('Refresh error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function logout(req, res) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      try {
        const payload = jwt.verify(token, refreshSecret);
        const user = await User.findById(payload.sub);
        if (user) {
          user.refreshToken = null;
          await user.save();
        }
      } catch (_) {
        // ignore token errors on logout
      }
    }

    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/'
    });
    return res.json({ message: 'Logged out' });
  } catch (err) {
    console.error('Logout error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function verify(req, res) {
  // `req.user` is set by auth middleware
  return res.json({ user: req.user });
}

export async function updateProfile(req, res) {
  try {
    const userId = req.user.id;
    const { name, employeeId, companyName, highestQualificationDegree, specialization, cgpaOrPercentage, passoutYear } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Update allowed fields
    if (name !== undefined) user.name = name;
    if (employeeId !== undefined) user.employeeId = employeeId;
    if (companyName !== undefined) user.companyName = companyName;
    if (highestQualificationDegree !== undefined) user.highestQualificationDegree = highestQualificationDegree;
    if (specialization !== undefined) user.specialization = specialization;
    if (cgpaOrPercentage !== undefined) user.cgpaOrPercentage = cgpaOrPercentage;
    if (passoutYear !== undefined) user.passoutYear = passoutYear;

    await user.save();

    return res.json({ user, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}

export async function deleteAccount(req, res) {
  try {
    const userId = req.user.id;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Delete all resumes/applications associated with this candidate
    const Resume = (await import('../models/Resume.js')).default;
    await Resume.deleteMany({ candidateId: userId });

    // Delete the user account
    await User.findByIdAndDelete(userId);

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/'
    });

    return res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('Delete account error', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
}