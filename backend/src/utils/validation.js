/**
 * Input Validation and Sanitization Utilities
 * Fixes security flaws and ensures data integrity
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize text input to prevent XSS and injection attacks
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // Remove HTML tags and scripts
  const cleanText = DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  });
  
  // Remove control characters and excessive whitespace
  return cleanText
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Validate resume text quality
 */
export function validateResumeText(text) {
  if (!text || typeof text !== 'string') {
    return {
      valid: false,
      error: 'Resume text is required and must be a string'
    };
  }
  
  const cleanText = sanitizeText(text);
  
  if (cleanText.length < 100) {
    return {
      valid: false,
      error: 'Resume text is too short (minimum 100 characters required)'
    };
  }
  
  if (cleanText.length > 50000) {
    return {
      valid: false,
      error: 'Resume text is too long (maximum 50,000 characters allowed)'
    };
  }
  
  // Check for meaningful content (not just random characters)
  const wordCount = cleanText.split(/\s+/).length;
  if (wordCount < 20) {
    return {
      valid: false,
      error: 'Resume text appears to be insufficient content'
    };
  }
  
  return {
    valid: true,
    sanitizedText: cleanText
  };
}

/**
 * Validate job description
 */
export function validateJobDescription(description) {
  if (!description || typeof description !== 'string') {
    return {
      valid: false,
      error: 'Job description is required and must be a string'
    };
  }
  
  const cleanText = sanitizeText(description);
  
  if (cleanText.length < 50) {
    return {
      valid: false,
      error: 'Job description is too short (minimum 50 characters required)'
    };
  }
  
  if (cleanText.length > 10000) {
    return {
      valid: false,
      error: 'Job description is too long (maximum 10,000 characters allowed)'
    };
  }
  
  return {
    valid: true,
    sanitizedText: cleanText
  };
}

/**
 * Validate email format
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true, sanitizedEmail: email.toLowerCase().trim() };
}

/**
 * Validate MongoDB ObjectId
 */
export function validateObjectId(id) {
  if (!id || typeof id !== 'string') {
    return { valid: false, error: 'ID is required and must be a string' };
  }
  
  const objectIdRegex = /^[0-9a-fA-F]{24}$/;
  if (!objectIdRegex.test(id)) {
    return { valid: false, error: 'Invalid ID format' };
  }
  
  return { valid: true, sanitizedId: id };
}

/**
 * Validate score range
 */
export function validateScore(score) {
  const numScore = parseFloat(score);
  
  if (isNaN(numScore)) {
    return { valid: false, error: 'Score must be a number' };
  }
  
  if (numScore < 0 || numScore > 100) {
    return { valid: false, error: 'Score must be between 0 and 100' };
  }
  
  return { valid: true, sanitizedScore: numScore };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(page = 1, limit = 50) {
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  
  if (isNaN(pageNum) || pageNum < 1) {
    return { valid: false, error: 'Page must be a positive integer' };
  }
  
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    return { valid: false, error: 'Limit must be between 1 and 100' };
  }
  
  return {
    valid: true,
    sanitizedPage: pageNum,
    sanitizedLimit: limitNum
  };
}

/**
 * Sanitize and validate file name
 */
export function sanitizeFileName(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'File name is required' };
  }
  
  // Remove path traversal attempts and dangerous characters
  const cleanName = fileName
    .replace(/\.\./g, '') // Remove path traversal
    .replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
    .replace(/^\.+/, '') // Remove leading dots
    .trim();
  
  if (cleanName.length === 0) {
    return { valid: false, error: 'Invalid file name' };
  }
  
  if (cleanName.length > 255) {
    return { valid: false, error: 'File name is too long' };
  }
  
  return { valid: true, sanitizedFileName: cleanName };
}

/**
 * Validate and sanitize skills array
 */
export function validateSkills(skills) {
  if (!Array.isArray(skills)) {
    return { valid: false, error: 'Skills must be an array' };
  }
  
  if (skills.length > 50) {
    return { valid: false, error: 'Too many skills (maximum 50 allowed)' };
  }
  
  const sanitizedSkills = skills
    .filter(skill => skill && typeof skill === 'string')
    .map(skill => sanitizeText(skill))
    .filter(skill => skill.length > 0 && skill.length <= 50)
    .slice(0, 50); // Ensure max 50 skills
  
  return {
    valid: true,
    sanitizedSkills: [...new Set(sanitizedSkills)] // Remove duplicates
  };
}

export default {
  sanitizeText,
  validateResumeText,
  validateJobDescription,
  validateEmail,
  validateObjectId,
  validateScore,
  validatePagination,
  sanitizeFileName,
  validateSkills
};
