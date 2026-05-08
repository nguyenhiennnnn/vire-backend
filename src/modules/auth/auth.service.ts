import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { prisma } from "../../lib/prisma";
import { sendVerifyEmail, sendOtpEmail } from "../../services/mail.service";
import {
  signAccessToken,
  signRefreshToken,
  signResetToken,
  verifyResetToken,
} from "../../utils/generate-token";
import { generateOtp } from "../..//utils/generate-otp";
import { AppError } from "../../utils/app-error";

const SALT_ROUNDS = 12;
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const omitPassword = <T extends { password: string | null }>(user: T) => {
  const { password: _, ...rest } = user;
  return rest;
};

export const register = async (data: {
  username: string;
  email: string;
  password: string;
}) => {
  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existingEmail) throw new AppError(409, "Email đã được sử dụng");

  const existingUsername = await prisma.user.findUnique({
    where: { username: data.username },
  });
  if (existingUsername) throw new AppError(409, "Username đã được sử dụng");

  const hashed = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      username: data.username,
      email: data.email.toLowerCase(),
      password: hashed,
      isVerified: false,
      isActive: true,
    },
  });

  const verification = await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await sendVerifyEmail(user.email, verification.token);

  return { message: "Kiểm tra email của bạn để xác thực tài khoản" };
};

export const verifyEmail = async (token: string) => {
  if (!token) throw new AppError(400, "Token không hợp lệ");

  const verification = await prisma.emailVerification.findUnique({
    where: { token },
  });
  if (!verification) throw new AppError(400, "Token không tồn tại");
  if (verification.isUsed) throw new AppError(400, "Token đã được sử dụng");
  if (verification.expiresAt < new Date())
    throw new AppError(400, "Token đã hết hạn, vui lòng gửi lại email");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: verification.userId },
      data: { isVerified: true },
    }),
    prisma.emailVerification.update({
      where: { id: verification.id },
      data: { isUsed: true },
    }),
  ]);

  return { message: "Email đã được xác thực thành công" };
};

export const resendVerify = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: "Email xác thực đã được gửi lại" };

  if (user.isVerified) throw new AppError(400, "Email đã được xác thực rồi");

  const verification = await prisma.emailVerification.create({
    data: {
      userId: user.id,
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await sendVerifyEmail(user.email, verification.token);

  return { message: "Email xác thực đã được gửi lại" };
};

export const login = async (email: string, password: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(401, "Email hoặc mật khẩu không đúng");

  if (!user.isActive) {
    await prisma.user.update({
      where: { id: user.id },
      data: { isActive: true },
    });
    user.isActive = true;
  }

  if (!user.isVerified)
    throw new AppError(403, "Tài khoản chưa xác thực email");

  const valid = await bcrypt.compare(password, user.password!);
  if (!valid) throw new AppError(401, "Email hoặc mật khẩu không đúng");

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
  });
  const refreshToken = signRefreshToken({ id: user.id });

  await prisma.userToken.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    },
    update: {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    },
  });

  return { accessToken, refreshToken, user: omitPassword(user) };
};

export const refresh = async (refreshToken: string) => {
  const stored = await prisma.userToken.findUnique({ where: { refreshToken } });

  if (!stored) {
    throw new AppError(401, "Token không hợp lệ hoặc đã được sử dụng");
  }

  if (stored.refreshExpiresAt < new Date())
    throw new AppError(401, "Token đã hết hạn");

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.isActive)
    throw new AppError(401, "Tài khoản không hợp lệ");

  const newAccessToken = signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
  });
  const newRefreshToken = signRefreshToken({ id: user.id });

  await prisma.userToken.update({
    where: { userId: stored.userId },
    data: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    },
  });

  return { accessToken: newAccessToken, refreshToken: newRefreshToken };
};

export const logout = async (userId: string) => {
  await prisma.userToken.deleteMany({ where: { userId } });
  return { message: "Đăng xuất thành công" };
};

export const forgotPassword = async (email: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { message: "Mã OTP đã được gửi nếu email tồn tại" }; // tránh leak

  // Invalidate OTP cũ
  await prisma.otpCode.updateMany({
    where: { userId: user.id, type: "FORGOT_PASSWORD", isUsed: false },
    data: { isUsed: true },
  });

  const code = generateOtp();

  await prisma.otpCode.create({
    data: {
      userId: user.id,
      code,
      type: "FORGOT_PASSWORD",
      isUsed: false,
      attempts: 0,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    },
  });

  await sendOtpEmail(user.email, code);

  return { message: "Mã OTP đã được gửi nếu email tồn tại" };
};

export const verifyOtp = async (email: string, code: string) => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new AppError(400, "Thông tin không hợp lệ");

  const otp = await prisma.otpCode.findFirst({
    where: { userId: user.id, type: "FORGOT_PASSWORD", isUsed: false },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) throw new AppError(400, "Mã OTP không tồn tại, vui lòng gửi lại");

  if (otp.expiresAt < new Date()) {
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { isUsed: true },
    });
    throw new AppError(400, "Mã OTP đã hết hạn");
  }

  if (otp.code !== code) {
    const newAttempts = otp.attempts + 1;
    if (newAttempts >= 5) {
      await prisma.otpCode.update({
        where: { id: otp.id },
        data: { isUsed: true, attempts: newAttempts },
      });
      throw new AppError(400, "Mã OTP đã bị khoá do nhập sai quá nhiều lần");
    }
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { attempts: newAttempts },
    });
    throw new AppError(
      400,
      `Mã OTP không đúng, còn ${5 - newAttempts} lần thử`,
    );
  }

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { isUsed: true },
  });

  const resetToken = signResetToken({ id: user.id, purpose: "reset_password" });

  return { resetToken };
};

export const resetPassword = async (
  resetToken: string,
  newPassword: string,
) => {
  let payload: { id: string; purpose: string };
  try {
    payload = verifyResetToken(resetToken);
  } catch {
    throw new AppError(400, "Token không hợp lệ hoặc đã hết hạn");
  }

  if (payload.purpose !== "reset_password")
    throw new AppError(400, "Token không hợp lệ hoặc đã hết hạn");

  const user = await prisma.user.findUnique({ where: { id: payload.id } });
  if (!user || !user.isActive)
    throw new AppError(400, "Tài khoản không hợp lệ");

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
    prisma.userToken.deleteMany({ where: { userId: user.id } }),
  ]);

  return { message: "Đặt lại mật khẩu thành công" };
};

export const changePassword = async (
  userId: string,
  currentPassword: string,
  newPassword: string,
) => {
  if (currentPassword === newPassword)
    throw new AppError(400, "Mật khẩu mới phải khác mật khẩu hiện tại");

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "Người dùng không tồn tại");

  const valid = await bcrypt.compare(currentPassword, user.password!);
  if (!valid) throw new AppError(401, "Mật khẩu hiện tại không đúng");

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { password: hashed } }),
    prisma.userToken.deleteMany({ where: { userId } }),
  ]);

  return { message: "Đổi mật khẩu thành công, vui lòng đăng nhập lại" };
};

export const googleLogin = async (userId: string) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(403, "Tài khoản không hợp lệ");

  const accessToken = signAccessToken({
    id: user.id,
    email: user.email,
    username: user.username,
  });
  const refreshToken = signRefreshToken({ id: user.id });

  await prisma.userToken.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    },
    update: {
      accessToken,
      refreshToken,
      accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
      refreshExpiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS),
    },
  });

  return { accessToken, refreshToken, user: omitPassword(user) };
};
