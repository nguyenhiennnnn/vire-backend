import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
  .regex(/[A-Z]/, "Mật khẩu phải có ít nhất 1 chữ hoa")
  .regex(/[0-9]/, "Mật khẩu phải có ít nhất 1 chữ số");

export const registerDto = z.object({
  username: z
    .string()
    .min(3, "Username tối thiểu 3 ký tự")
    .max(20, "Username tối đa 20 ký tự")
    .regex(/^[a-zA-Z0-9_]+$/, "Username chỉ được chứa chữ cái, số và _"),
  email: z.string().email("Email không hợp lệ"),
  password: passwordSchema,
});

export const loginDto = z.object({
  email: z.string().email("Email không hợp lệ"),
  password: z.string().min(1, "Mật khẩu không được rỗng"),
});

export const resendVerifyDto = z.object({
  email: z.string().email("Email không hợp lệ"),
});

export const forgotPasswordDto = z.object({
  email: z.string().email("Email không hợp lệ"),
});

export const verifyOtpDto = z.object({
  email: z.string().email("Email không hợp lệ"),
  code: z
    .string()
    .length(6, "Mã OTP phải có đúng 6 ký tự")
    .regex(/^\d+$/, "Mã OTP chỉ gồm số"),
});

export const resetPasswordDto = z.object({
  resetToken: z.string().min(1),
  newPassword: passwordSchema,
});

export const changePasswordDto = z.object({
  currentPassword: z.string().min(1, "Mật khẩu hiện tại không được rỗng"),
  newPassword: passwordSchema,
});
