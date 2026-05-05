# Social App — Backend

RESTful API + real-time WebSocket server for a social media application built with **Node.js**, **Express 5**, **Prisma 7**, and **Socket.io**.

---

## Tech Stack

| Layer        | Technology                          |
| ------------ | ----------------------------------- |
| Runtime      | Node.js ≥ 22                        |
| Framework    | Express 5 + TypeScript 5            |
| ORM          | Prisma 7                            |
| Database     | PostgreSQL                          |
| Real-time    | Socket.io 4                         |
| Auth         | JWT (access + refresh) + Google OAuth 2.0 |
| Rate Limiting | Upstash Redis                      |
| AI           | Google Gemini 2.5 Flash             |
| File Upload  | Multer + Cloudinary                 |
| Email        | Nodemailer                          |
| Validation   | Zod                                 |
| Password     | bcryptjs                            |

---

## Project Structure

```
src/
├── server.ts                      # HTTP server + Socket.io bootstrap
├── app.ts                         # Express app, CORS, routes, error handler
├── prisma.config.ts               # Prisma config entrypoint
├── lib/
│   ├── prisma.ts                  # PrismaClient singleton
│   ├── passport.ts                # Passport.js + Google OAuth strategy
│   └── redis.ts                   # Upstash Redis client
├── socket/
│   └── index.ts                   # Socket.io init, JWT auth, online presence
├── middlewares/
│   ├── auth.middleware.ts         # verifyJWT
│   ├── rate-limit.middleware.ts   # Upstash rate limiter wrapper
│   ├── upload.middleware.ts       # Multer (avatar / cover / story)
│   └── error.middleware.ts        # Global error handler
├── services/
│   ├── cloudinary.service.ts      # Upload / delete media
│   ├── mail.service.ts            # Send verification / OTP emails
│   └── notification.service.ts   # createAndEmitNotification()
├── utils/
│   ├── app-error.ts               # Typed HTTP error class
│   ├── cursor.ts                  # Keyset pagination helpers
│   ├── generate-otp.ts
│   ├── generate-token.ts          # JWT sign / verify
│   └── redis.ts                   # Rate limit config presets
└── modules/
    ├── ai/                        # AI caption generation (Gemini)
    ├── auth/                      # Register, login, refresh, OTP, Google OAuth
    ├── users/                     # Profile, avatar, cover, search, deactivate
    ├── posts/                     # CRUD, feed (cursor paginated)
    ├── comments/                  # 2-level threaded comments + replies
    ├── reactions/                 # Toggle reaction (6 types)
    ├── friendships/               # Request, accept, reject, block, suggestions
    ├── followers/                 # Follow / unfollow, follower/following lists
    ├── notifications/             # List, mark read, unread count
    └── stories/                   # Create, feed, view recording, expiry
```

---

## Database Models

`User` · `UserToken` · `EmailVerification` · `OtpCode` · `Post` · `Comment` · `Reaction` · `Friendship` · `Follower` · `Notification` · `Story` · `StoryView`

**Enums:** `Privacy` (PUBLIC / FRIENDS / ONLY_ME) · `FriendStatus` · `ReactionType` · `MediaType` · `OtpType` · `NotifType`

---

## Getting Started

### Prerequisites

- Node.js ≥ 22
- PostgreSQL running locally or a hosted instance
- A [Cloudinary](https://cloudinary.com) account (free tier works)
- An SMTP provider (Gmail, Mailtrap, Resend, etc.)
- An [Upstash](https://upstash.com) Redis database (free tier works)
- A Google Cloud project with OAuth 2.0 credentials (optional, for Google Sign-In)
- A [Google AI Studio](https://aistudio.google.com) API key (optional, for AI captions)

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in each value:

```env
# Database
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

# Email (Mailtrap sandbox for dev)
MAIL_HOST=sandbox.smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USER=your_mailtrap_user
MAIL_PASS=your_mailtrap_pass
MAIL_FROM=noreply@yourapp.com

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:3000/api/auth/google/callback

# App
CLIENT_URL=http://localhost:5173
SERVER_URL=http://localhost:3000
PORT=3000
NODE_ENV=development

# Google Gemini AI
GEMINI_API_KEY=AIxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Upstash Redis (for rate limiting)
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

> **Tip:** Generate secure JWT secrets with:
> ```bash
> npm run gen:secret
> ```

### Database Setup

```bash
# Run migrations and apply schema
npm run db:migrate

# Regenerate Prisma client (after schema changes)
npm run db:generate

# (Optional) Open Prisma Studio GUI
npm run db:studio
```

### Run Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3000` with hot-reload via `tsx watch`.

### Build for Production

```bash
npm run build   # Generates Prisma client + compiles TypeScript → dist/
npm start       # Runs compiled output
```

---

## API Reference

All endpoints are prefixed with `/api`. Protected routes (marked **✓**) require an `Authorization: Bearer <accessToken>` header. Rate-limited routes (marked **⚡**) apply sliding-window limits via Upstash Redis.

### Health Check

| Method | Endpoint  | Description          |
| ------ | --------- | -------------------- |
| GET    | `/health` | Returns `{ status: "OK" }` |

---

### Auth — `/api/auth`

| Method | Endpoint               | Auth   | Description                                    |
| ------ | ---------------------- | ------ | ---------------------------------------------- |
| POST   | `/register`            | ⚡     | Register new account (email + password)        |
| GET    | `/verify-email?token=` | ✗      | Verify email address via token link            |
| POST   | `/resend-verify`       | ⚡     | Resend verification email                      |
| POST   | `/login`               | ⚡     | Login, returns access token + sets refresh cookie |
| POST   | `/refresh`             | Cookie | Exchange refresh cookie for a new access token |
| POST   | `/logout`              | ✓      | Invalidate tokens in DB + clear cookie         |
| POST   | `/forgot-password`     | ⚡     | Send 6-digit OTP to email                      |
| POST   | `/verify-otp`          | ⚡     | Verify OTP code                                |
| POST   | `/reset-password`      | ⚡     | Set new password after OTP verified            |
| PUT    | `/change-password`     | ✓ ⚡  | Change password (requires current password)    |
| GET    | `/google`              | ✗      | Initiate Google OAuth 2.0 flow                 |
| GET    | `/google/callback`     | ✗      | Google OAuth callback, redirects with tokens   |

---

### Users — `/api/users`

All user routes require **✓** auth.

| Method | Endpoint                   | Description                    |
| ------ | -------------------------- | ------------------------------ |
| GET    | `/me`                      | Get current user profile       |
| PUT    | `/me`                      | Update username / bio          |
| PUT    | `/me/avatar`               | Upload avatar (multipart/form-data) |
| PUT    | `/me/cover`                | Upload cover photo (multipart) |
| PUT    | `/me/deactivate`           | Soft-deactivate account        |
| DELETE | `/me`                      | Permanently delete account     |
| GET    | `/search?q=`               | Search users by username       |
| GET    | `/by-username/:username`   | Get profile by username        |
| GET    | `/:id`                     | Get profile by user ID         |
| GET    | `/:id/posts`               | Get paginated posts by user    |
| GET    | `/:id/followers`           | Get user's followers list      |
| GET    | `/:id/following`           | Get user's following list      |
| GET    | `/:id/stories/active`      | Get user's active stories      |

---

### Posts — `/api/posts`

All post routes require **✓** auth.

| Method | Endpoint                  | Description                       |
| ------ | ------------------------- | --------------------------------- |
| POST   | `/`                       | Create post (text + optional media) |
| GET    | `/feed?cursor=&limit=`    | Get cursor-paginated feed         |
| GET    | `/:id`                    | Get single post                   |
| PUT    | `/:id`                    | Update post content / privacy     |
| DELETE | `/:id`                    | Delete post                       |

---

### Comments — `/api/posts/:postId/comments` & `/api/comments`

All comment routes require **✓** auth.

| Method | Endpoint                        | Description                        |
| ------ | ------------------------------- | ---------------------------------- |
| POST   | `/api/posts/:postId/comments`   | Create root comment                |
| GET    | `/api/posts/:postId/comments`   | List root comments (cursor ASC)    |
| POST   | `/api/comments/:id/replies`     | Create reply to a comment          |
| GET    | `/api/comments/:id/replies`     | List replies for a comment         |
| PUT    | `/api/comments/:id`             | Edit comment content               |
| DELETE | `/api/comments/:id`             | Delete comment (cascades replies)  |

---

### Reactions — `/api/posts/:postId/reactions`

All reaction routes require **✓** auth.

| Method | Endpoint    | Description                                    |
| ------ | ----------- | ---------------------------------------------- |
| POST   | `/`         | Toggle reaction (`LIKE` / `LOVE` / `HAHA` / `WOW` / `SAD` / `ANGRY`) |
| GET    | `/`         | List reactions with cursor pagination          |
| GET    | `/summary`  | Reaction counts grouped by type                |
| GET    | `/me`       | Get current user's reaction on the post        |

---

### Friendships — `/api/friendships`

All friendship routes require **✓** auth.

| Method | Endpoint              | Description                           |
| ------ | --------------------- | ------------------------------------- |
| POST   | `/request/:userId`    | Send friend request                   |
| PUT    | `/accept/:userId`     | Accept incoming request               |
| PUT    | `/reject/:userId`     | Reject incoming request               |
| DELETE | `/cancel/:userId`     | Cancel a sent request                 |
| DELETE | `/unfriend/:userId`   | Remove friend                         |
| PUT    | `/block/:userId`      | Block a user                          |
| PUT    | `/unblock/:userId`    | Unblock a user                        |
| GET    | `/requests`           | List incoming friend requests         |
| GET    | `/sent`               | List sent requests                    |
| GET    | `/friends`            | List accepted friends                 |
| GET    | `/suggestions`        | Friend suggestions (mutual friends)   |

---

### Followers — `/api/followers`

All follower routes require **✓** auth.

| Method | Endpoint                      | Description     |
| ------ | ----------------------------- | --------------- |
| POST   | `/follow/:userId`             | Follow a user   |
| DELETE | `/unfollow/:userId`           | Unfollow a user |

---

### Notifications — `/api/notifications`

All notification routes require **✓** auth.

| Method | Endpoint          | Description                       |
| ------ | ----------------- | --------------------------------- |
| GET    | `/`               | List notifications (cursor-based) |
| GET    | `/unread-count`   | Get unread badge count            |
| PUT    | `/read-all`       | Mark all notifications as read    |
| PUT    | `/:id/read`       | Mark a single notification as read |
| DELETE | `/:id`            | Delete a notification             |

---

### Stories — `/api/stories`

All story routes require **✓** auth.

| Method | Endpoint                           | Description                     |
| ------ | ---------------------------------- | ------------------------------- |
| POST   | `/`                                | Create story (multipart/form-data) |
| GET    | `/feed`                            | Grouped story feed (friends)    |
| GET    | `/me`                              | My stories with pagination      |
| POST   | `/:id/view`                        | Record a story view (upsert)    |
| GET    | `/:id/viewers`                     | List who viewed a story         |
| DELETE | `/:id`                             | Delete a story                  |

---

### AI — `/api/ai`

All AI routes require **✓** auth.

| Method | Endpoint    | Description                                              |
| ------ | ----------- | -------------------------------------------------------- |
| POST   | `/caption`  | Generate 3 social-media captions from images via Gemini  |

**Request body:**
```json
{
  "imageUrls": ["https://...", "https://..."],
  "language": "en"
}
```
**Response:**
```json
{
  "captions": ["caption 1", "caption 2", "caption 3"]
}
```

Supports `language: "en" | "vi"` (default `"vi"`). Accepts 1–10 image URLs. Powered by **Gemini 2.5 Flash**.

---

## Authentication Flow

```
Register ──► verify email link ──► Login
  └─► { accessToken (15m Bearer), refreshToken (30d, httpOnly cookie) }

On 401 ──► POST /api/auth/refresh  (refresh cookie auto-sent by browser)
  └─► new accessToken

Logout ──► tokens invalidated in DB + cookie cleared

Google OAuth:
  GET /api/auth/google ──► Google consent ──► GET /api/auth/google/callback
    └─► redirect to CLIENT_URL with tokens
```

Password reset flow:
```
POST /forgot-password ──► OTP sent to email
POST /verify-otp      ──► OTP validated, issues a short-lived reset token
POST /reset-password  ──► new password set
```

---

## Cursor Pagination

All list endpoints use **keyset cursor pagination** instead of classic offset/limit:

```
GET /api/posts/feed?limit=10
→ { data: [...], nextCursor: "base64string", hasMore: true }

GET /api/posts/feed?cursor=base64string&limit=10
→ next page
```

The cursor encodes `{ createdAt, id }` as a base64url string. This keeps pagination stable even when new rows are inserted between requests.

---

## Real-time Events (Socket.io)

Clients authenticate by passing the access token in the Socket.io handshake:

```js
io.connect(SERVER_URL, { auth: { token: accessToken } });
```

### Personal room — `user:{userId}`

| Event (server → client) | Payload              | Trigger                        |
| ----------------------- | -------------------- | ------------------------------ |
| `new_notification`      | Notification object  | Any notification created       |
| `friend_request`        | `{ sender }`         | Someone sent you a request     |
| `friend_accepted`       | `{ accepter }`       | Someone accepted your request  |

### Post room — `post:{postId}`

Join with `socket.emit("join_post", postId)` while on the post detail page.

| Event                   | Payload                                                  | Trigger                    |
| ----------------------- | -------------------------------------------------------- | -------------------------- |
| `post:reaction`         | `{ postId, userId, action, reactionType, likesCount }`   | Any reaction toggled       |
| `post:updated`          | `{ postId, content, privacy, updatedAt }`                | Post edited                |
| `post:deleted`          | `{ postId }`                                             | Post deleted               |
| `post:new_comment`      | `{ postId, comment }`                                    | Root comment added         |
| `post:new_reply`        | `{ postId, commentId, reply }`                           | Reply added                |
| `post:comment_updated`  | `{ postId, commentId, content, parentId }`               | Comment edited             |
| `post:comment_deleted`  | `{ postId, commentId, parentId, decrementBy }`           | Comment deleted            |
| `post:comments_count`   | `{ postId, commentsCount }`                              | Authoritative count sync   |

### Global Presence

| Event            | Payload                  | Description                          |
| ---------------- | ------------------------ | ------------------------------------ |
| `user:online`    | `{ userId }`             | User connected (broadcast to all)    |
| `user:offline`   | `{ userId }`             | User's last tab closed (broadcast)   |
| `presence:check` | `(userIds[], callback)`  | Acknowledge who is currently online  |

---

## NPM Scripts

```bash
npm run dev           # Start development server with hot-reload (tsx watch)
npm run build         # Generate Prisma client + compile TypeScript → dist/
npm start             # Run compiled production output

npm run db:migrate    # Run Prisma migrations (creates migration files)
npm run db:generate   # Regenerate Prisma client after schema changes
npm run db:studio     # Open Prisma Studio GUI
npm run db:push       # Push schema changes without a migration (dev only)
npm run db:reset      # Drop all data and re-run all migrations
npm run db:seed       # Seed the database

npm run lint          # Run ESLint on src/
npm run format        # Run Prettier on src/

npm run gen:secret    # Print a random 32-byte hex string (for JWT secrets)
```
