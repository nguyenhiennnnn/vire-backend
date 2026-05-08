import { FriendStatus, MediaType } from "../../prisma/generated/prisma/enums";
import { prisma } from "../../lib/prisma";
import {
  uploadStream,
  deleteResource,
  extractPublicId,
} from "../../services/cloudinary.service";
import { decodeCursor, encodeCursor } from "../../utils/cursor";
import { AppError } from "../../utils/app-error";
import { safeEmit } from "../../socket";

const getStoryAudienceIds = async (userId: string): Promise<string[]> => {
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
  return friendships.map((f) =>
    f.senderId === userId ? f.receiverId : f.senderId,
  );
};

export const createStory = async (
  userId: string,
  file: Express.Multer.File,
  caption?: string,
) => {
  const mediaType: MediaType = file.mimetype.startsWith("video/")
    ? MediaType.VIDEO
    : MediaType.IMAGE;

  const uploadOptions =
    mediaType === MediaType.VIDEO
      ? { folder: "stories", resourceType: "video" as const }
      : {
          folder: "stories",
          transformation: [
            { width: 1080, height: 1920, crop: "limit" as const },
          ],
        };

  const { url } = await uploadStream(file.buffer, uploadOptions);

  const story = await prisma.story.create({
    data: {
      userId,
      mediaUrl: url,
      mediaType,
      caption: caption?.slice(0, 200),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
    include: { user: { select: { id: true, username: true, avatar: true } } },
  });

  const storyPayload = {
    id: story.id,
    userId: story.userId,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    caption: story.caption,
    expiresAt: story.expiresAt,
    createdAt: story.createdAt,
    user: story.user,
  };

  safeEmit(`user:${userId}`, "story:you_created", { story: storyPayload });

  const friendIds = await getStoryAudienceIds(userId);
  for (const friendId of friendIds) {
    safeEmit(`user:${friendId}`, "story:new", { story: storyPayload });
  }

  return { ok: true, story };
};

export const getFeedStories = async (userId: string) => {
  const friendships = await prisma.friendship.findMany({
    where: {
      OR: [
        { senderId: userId, receiver: { isActive: true } },
        { receiverId: userId, sender: { isActive: true } },
      ],
      status: FriendStatus.ACCEPTED,
    },
  });
  const friendIds = friendships.map((f) =>
    f.senderId === userId ? f.receiverId : f.senderId,
  );

  const allUserIds = [...friendIds, userId];

  const stories = await prisma.story.findMany({
    where: {
      userId: { in: allUserIds },
      expiresAt: { gt: new Date() },
      user: { isActive: true },
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, username: true, avatar: true } },
      views: { where: { viewerId: userId }, select: { viewerId: true } },
      _count: { select: { views: true } },
    },
  });

  const groupMap = new Map<
    string,
    {
      user: (typeof stories)[number]["user"];
      stories: typeof stories;
      hasUnread: boolean;
    }
  >();

  for (const story of stories) {
    const key = story.userId;
    if (!groupMap.has(key)) {
      groupMap.set(key, { user: story.user, stories: [], hasUnread: false });
    }
    const group = groupMap.get(key)!;
    group.stories.push(story);
    if (!story.views.length) group.hasUnread = true;
  }

  let storyGroups = Array.from(groupMap.values());

  storyGroups = storyGroups.sort((a, b) => {
    if (a.user.id === userId) return -1;
    if (b.user.id === userId) return 1;
    return Number(b.hasUnread) - Number(a.hasUnread);
  });

  return { storyGroups };
};

export const getMyStories = async (
  userId: string,
  cursor?: string,
  limit = 20,
) => {
  let cursorCondition = {};
  if (cursor) {
    const { field, id } = decodeCursor(cursor);
    cursorCondition = {
      OR: [
        { createdAt: { lt: new Date(field) } },
        { createdAt: new Date(field), id: { lt: id } },
      ],
    };
  }

  const now = new Date();

  const stories = await prisma.story.findMany({
    where: { userId, ...cursorCondition },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    include: { _count: { select: { views: true } } },
  });

  const hasMore = stories.length > limit;
  const data = (hasMore ? stories.slice(0, limit) : stories).map((s) => ({
    ...s,
    isExpired: s.expiresAt <= now,
    viewsCount: s._count.views,
  }));

  const lastItem = data[data.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor({
          field: lastItem.createdAt.toISOString(),
          id: lastItem.id,
        })
      : null;

  return { data, nextCursor, hasMore };
};

export const getActiveStories = async (targetId: string, myId: string) => {
  const target = await prisma.user.findUnique({
    where: { id: targetId, isActive: true },
  });
  if (!target) throw new AppError(404, "Người dùng không tồn tại");

  if (myId !== targetId) {
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: myId, receiverId: targetId },
          { senderId: targetId, receiverId: myId },
        ],
        status: FriendStatus.ACCEPTED,
      },
    });
    if (!friendship) throw new AppError(403, "Chỉ bạn bè mới xem được story");
  }

  const stories = await prisma.story.findMany({
    where: { userId: targetId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    include: {
      views: { where: { viewerId: myId }, select: { viewerId: true } },
    },
  });

  return {
    stories: stories.map((s) => ({ ...s, isViewed: s.views.length > 0 })),
  };
};

export const recordView = async (storyId: string, viewerId: string) => {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) throw new AppError(404, "Story không tồn tại");
  if (story.expiresAt <= new Date())
    throw new AppError(410, "Story đã hết hạn");

  if (story.userId === viewerId) return { ok: true };

  await prisma.storyView.upsert({
    where: { storyId_viewerId: { storyId, viewerId } },
    create: { storyId, viewerId },
    update: {},
  });

  const viewer = await prisma.user.findUnique({
    where: { id: viewerId },
    select: { id: true, username: true, avatar: true },
  });

  safeEmit(`user:${story.userId}`, "story:viewed", {
    storyId,
    viewer,
    viewedAt: new Date().toISOString(),
  });

  return { ok: true };
};

export const getViewers = async (storyId: string, userId: string) => {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) throw new AppError(404, "Story không tồn tại");
  if (story.userId !== userId)
    throw new AppError(403, "Chỉ chủ story mới xem được danh sách người xem");

  const views = await prisma.storyView.findMany({
    where: { storyId, viewer: { isActive: true } },
    orderBy: { viewedAt: "desc" },
    include: {
      viewer: { select: { id: true, username: true, avatar: true } },
    },
  });

  return {
    viewers: views.map((v) => ({ user: v.viewer, viewedAt: v.viewedAt })),
    totalViews: views.length,
  };
};

export const deleteStory = async (storyId: string, userId: string) => {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) throw new AppError(404, "Story không tồn tại");
  if (story.userId !== userId)
    throw new AppError(403, "Không có quyền xoá story này");

  const publicId = extractPublicId(story.mediaUrl);
  if (publicId) {
    await deleteResource(
      publicId,
      story.mediaType === "VIDEO" ? "video" : "image",
    ).catch(() => null);
  }

  await prisma.story.delete({ where: { id: storyId } });

  safeEmit(`story:${storyId}`, "story:deleted", { storyId });
  safeEmit(`user:${userId}`, "story:you_deleted", { storyId });

  const friendIds = await getStoryAudienceIds(userId);
  for (const friendId of friendIds) {
    safeEmit(`user:${friendId}`, "story:removed_from_tray", {
      storyId,
      userId,
    });
  }

  return { ok: true };
};

export const emitStoryExpired = async (
  storyId: string,
  ownerId: string,
): Promise<void> => {
  safeEmit(`user:${ownerId}`, "story:expired", { storyId });
  safeEmit(`story:${storyId}`, "story:deleted", { storyId });
};
