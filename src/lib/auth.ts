import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { getDb } from "./db";
let instance: ReturnType<typeof createAuth> | undefined;
function createAuth() {
  if (
    !process.env.BETTER_AUTH_SECRET ||
    process.env.BETTER_AUTH_SECRET.length < 32 ||
    process.env.BETTER_AUTH_SECRET.startsWith("REPLACE_")
  )
    throw new Error(
      "Configure a random BETTER_AUTH_SECRET of at least 32 characters.",
    );
  if (!process.env.BETTER_AUTH_URL)
    throw new Error("Configure BETTER_AUTH_URL.");
  return betterAuth({
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    rateLimit: { enabled: true },
    databaseHooks: {
      user: {
        update: {
          before: async (user) => {
            if (user.name !== undefined) {
              const name = user.name.trim();
              if (!name || name.length > 80)
                throw new Error("Name must have 1–80 characters.");
              return { data: { ...user, name } };
            }
            return { data: user };
          },
        },
        create: {
          before: async (user) => {
            const name = user.name.trim();
            if (!name || name.length > 80)
              throw new Error("Name must have 1–80 characters.");
            return { data: { ...user, name } };
          },
        },
      },
    },
  });
}
export function getAuth() {
  return (instance ??= createAuth());
}
