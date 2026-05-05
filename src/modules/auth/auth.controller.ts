import { Request, Response, NextFunction } from "express";
import * as authService from "./auth.service";
import {
  registerDto,
  loginDto,
  resendVerifyDto,
  forgotPasswordDto,
  verifyOtpDto,
  resetPasswordDto,
  changePasswordDto,
} from "./auth.dto";
import { AuthRequest } from "../../middlewares/auth.middleware";
import passport from "../../lib/passport";

const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "none" as const,
  maxAge: REFRESH_MAX_AGE_MS,
};

export const register = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = registerDto.parse(req.body);
    const result = await authService.register(data);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const token = req.query.token as string;
    const result = await authService.verifyEmail(token);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const resendVerify = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = resendVerifyDto.parse(req.body);
    const result = await authService.resendVerify(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = loginDto.parse(req.body);
    const { accessToken, refreshToken, user } = await authService.login(
      email,
      password,
    );
    res.cookie("refreshToken", refreshToken, cookieOptions);
    res.json({ accessToken, user });
  } catch (err) {
    next(err);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const refreshToken = req.cookies?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Không có refresh token" },
      });
      return;
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await authService.refresh(refreshToken);

    res.cookie("refreshToken", newRefreshToken, cookieOptions);
    res.json({ accessToken });
  } catch (err) {
    next(err);
  }
};

export const logout = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await authService.logout(req.user!.id);
    res.clearCookie("refreshToken");
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const forgotPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email } = forgotPasswordDto.parse(req.body);
    const result = await authService.forgotPassword(email);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const verifyOtp = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, code } = verifyOtpDto.parse(req.body);
    const result = await authService.verifyOtp(email, code);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { resetToken, newPassword } = resetPasswordDto.parse(req.body);
    const result = await authService.resetPassword(resetToken, newPassword);
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const changePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { currentPassword, newPassword } = changePasswordDto.parse(req.body);
    const result = await authService.changePassword(
      req.user!.id,
      currentPassword,
      newPassword,
    );
    res.clearCookie("refreshToken");
    res.json(result);
  } catch (err) {
    next(err);
  }
};

export const googleAuth = passport.authenticate("google", {
  scope: ["profile", "email"],
  session: false,
});

export const googleCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  passport.authenticate(
    "google",
    {
      session: false,
      failureRedirect: `${process.env.CLIENT_URL}/login?error=google`,
    },
    async (err: Error | null, user: any) => {
      if (err || !user)
        return res.redirect(`${process.env.CLIENT_URL}/login?error=google`);
      try {
        const { accessToken, refreshToken } = await authService.googleLogin(
          user.id,
        );
        res.cookie("refreshToken", refreshToken, cookieOptions);
        res.cookie("oauthToken", accessToken, {
          httpOnly: false,
          maxAge: 60 * 1000,
          sameSite: "none",
          secure: process.env.NODE_ENV !== "development",
        });
        res.redirect(
          `${process.env.CLIENT_URL}/oauth/callback?token=${accessToken}`,
        );
      } catch (e) {
        next(e);
      }
    },
  )(req, res, next);
};
