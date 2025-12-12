import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email: string;
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
};

const getJwtRefreshSecret = (): string => {
  const secret = process.env.JWT_REFRESH_SECRET;
  if (!secret) throw new Error('JWT_REFRESH_SECRET not configured');
  return secret;
};

export const generateAccessToken = (payload: TokenPayload): string => {
  const expiresIn = process.env.JWT_EXPIRES_IN || '15m';
  return jwt.sign(payload, getJwtSecret(), { expiresIn });
};

export const generateRefreshToken = (payload: TokenPayload): string => {
  const expiresIn = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
  return jwt.sign(payload, getJwtRefreshSecret(), { expiresIn });
};

export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtSecret()) as TokenPayload;
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, getJwtRefreshSecret()) as TokenPayload;
};
