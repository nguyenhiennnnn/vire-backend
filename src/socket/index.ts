import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/generate-token";

let ioInstance: Server | null = null;

export const initSocket = (server: import("http").Server): Server => {
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });

  io.use((socket: Socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error("Unauthorized: no token"));
      const payload = verifyAccessToken(token);
      (socket.data as { userId: string }).userId = payload.id;
      next();
    } catch {
      next(new Error("Unauthorized: invalid token"));
    }
  });

  io.on("connection", async (socket: Socket) => {
    const userId = (socket.data as { userId: string }).userId;

    socket.on("disconnect", () => {});
  });

  ioInstance = io;
  return io;
};

export const getSocketInstance = (): Server => {
  if (!ioInstance) throw new Error("Socket not initialized");
  return ioInstance;
};
