import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { prisma } from "../lib/prisma";

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email from Google"), false);

        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });

        if (!user) {
          user = await prisma.user.findUnique({ where: { email } });

          if (user) {
            user = await prisma.user.update({
              where: { id: user.id },
              data: {
                googleId: profile.id,
                isVerified: true,
                ...(user.isActive === false && { isActive: true }),
              },
            });
          } else {
            const baseUsername = (profile.displayName ?? email.split("@")[0])
              .toLowerCase()
              .replace(/[^a-z0-9_]/g, "_")
              .slice(0, 18);

            let username = baseUsername;
            let suffix = 1;
            while (await prisma.user.findUnique({ where: { username } })) {
              username = `${baseUsername}${suffix++}`;
            }

            user = await prisma.user.create({
              data: {
                googleId: profile.id,
                email,
                username,
                password: null,
                avatar: profile.photos?.[0]?.value ?? null,
                isVerified: true,
                isActive: true,
              },
            });
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err as Error, false);
      }
    },
  ),
);

export default passport;
