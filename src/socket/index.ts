import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/generate-token";
import { prisma } from "../lib/prisma";
import { FriendStatus } from "../prisma/generated/prisma/enums";

let ioInstance: Server | null = null;

const onlineUsers: Set<string> = new Set<string>();

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

    socket.join(`user:${userId}`);
    onlineUsers.add(userId);

    try {
      const friendships = await prisma.friendship.findMany({
        where: {
          OR: [
            { senderId: userId, receiver: { isActive: true } },
            { receiverId: userId, sender: { isActive: true } },
          ],
          status: FriendStatus.ACCEPTED,
        },
        select: { senderId: true, receiverId: true },
      });

      const friendIds = friendships.map((f) =>
        f.senderId === userId ? f.receiverId : f.senderId,
      );

      const onlineFriendIds = friendIds.filter((id) => onlineUsers.has(id));
      socket.emit("friends:online", onlineFriendIds);

      for (const friendId of friendIds) {
        io.to(`user:${friendId}`).emit("friend:online", {
          userId,
          timestamp: new Date().toISOString(),
        });
      }
    } catch {}

    socket.on("post:join", (postId: string) => {
      socket.join(`post:${postId}`);
    });

    socket.on("post:leave", (postId: string) => {
      socket.leave(`post:${postId}`);
    });

    socket.on("story:join", (storyId: string) => {
      socket.join(`story:${storyId}`);
    });

    socket.on("story:leave", (storyId: string) => {
      socket.leave(`story:${storyId}`);
    });

    socket.on("disconnect", async () => {
      onlineUsers.delete(userId);

      try {
        const friendships = await prisma.friendship.findMany({
          where: {
            OR: [
              { senderId: userId, receiver: { isActive: true } },
              { receiverId: userId, sender: { isActive: true } },
            ],
            status: FriendStatus.ACCEPTED,
          },
          select: { senderId: true, receiverId: true },
        });

        const friendIds = friendships.map((f) =>
          f.senderId === userId ? f.receiverId : f.senderId,
        );

        for (const friendId of friendIds) {
          io.to(`user:${friendId}`).emit("friend:offline", {
            userId,
            lastSeen: new Date().toISOString(),
          });
        }
      } catch {}
    });
  });

  ioInstance = io;
  return io;
};

export const getSocketInstance = (): Server => {
  if (!ioInstance) throw new Error("Socket not initialized");
  return ioInstance;
};

export const safeEmit = (
  room: string,
  event: string,
  payload: unknown,
): void => {
  try {
    getSocketInstance().to(room).emit(event, payload);
  } catch {}
};

export const getOnlineUsers = (): Set<string> => onlineUsers;
