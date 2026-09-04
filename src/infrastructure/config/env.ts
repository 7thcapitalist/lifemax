import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: z
    .string()
    .url()
    .default("http://127.0.0.1:3000")
    .refine(
      (value) =>
        value.startsWith("http://127.0.0.1") || value.startsWith("https://"),
      "use localhost HTTP or HTTPS",
    ),
  DATABASE_PATH: z.string().min(1).default("./data/lifemaxing.sqlite"),
  AI_MODE: z.literal("disabled").default("disabled"),
});

export type AppConfig = z.infer<typeof schema>;
export function parseConfig(
  input: Readonly<Record<string, string | undefined>>,
): AppConfig {
  return schema.parse(input);
}
