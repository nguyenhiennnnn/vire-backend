# Social App — Backend

API RESTful + máy chủ WebSocket thời gian thực cho ứng dụng mạng xã hội, xây dựng bằng **Node.js**, **Express 5**, **Prisma 7** và **Socket.io**.

---

## Công Nghệ Sử Dụng

| Tầng         | Công nghệ                           |
| ------------ | ----------------------------------- |
| Runtime      | Node.js ≥ 22                        |
| Framework    | Express 5 + TypeScript 5            |
| ORM          | Prisma 7                            |
| Cơ sở dữ liệu | PostgreSQL                        |
| Thời gian thực | Socket.io 4                       |
| Xác thực     | JWT (access + refresh) + Google OAuth 2.0 |
| Giới hạn tốc độ | Upstash Redis                    |
| AI           | Google Gemini 2.5 Flash             |
| Tải file     | Multer + Cloudinary                 |
| Email        | Nodemailer                          |
| Kiểm tra dữ liệu | Zod                             |
| Mật khẩu    | bcryptjs                            |

---

## Cấu Trúc Dự Án

```
src/
├── server.ts                      # Khởi động HTTP server + Socket.io
├── app.ts                         # Express app, CORS, routes, xử lý lỗi
├── prisma.config.ts               # Điểm vào cấu hình Prisma
├── lib/
│   ├── prisma.ts                  # PrismaClient singleton
│   ├── passport.ts                # Passport.js + Google OAuth strategy
│   └── redis.ts                   # Upstash Redis client
├── socket/
│   └── index.ts                   # Khởi tạo Socket.io, xác thực JWT, trạng thái online
├── middlewares/
│   ├── auth.middleware.ts         # verifyJWT
│   ├── rate-limit.middleware.ts   # Wrapper giới hạn tốc độ Upstash
│   ├── upload.middleware.ts       # Multer (avatar / ảnh bìa / story)
│   └── error.middleware.ts        # Xử lý lỗi toàn cục
├── services/
│   ├── cloudinary.service.ts      # Tải lên / xóa media
│   ├── mail.service.ts            # Gửi email xác minh / OTP
│   └── notification.service.ts   # createAndEmitNotification()
├── utils/
│   ├── app-error.ts               # Class lỗi HTTP có kiểu dữ liệu
│   ├── cursor.ts                  # Các hàm hỗ trợ phân trang keyset
│   ├── generate-otp.ts
│   ├── generate-token.ts          # Ký / xác minh JWT
│   └── redis.ts                   # Cấu hình giới hạn tốc độ
└── modules/
    ├── ai/                        # Tạo caption bằng AI (Gemini)
    ├── auth/                      # Đăng ký, đăng nhập, refresh, OTP, Google OAuth
    ├── users/                     # Hồ sơ, avatar, ảnh bìa, tìm kiếm, vô hiệu hóa
    ├── posts/                     # CRUD, feed (phân trang con trỏ)
    ├── comments/                  # Bình luận 2 cấp + trả lời
    ├── reactions/                 # Bật/tắt cảm xúc (6 loại)
    ├── friendships/               # Gửi yêu cầu, chấp nhận, từ chối, chặn, gợi ý
    ├── followers/                 # Theo dõi / bỏ theo dõi, danh sách
    ├── notifications/             # Danh sách, đánh dấu đã đọc, số chưa đọc
    └── stories/                   # Tạo, feed, ghi nhận lượt xem, hết hạn
```

---

## Các Model Cơ Sở Dữ Liệu

`User` · `UserToken` · `EmailVerification` · `OtpCode` · `Post` · `Comment` · `Reaction` · `Friendship` · `Follower` · `Notification` · `Story` · `StoryView`

**Enums:** `Privacy` (PUBLIC / FRIENDS / ONLY_ME) · `FriendStatus` · `ReactionType` · `MediaType` · `OtpType` · `NotifType`

---

## Bắt Đầu

### Yêu Cầu

- Node.js ≥ 22
- PostgreSQL chạy cục bộ hoặc trên máy chủ
- Tài khoản [Cloudinary](https://cloudinary.com) (gói miễn phí là đủ)
- Nhà cung cấp SMTP (Gmail, Mailtrap, Resend, v.v.)
- Cơ sở dữ liệu [Upstash](https://upstash.com) Redis (gói miễn phí là đủ)
- Dự án Google Cloud với thông tin xác thực OAuth 2.0 (tùy chọn, dành cho đăng nhập Google)
- API key từ [Google AI Studio](https://aistudio.google.com) (tùy chọn, dành cho caption AI)

### Cài Đặt

```bash
cd backend
npm install
```

### Biến Môi Trường

Sao chép `.env.example` sang `.env` và điền vào từng giá trị:

```env
# Cơ sở dữ liệu
DATABASE_URL=postgresql://user:pass@localhost:5432/social_db

# JWT
JWT_ACCESS_SECRET=change_this_access_secret_min_32_chars
JWT_REFRESH_SECRET=change_this_refresh_secret_min_32_chars
JWT_RESET_SECRET=change_this_reset_secret_min_32_chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=30d
JWT_RESET_EXPIRES=10m

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Email (sandbox Mailtrap cho môi trường dev)
MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_mailtrap_user
MAIL_PASS=your_mailtrap_pass
MAIL_FROM=noreply@yourapp.com

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# Ứng dụng
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:3000
PORT=3000
NODE_ENV=development

# Google Gemini AI
GEMINI_API_KEY=AIxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Upstash Redis (để giới hạn tốc độ)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

> **Mẹo:** Tạo JWT secret an toàn bằng lệnh:
> ```bash
> npm run gen:secret
> ```

### Cài Đặt Cơ Sở Dữ Liệu

```bash
# Chạy migration và áp dụng schema
npm run db:migrate

# Tái tạo Prisma client (sau khi thay đổi schema)
npm run db:generate

# (Tùy chọn) Mở giao diện Prisma Studio
npm run db:studio
```

### Chạy Máy Chủ Phát Triển

```bash
npm run dev
```

Máy chủ khởi động tại `http://localhost:3000` với hot-reload thông qua `tsx watch`.

### Build Cho Môi Trường Production

```bash
npm run build   # Tạo Prisma client + biên dịch TypeScript → dist/
npm start       # Chạy bản đã biên dịch
```

---

## Tài Liệu API

Tất cả endpoint được bắt đầu bằng `/api`. Các route được bảo vệ (đánh dấu **✓**) yêu cầu header `Authorization: Bearer <accessToken>`. Các route giới hạn tốc độ (đánh dấu **⚡**) áp dụng giới hạn sliding-window qua Upstash Redis.

### Kiểm Tra Trạng Thái

| Phương thức | Endpoint  | Mô tả                |
| ----------- | --------- | -------------------- |
| GET         | `/health` | Trả về `{ status: "OK" }` |

---

### Xác Thực — `/api/auth`

| Phương thức | Endpoint               | Auth   | Mô tả                                              |
| ----------- | ---------------------- | ------ | -------------------------------------------------- |
| POST        | `/register`            | ⚡     | Đăng ký tài khoản mới (email + mật khẩu)          |
| GET         | `/verify-email?token=` | ✗      | Xác minh địa chỉ email qua đường link token        |
| POST        | `/resend-verify`       | ⚡     | Gửi lại email xác minh                             |
| POST        | `/login`               | ⚡     | Đăng nhập, trả về access token + đặt refresh cookie |
| POST        | `/refresh`             | Cookie | Đổi refresh cookie lấy access token mới            |
| POST        | `/logout`              | ✓      | Vô hiệu hóa token trong DB + xóa cookie           |
| POST        | `/forgot-password`     | ⚡     | Gửi OTP 6 chữ số về email                         |
| POST        | `/verify-otp`          | ⚡     | Xác minh mã OTP                                    |
| POST        | `/reset-password`      | ⚡     | Đặt mật khẩu mới sau khi xác minh OTP             |
| PUT         | `/change-password`     | ✓ ⚡  | Đổi mật khẩu (yêu cầu mật khẩu hiện tại)         |
| GET         | `/google`              | ✗      | Bắt đầu luồng Google OAuth 2.0                     |
| GET         | `/google/callback`     | ✗      | Callback Google OAuth, chuyển hướng kèm token      |

---

### Người Dùng — `/api/users`

Tất cả route người dùng yêu cầu xác thực **✓**.

| Phương thức | Endpoint                   | Mô tả                              |
| ----------- | -------------------------- | ---------------------------------- |
| GET         | `/me`                      | Lấy hồ sơ người dùng hiện tại     |
| PUT         | `/me`                      | Cập nhật tên người dùng / bio      |
| PUT         | `/me/avatar`               | Tải lên avatar (multipart/form-data) |
| PUT         | `/me/cover`                | Tải lên ảnh bìa (multipart)        |
| PUT         | `/me/deactivate`           | Vô hiệu hóa tài khoản tạm thời     |
| DELETE      | `/me`                      | Xóa tài khoản vĩnh viễn            |
| GET         | `/search?q=`               | Tìm kiếm người dùng theo tên       |
| GET         | `/by-username/:username`   | Lấy hồ sơ theo tên người dùng      |
| GET         | `/:id`                     | Lấy hồ sơ theo ID người dùng       |
| GET         | `/:id/posts`               | Lấy bài viết theo người dùng (phân trang) |
| GET         | `/:id/followers`           | Lấy danh sách người theo dõi       |
| GET         | `/:id/following`           | Lấy danh sách đang theo dõi        |
| GET         | `/:id/stories/active`      | Lấy stories đang hoạt động của người dùng |

---

### Bài Viết — `/api/posts`

Tất cả route bài viết yêu cầu xác thực **✓**.

| Phương thức | Endpoint                  | Mô tả                                  |
| ----------- | ------------------------- | -------------------------------------- |
| POST        | `/`                       | Tạo bài viết (văn bản + media tùy chọn) |
| GET         | `/feed?cursor=&limit=`    | Lấy feed phân trang theo con trỏ       |
| GET         | `/:id`                    | Lấy một bài viết                        |
| PUT         | `/:id`                    | Cập nhật nội dung / quyền riêng tư     |
| DELETE      | `/:id`                    | Xóa bài viết                           |

---

### Bình Luận — `/api/posts/:postId/comments` & `/api/comments`

Tất cả route bình luận yêu cầu xác thực **✓**.

| Phương thức | Endpoint                        | Mô tả                                |
| ----------- | ------------------------------- | ------------------------------------ |
| POST        | `/api/posts/:postId/comments`   | Tạo bình luận gốc                    |
| GET         | `/api/posts/:postId/comments`   | Danh sách bình luận gốc (con trỏ ASC) |
| POST        | `/api/comments/:id/replies`     | Trả lời một bình luận                |
| GET         | `/api/comments/:id/replies`     | Danh sách trả lời của bình luận      |
| PUT         | `/api/comments/:id`             | Chỉnh sửa nội dung bình luận         |
| DELETE      | `/api/comments/:id`             | Xóa bình luận (xóa cả trả lời)       |

---

### Cảm Xúc — `/api/posts/:postId/reactions`

Tất cả route cảm xúc yêu cầu xác thực **✓**.

| Phương thức | Endpoint    | Mô tả                                                   |
| ----------- | ----------- | ------------------------------------------------------- |
| POST        | `/`         | Bật/tắt cảm xúc (`LIKE` / `LOVE` / `HAHA` / `WOW` / `SAD` / `ANGRY`) |
| GET         | `/`         | Danh sách cảm xúc với phân trang con trỏ                |
| GET         | `/summary`  | Số lượng cảm xúc theo từng loại                         |
| GET         | `/me`       | Lấy cảm xúc của người dùng hiện tại trên bài viết       |

---

### Kết Bạn — `/api/friendships`

Tất cả route kết bạn yêu cầu xác thực **✓**.

| Phương thức | Endpoint              | Mô tả                                 |
| ----------- | --------------------- | ------------------------------------- |
| POST        | `/request/:userId`    | Gửi lời mời kết bạn                   |
| PUT         | `/accept/:userId`     | Chấp nhận lời mời đến                 |
| PUT         | `/reject/:userId`     | Từ chối lời mời đến                   |
| DELETE      | `/cancel/:userId`     | Hủy lời mời đã gửi                    |
| DELETE      | `/unfriend/:userId`   | Xóa bạn bè                            |
| PUT         | `/block/:userId`      | Chặn người dùng                       |
| PUT         | `/unblock/:userId`    | Bỏ chặn người dùng                    |
| GET         | `/requests`           | Danh sách lời mời kết bạn đến         |
| GET         | `/sent`               | Danh sách lời mời đã gửi              |
| GET         | `/friends`            | Danh sách bạn bè đã kết               |
| GET         | `/suggestions`        | Gợi ý kết bạn (bạn chung)             |

---

### Theo Dõi — `/api/followers`

Tất cả route theo dõi yêu cầu xác thực **✓**.

| Phương thức | Endpoint                      | Mô tả             |
| ----------- | ----------------------------- | ----------------- |
| POST        | `/follow/:userId`             | Theo dõi người dùng |
| DELETE      | `/unfollow/:userId`           | Bỏ theo dõi       |

---

### Thông Báo — `/api/notifications`

Tất cả route thông báo yêu cầu xác thực **✓**.

| Phương thức | Endpoint          | Mô tả                              |
| ----------- | ----------------- | ---------------------------------- |
| GET         | `/`               | Danh sách thông báo (phân trang con trỏ) |
| GET         | `/unread-count`   | Lấy số lượng thông báo chưa đọc   |
| PUT         | `/read-all`       | Đánh dấu tất cả thông báo đã đọc  |
| PUT         | `/:id/read`       | Đánh dấu một thông báo đã đọc     |
| DELETE      | `/:id`            | Xóa một thông báo                  |

---

### Stories — `/api/stories`

Tất cả route story yêu cầu xác thực **✓**.

| Phương thức | Endpoint                           | Mô tả                           |
| ----------- | ---------------------------------- | ------------------------------- |
| POST        | `/`                                | Tạo story (multipart/form-data) |
| GET         | `/feed`                            | Feed story theo nhóm (bạn bè)  |
| GET         | `/me`                              | Stories của tôi với phân trang  |
| POST        | `/:id/view`                        | Ghi nhận lượt xem story (upsert) |
| GET         | `/:id/viewers`                     | Danh sách người đã xem          |
| DELETE      | `/:id`                             | Xóa story                       |

---

### AI — `/api/ai`

Tất cả route AI yêu cầu xác thực **✓**.

| Phương thức | Endpoint    | Mô tả                                                   |
| ----------- | ----------- | ------------------------------------------------------- |
| POST        | `/caption`  | Tạo 3 caption mạng xã hội từ hình ảnh qua Gemini        |

**Body yêu cầu:**
```json
{
  "imageUrls": ["https://...", "https://..."],
  "language": "en"
}
```
**Phản hồi:**
```json
{
  "captions": ["caption 1", "caption 2", "caption 3"]
}
```

Hỗ trợ `language: "en" | "vi"` (mặc định `"vi"`). Nhận từ 1–10 URL hình ảnh. Được cung cấp bởi **Gemini 2.5 Flash**.

---

## Luồng Xác Thực

```
Đăng ký ──► xác minh email ──► Đăng nhập
  └─► { accessToken (15m Bearer), refreshToken (30d, httpOnly cookie) }

Khi 401 ──► POST /api/auth/refresh  (refresh cookie tự động gửi bởi trình duyệt)
  └─► accessToken mới

Đăng xuất ──► token bị vô hiệu hóa trong DB + xóa cookie

Google OAuth:
  GET /api/auth/google ──► Đồng ý Google ──► GET /api/auth/google/callback
    └─► chuyển hướng đến CLIENT_URL kèm token
```

Luồng đặt lại mật khẩu:
```
POST /forgot-password ──► OTP gửi về email
POST /verify-otp      ──► OTP được xác minh, cấp token đặt lại ngắn hạn
POST /reset-password  ──► mật khẩu mới được đặt
```

---

## Phân Trang Con Trỏ

Tất cả endpoint danh sách sử dụng **phân trang keyset cursor** thay vì offset/limit truyền thống:

```
GET /api/posts/feed?limit=10
→ { data: [...], nextCursor: "base64string", hasMore: true }

GET /api/posts/feed?cursor=base64string&limit=10
→ trang tiếp theo
```

Con trỏ mã hóa `{ createdAt, id }` dưới dạng chuỗi base64url. Điều này giữ cho phân trang ổn định ngay cả khi có các hàng mới được chèn vào giữa các yêu cầu.

---

## Sự Kiện Thời Gian Thực (Socket.io)

Client xác thực bằng cách truyền access token vào handshake Socket.io:

```js
io.connect(SERVER_URL, { auth: { token: accessToken } });
```

### Phòng cá nhân — `user:{userId}`

| Sự kiện (server → client) | Payload              | Kích hoạt khi                      |
| ------------------------- | -------------------- | ---------------------------------- |
| `new_notification`        | Đối tượng Notification | Bất kỳ thông báo nào được tạo    |
| `friend_request`          | `{ sender }`         | Ai đó gửi lời mời kết bạn          |
| `friend_accepted`         | `{ accepter }`       | Ai đó chấp nhận lời mời của bạn    |

### Phòng bài viết — `post:{postId}`

Tham gia bằng `socket.emit("join_post", postId)` khi ở trang chi tiết bài viết.

| Sự kiện                 | Payload                                                  | Kích hoạt khi               |
| ----------------------- | -------------------------------------------------------- | --------------------------- |
| `post:reaction`         | `{ postId, userId, action, reactionType, likesCount }`   | Bất kỳ cảm xúc nào được bật/tắt |
| `post:updated`          | `{ postId, content, privacy, updatedAt }`                | Bài viết được chỉnh sửa     |
| `post:deleted`          | `{ postId }`                                             | Bài viết bị xóa             |
| `post:new_comment`      | `{ postId, comment }`                                    | Thêm bình luận gốc          |
| `post:new_reply`        | `{ postId, commentId, reply }`                           | Thêm trả lời                |
| `post:comment_updated`  | `{ postId, commentId, content, parentId }`               | Bình luận được chỉnh sửa    |
| `post:comment_deleted`  | `{ postId, commentId, parentId, decrementBy }`           | Bình luận bị xóa            |
| `post:comments_count`   | `{ postId, commentsCount }`                              | Đồng bộ số lượng chính thức |

### Trạng Thái Trực Tuyến Toàn Cục

| Sự kiện          | Payload                  | Mô tả                                    |
| ---------------- | ------------------------ | ---------------------------------------- |
| `user:online`    | `{ userId }`             | Người dùng kết nối (phát đến tất cả)     |
| `user:offline`   | `{ userId }`             | Tab cuối cùng của người dùng đóng lại    |
| `presence:check` | `(userIds[], callback)`  | Xác nhận ai đang trực tuyến              |

---

## Lệnh NPM

```bash
npm run dev           # Khởi động server phát triển với hot-reload (tsx watch)
npm run build         # Tạo Prisma client + biên dịch TypeScript → dist/
npm start             # Chạy bản production đã biên dịch

npm run db:migrate    # Chạy Prisma migrations (tạo file migration)
npm run db:generate   # Tái tạo Prisma client sau khi thay đổi schema
npm run db:studio     # Mở giao diện Prisma Studio
npm run db:push       # Đẩy thay đổi schema không tạo migration (chỉ dùng khi dev)
npm run db:reset      # Xóa toàn bộ dữ liệu và chạy lại tất cả migration
npm run db:seed       # Seed cơ sở dữ liệu

npm run lint          # Chạy ESLint trên src/
npm run format        # Chạy Prettier trên src/

npm run gen:secret    # In ra chuỗi hex ngẫu nhiên 32 byte (dùng cho JWT secrets)
```