// drizzle.config.js
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export default defineConfig({
  schema: "./db/schema.js",
  dbCredentials: { url: process.env.DATABASE_URL },
  verbose: true,
  strict: true,
  dialect: "postgresql",
});
