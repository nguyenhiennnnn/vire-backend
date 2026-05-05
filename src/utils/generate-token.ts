import jwt from "jsonwebtoken";

export type AccessTokenPayload = {
  id: string;
  email: string;
  username: string;
};

export type RefreshTokenPayload = {
  id: string;
};

export type ResetTokenPayload = {
  id: string;
  purpose: "reset_password";
};

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET!, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES ?? "15m",
  } as jwt.SignOptions);

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES ?? "30d",
  } as jwt.SignOptions);

export const signResetToken = (payload: ResetTokenPayload): string =>
  jwt.sign(payload, process.env.JWT_RESET_SECRET!, {
    expiresIn: process.env.JWT_RESET_EXPIRES ?? "10m",
  } as jwt.SignOptions);

export const verifyAccessToken = (token: string): AccessTokenPayload =>
  jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as AccessTokenPayload;

export const verifyRefreshToken = (token: string): RefreshTokenPayload =>
  jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as RefreshTokenPayload;

export const verifyResetToken = (token: string): ResetTokenPayload =>
  jwt.verify(token, process.env.JWT_RESET_SECRET!) as ResetTokenPayload;
