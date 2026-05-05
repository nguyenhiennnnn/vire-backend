import "dotenv/config";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  Privacy,
  FriendStatus,
  Prisma,
} from "../generated/prisma/client";

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomItems<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Fake data ────────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  "Minh",
  "Linh",
  "Huy",
  "Lan",
  "Tuan",
  "Mai",
  "Duc",
  "Thu",
  "Nam",
  "Phuong",
  "Khanh",
  "Huong",
  "Bao",
  "Ngan",
  "Thang",
  "Yen",
  "Long",
  "Tram",
  "Quan",
  "Van",
];

const LAST_NAMES = [
  "Nguyen",
  "Tran",
  "Le",
  "Pham",
  "Hoang",
  "Phan",
  "Vu",
  "Dang",
  "Bui",
  "Do",
  "Ho",
  "Ngo",
  "Duong",
  "Ly",
];

const POST_CONTENTS = [
  "Hôm nay trời đẹp quá, ra ngoài đi dạo một chút! ☀️",
  "Vừa thử món phở bò mới ở quán quen, ngon tuyệt vời 🍜",
  "Cuối tuần rồi, ai rảnh đi cà phê không? ☕",
  "Đang học lập trình, khó quá nhưng mà vui 💻",
  "Hôm nay làm việc mệt ghê, nhưng deadline xong rồi 🎉",
  "Vừa đọc xong một cuốn sách hay, recommend cho mọi người 📚",
  "Đi du lịch Đà Lạt về, lạnh mà đẹp lắm 🌸",
  "Tập gym được 3 tháng rồi, thấy khỏe hơn nhiều 💪",
  "Xem phim mới ra hôm qua, hay lắm mọi người ơi 🎬",
  "Nấu ăn ở nhà vui hơn đi ăn ngoài nhiều 🍳",
  "Cảm ơn mọi người đã ủng hộ dự án nhỏ của mình nhé ❤️",
  "Mưa quá đi, ngồi nhà nghe nhạc thôi 🌧️",
  "Gặp lại bạn cũ hôm nay, vui như ngày xưa 😄",
  "Deadline sáng mai mà code chưa xong, cứu với 😅",
  "Vừa adopt một bé mèo nhỏ, dễ thương quá trời 🐱",
  "Trà sữa hay cà phê? Mình team cà phê 😄",
  "Hôm nay sinh nhật bạn thân, chúc mừng bạn nhé! 🎂",
  "Học tiếng Anh mỗi ngày, tiến bộ rõ thấy 📖",
  "Vừa lên phố đi bộ, đông vui lắm mọi người ơi",
  "Mua được cái áo đẹp, sale 50% luôn 🛍️",
  "Hôm nay ăn bánh mì chảo, ngon không tưởng 🥐",
  "Chiều tối ngồi ngắm hoàng hôn ở Landmark, đẹp vãi 😍",
  "Ai có gợi ý sách hay về kỹ năng sống không? 📚",
  "Vừa hoàn thành khóa học online, thấy tự hào lắm 🎓",
  "Đội bóng mình vừa thắng, tuyệt vời quá! ⚽",
  "Làm việc remote ngày nào cũng như ngày ấy, buồn cười 😂",
  "Bắt đầu thói quen đọc sách mỗi tối, ai cùng không? 🌙",
  "Ăn tối cùng gia đình, ấm cúng lắm mọi người ơi 🏠",
  "Vừa setup góc làm việc mới, ngầu hơn nhiều rồi 🖥️",
  "Sáng sớm ra hồ tập thể dục, thanh thản ghê 🌅",
];

const BIOS: (string | null)[] = [
  "Yêu lập trình và cà phê ☕",
  "Sống tốt, làm việc chăm, thích du lịch 🌍",
  "Foodie | Traveler | Dreamer",
  "Đang học để trở nên tốt hơn mỗi ngày 💪",
  "Developer ban ngày, gamer ban đêm 🎮",
  "Yêu thiên nhiên và những điều giản dị 🌿",
  "Học hỏi không bao giờ là đủ 📚",
  "Cà phê + âm nhạc = hạnh phúc 🎵",
  null,
  null,
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Bắt đầu seed dữ liệu...\n");

  // ── 1. Xoá dữ liệu cũ (theo thứ tự phụ thuộc) ────────────────────────────
  console.log("🗑️  Xoá dữ liệu cũ...");
  await prisma.notification.deleteMany();
  await prisma.storyView.deleteMany();
  await prisma.story.deleteMany();
  await prisma.follower.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.otpCode.deleteMany();
  await prisma.emailVerification.deleteMany();
  await prisma.userToken.deleteMany();
  await prisma.user.deleteMany();
  console.log("✅ Xoá xong!\n");

  // ── 2. Tạo 20 users ───────────────────────────────────────────────────────
  console.log("👤 Tạo 20 users...");
  const users: Prisma.UserGetPayload<object>[] = [];

  for (let i = 0; i < 20; i++) {
    const firstName = FIRST_NAMES[i];
    const lastName = LAST_NAMES[i % LAST_NAMES.length];
    const username = `${firstName.toLowerCase()}${lastName.toLowerCase()}${i + 1}`;
    const email = `${username}@example.com`;

    const user = await prisma.user.create({
      data: {
        username,
        email,
        // bcrypt hash của "Password@123"
        password:
          "$2b$10$K7L1OJ45/4Y2nIvhRVpCe.FSmhDdWoXehVzJptJ/op0lSsqmMy0zi",
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        coverPhoto: `https://picsum.photos/seed/${username}cover/1200/400`,
        bio: randomItem(BIOS),
        isVerified: i < 10, // 10 user đầu đã verified
        isActive: true,
        createdAt: daysAgo(randomInt(30, 365)),
      },
    });

    users.push(user);
    console.log(`  ✓ [${i + 1}/20] ${user.username}`);
  }
  console.log(`\n✅ Đã tạo ${users.length} users!\n`);

  // ── 3. Tạo 30 posts ───────────────────────────────────────────────────────
  console.log("📝 Tạo 30 posts...");
  const posts: Prisma.PostGetPayload<object>[] = [];

  for (let i = 0; i < 30; i++) {
    // Round-robin để đảm bảo mỗi user có ít nhất 1 post (20 user, 30 post)
    const user = users[i % users.length];

    // 25 post đầu PUBLIC, 5 cuối random
    const privacy =
      i < 25
        ? Privacy.PUBLIC
        : randomItem([Privacy.PUBLIC, Privacy.FRIENDS, Privacy.ONLY_ME]);

    const hasMedia = Math.random() > 0.5;
    const mediaUrls = hasMedia
      ? Array.from(
          { length: randomInt(1, 3) },
          (_, j) => `https://picsum.photos/seed/post${i}img${j}/800/600`,
        )
      : [];

    const post = await prisma.post.create({
      data: {
        userId: user.id,
        content: POST_CONTENTS[i],
        mediaUrls,
        privacy,
        createdAt: daysAgo(randomInt(0, 30)),
      },
    });

    posts.push(post);
  }
  console.log(`✅ Đã tạo ${posts.length} posts!\n`);

  // ── 4. Tạo Friendships ────────────────────────────────────────────────────
  console.log("🤝 Tạo friendships...");
  const friendshipPairs = new Set<string>();
  let friendshipCount = 0;

  for (const user of users) {
    const others = users.filter((u) => u.id !== user.id);
    const targets = randomItems(others, randomInt(3, 6));

    for (const target of targets) {
      // Đảm bảo mỗi cặp chỉ tạo 1 friendship (không duplicate)
      const pairKey = [user.id, target.id].sort().join("|");
      if (friendshipPairs.has(pairKey)) continue;
      friendshipPairs.add(pairKey);

      // Weight: ACCEPTED nhiều hơn để dữ liệu phong phú hơn
      const status = randomItem<FriendStatus>([
        FriendStatus.ACCEPTED,
        FriendStatus.ACCEPTED,
        FriendStatus.ACCEPTED,
        FriendStatus.PENDING,
        FriendStatus.REJECTED,
      ]);

      await prisma.friendship.create({
        data: {
          senderId: user.id,
          receiverId: target.id,
          status,
          createdAt: daysAgo(randomInt(0, 60)),
        },
      });

      // Cập nhật friendsCount nếu ACCEPTED
      if (status === FriendStatus.ACCEPTED) {
        await prisma.user.update({
          where: { id: user.id },
          data: { friendsCount: { increment: 1 } },
        });
        await prisma.user.update({
          where: { id: target.id },
          data: { friendsCount: { increment: 1 } },
        });
      }

      friendshipCount++;
    }
  }
  console.log(`✅ Đã tạo ${friendshipCount} friendship relationships!\n`);

  // ── 5. Tạo Followers ──────────────────────────────────────────────────────
  console.log("👥 Tạo followers...");
  const followerPairs = new Set<string>();
  let followerCount = 0;

  for (const user of users) {
    const others = users.filter((u) => u.id !== user.id);
    const targets = randomItems(others, randomInt(2, 5));

    for (const target of targets) {
      // Follow là một chiều nên không sort key
      const pairKey = `${user.id}->${target.id}`;
      if (followerPairs.has(pairKey)) continue;
      followerPairs.add(pairKey);

      await prisma.follower.create({
        data: {
          followerId: user.id,
          followingId: target.id,
          createdAt: daysAgo(randomInt(0, 60)),
        },
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { followingCount: { increment: 1 } },
      });
      await prisma.user.update({
        where: { id: target.id },
        data: { followersCount: { increment: 1 } },
      });

      followerCount++;
    }
  }
  console.log(`✅ Đã tạo ${followerCount} follower relationships!\n`);

  // ── 6. Summary ────────────────────────────────────────────────────────────
  const finalUsers = await prisma.user.findMany({
    select: {
      username: true,
      friendsCount: true,
      followersCount: true,
      followingCount: true,
    },
    orderBy: { friendsCount: "desc" },
    take: 5,
  });

  console.log("─────────────────────────────────────────────────────");
  console.log("🎉 Seed hoàn tất! Tổng kết:");
  console.log(`   👤 Users       : ${users.length}`);
  console.log(`   📝 Posts       : ${posts.length}`);
  console.log(`   🤝 Friendships : ${friendshipCount} (pairs)`);
  console.log(`   👥 Followers   : ${followerCount} (directed)`);
  console.log("─────────────────────────────────────────────────────");
  console.log("\n🏆 Top 5 users có nhiều bạn bè nhất:");
  finalUsers.forEach((u, idx) => {
    console.log(
      `   ${idx + 1}. ${u.username} — ${u.friendsCount} bạn | ${u.followersCount} followers | ${u.followingCount} following`,
    );
  });
  console.log("\n📋 Tài khoản mẫu để đăng nhập (password: Password@123):");
  users.slice(0, 5).forEach((u) => console.log(`   • ${u.email}`));
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (e) => {
    console.error("❌ Seed thất bại:", e);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
