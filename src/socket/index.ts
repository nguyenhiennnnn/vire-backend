import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/generate-token";
import { prisma } from "../lib/prisma";

let ioInstance: Server | null = null;

const onlineUsers = new Map<string, Set<string>>();

async function getRelatedUserIds(userId: string): Promise<string[]> {
  const [friendships, followers, following] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: "ACCEPTED",
      },
      select: { senderId: true, receiverId: true },
    }),
    prisma.follower.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    }),
    prisma.follower.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
  ]);

  const ids = new Set<string>();
  for (const f of friendships) {
    ids.add(f.senderId === userId ? f.receiverId : f.senderId);
  }
  for (const f of followers) ids.add(f.followerId);
  for (const f of following) ids.add(f.followingId);
  ids.delete(userId);
  return [...ids];
}

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

    console.log("Connected: " + userId);
    
    socket.join(`user:${userId}`);

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId)!.add(socket.id);

    const relatedIds = await getRelatedUserIds(userId);
    for (const id of relatedIds) {
      socket.join(`presence:${id}`);
    }

    io.to(`presence:${userId}`).emit("user:online", { userId });

    socket.on("join_post", (postId: string) => socket.join(`post:${postId}`));
    socket.on("leave_post", (postId: string) => socket.leave(`post:${postId}`));
    socket.on("join_story", (storyId: string) =>
      socket.join(`story:${storyId}`),
    );
    socket.on("leave_story", (storyId: string) =>
      socket.leave(`story:${storyId}`),
    );

    socket.on(
      "presence:check",
      (userIds: string[], callback: (result: string[]) => void) => {
        if (typeof callback !== "function") return;
        const online = userIds.filter(
          (id) => onlineUsers.has(id) && onlineUsers.get(id)!.size > 0,
        );
        callback(online);
      },
    );

    socket.on("disconnect", () => {
      const sockets = onlineUsers.get(userId);
      if (!sockets) return;
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        onlineUsers.delete(userId);
        io.to(`presence:${userId}`).emit("user:offline", { userId });
      }
    });
  });

  ioInstance = io;
  return io;
};

export const getSocketInstance = (): Server => {
  if (!ioInstance) throw new Error("Socket not initialized");
  return ioInstance;
};

export const forceDisconnectUser = (userId: string) => {
  if (!ioInstance) return;
  onlineUsers.delete(userId);
  ioInstance.to(`user:${userId}`).disconnectSockets(true);
  ioInstance.to(`presence:${userId}`).emit("user:offline", { userId });
};
