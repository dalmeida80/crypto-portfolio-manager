import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';

export interface AuthRequest extends Request {
  userId?: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    console.log('[Auth] Token decoded:', JSON.stringify(decoded));
    console.log('[Auth] decoded.userId type:', typeof decoded.userId);
    console.log('[Auth] decoded.userId value:', decoded.userId);

    if (!decoded) {
      return res.status(401).json({ message: 'Invalid token' });
    }

    req.userId = decoded.userId;
    console.log('[Auth] req.userId set to:', req.userId, 'type:', typeof req.userId);
    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    return res.status(401).json({ message: 'Authentication failed' });
  }
};
