import { FriendStatus } from "../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import {
  uploadStream,
  deleteResource,
  deleteManyResources,
  extractPublicId,
} from "../../services/cloudinary.service";
import { AppError } from "../../utils/app-error";
import { forceDisconnectUser, getSocketInstance } from "../../socket";

const USER_PUBLIC_SELECT = {
  id: true,
  username: true,
  email: true,
  avatar: true,
  coverPhoto: true,
  bio: true,
  isVerified: true,
  isActive: true,
  friendsCount: true,
  followersCount: true,
  followingCount: true,
  createdAt: true,
  updatedAt: true,
  googleId: true,
};

// ─── Shared: determine friendship status ─────────────────
export const getFriendshipStatus = async (myId: string, targetId: string) => {
  const friendship = await prisma.friendship.findFirst({
    where: {
      OR: [
        { senderId: myId, receiverId: targetId },
        { senderId: targetId, receiverId: myId },
      ],
    },
  });

  if (!friendship) return "none";
  if (friendship.status === FriendStatus.ACCEPTED) return "accepted";
  if (friendship.status === FriendStatus.PENDING) {
    return friendship.senderId === myId ? "pending_sent" : "pending_received";
  }
  if (friendship.status === FriendStatus.BLOCKED) {
    return friendship.senderId === myId ? "blocked" : "blocked_by";
  }
  return "none";
};

const getUserRelatedCounts = async (userId: string) => {
  const [friendships, following, followers] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        status: FriendStatus.ACCEPTED,
      },
      select: { senderId: true, receiverId: true },
    }),
    prisma.follower.findMany({
      where: { followerId: userId },
      select: { followingId: true },
    }),
    prisma.follower.findMany({
      where: { followingId: userId },
      select: { followerId: true },
    }),
  ]);

  return {
    friendIds: friendships.map((f) =>
      f.senderId === userId ? f.receiverId : f.senderId,
    ),
    followingIds: following.map((f) => f.followingId),
    followerIds: followers.map((f) => f.followerId),
  };
};

// ─── Get me ───────────────────────────────────────────────
export const getMe = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: USER_PUBLIC_SELECT,
  });
  if (!user) throw new AppError(404, "Người dùng không tồn tại");
  return { user };
};

// ─── Update me ────────────────────────────────────────────
export const updateMe = async (
  userId: string,
  data: { username?: string; bio?: string },
) => {
  if (data.username) {
    const existing = await prisma.user.findFirst({
      where: { username: data.username, NOT: { id: userId } },
    });
    if (existing) throw new AppError(409, "Username đã được sử dụng");
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: USER_PUBLIC_SELECT,
  });
  return { user };
};

// ─── Update avatar ────────────────────────────────────────
export const updateAvatar = async (
  userId: string,
  file: Express.Multer.File,
) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { avatar: true },
  });

  const { url } = await uploadStream(file.buffer, {
    folder: "avatars",
    transformation: [{ width: 400, height: 400, crop: "fill" }],
  });

  if (current?.avatar) {
    const publicId = extractPublicId(current.avatar);
    if (publicId) await deleteResource(publicId).catch(() => null);
  }

  await prisma.user.update({ where: { id: userId }, data: { avatar: url } });
  return { avatarUrl: url };
};

// ─── Update cover ─────────────────────────────────────────
export const updateCover = async (
  userId: string,
  file: Express.Multer.File,
) => {
  const current = await prisma.user.findUnique({
    where: { id: userId },
    select: { coverPhoto: true },
  });

  const { url } = await uploadStream(file.buffer, {
    folder: "covers",
    transformation: [{ width: 1200, height: 400, crop: "fill" }],
  });

  if (current?.coverPhoto) {
    const publicId = extractPublicId(current.coverPhoto);
    if (publicId) await deleteResource(publicId).catch(() => null);
  }

  await prisma.user.update({
    where: { id: userId },
    data: { coverPhoto: url },
  });
  return { coverUrl: url };
};

// ─── Deactivate ───────────────────────────────────────────
export const deactivate = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, isActive: true },
  });
  if (!user) throw new AppError(404, "Người dùng không tồn tại");
  if (!user.isActive)
    throw new AppError(400, "Tài khoản đã bị vô hiệu hoá rồi");

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    }),
    prisma.userToken.deleteMany({ where: { userId } }),
  ]);

  forceDisconnectUser(userId);

  return { message: "Tài khoản đã được vô hiệu hoá" };
};

// ─── Delete account ───────────────────────────────────────
export const deleteAccount = async (userId: string) => {
  const [posts, stories, user, { friendIds, followingIds, followerIds }] =
    await Promise.all([
      prisma.post.findMany({ where: { userId }, select: { mediaUrls: true } }),
      prisma.story.findMany({ where: { userId }, select: { mediaUrl: true } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { avatar: true, coverPhoto: true },
      }),
      getUserRelatedCounts(userId),
    ]);

  // Gom tất cả publicIds cần xoá
  const allUrls: string[] = [];
  posts.forEach((p) => allUrls.push(...p.mediaUrls));
  stories.forEach((s) => allUrls.push(s.mediaUrl));
  if (user?.avatar) allUrls.push(user.avatar);
  if (user?.coverPhoto) allUrls.push(user.coverPhoto);
  if (allUrls.length) await deleteManyResources(allUrls).catch(() => null);

  await prisma.$transaction([
    ...(friendIds.length > 0
      ? [
          prisma.user.updateMany({
            where: { id: { in: friendIds } },
            data: { friendsCount: { decrement: 1 } },
          }),
        ]
      : []),
    ...(followingIds.length > 0
      ? [
          prisma.user.updateMany({
            where: { id: { in: followingIds } },
            data: { followersCount: { decrement: 1 } },
          }),
        ]
      : []),
    ...(followerIds.length > 0
      ? [
          prisma.user.updateMany({
            where: { id: { in: followerIds } },
            data: { followingCount: { decrement: 1 } },
          }),
        ]
      : []),
    prisma.user.delete({ where: { id: userId } }),
  ]);

  forceDisconnectUser(userId);

  return { message: "Tài khoản đã được xoá vĩnh viễn" };
};

// ─── Get user profile ─────────────────────────────────────
export const getUserProfile = async (targetId: string, myId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: USER_PUBLIC_SELECT,
  });
  if (!user || !user.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

  const [friendshipStatus, followerRecord] = await Promise.all([
    getFriendshipStatus(myId, targetId),
    prisma.follower.findUnique({
      where: {
        followerId_followingId: { followerId: myId, followingId: targetId },
      },
    }),
  ]);

  return { user, friendshipStatus, isFollowing: !!followerRecord };
};

// ─── Search users ─────────────────────────────────────────
export const searchUsers = async (q: string, myId: string) => {
  const users = await prisma.user.findMany({
    where: {
      username: { contains: q, mode: "insensitive" },
      isActive: true,
      NOT: { id: myId },
    },
    take: 20,
    select: USER_PUBLIC_SELECT,
  });

  // Batch fetch friendship status
  const withStatus = await Promise.all(
    users.map(async (u) => ({
      ...u,
      friendshipStatus: await getFriendshipStatus(myId, u.id),
    })),
  );

  return { users: withStatus };
};

export const getUserByUsername = async (username: string, myId: string) => {
  const user = await prisma.user.findUnique({
    where: { username },
    select: USER_PUBLIC_SELECT,
  });
  if (!user || !user.isActive)
    throw new AppError(404, "Người dùng không tồn tại");

  const [friendshipStatus, followerRecord] = await Promise.all([
    getFriendshipStatus(myId, user.id),
    prisma.follower.findUnique({
      where: {
        followerId_followingId: { followerId: myId, followingId: user.id },
      },
    }),
  ]);

  return { user, friendshipStatus, isFollowing: !!followerRecord };
};
