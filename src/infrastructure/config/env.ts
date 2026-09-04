import { z } from "zod";

const canonicalOrigin = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    const isCanonical =
      value === url.origin &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/" &&
      url.search === "" &&
      url.hash === "";
    const loopback = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !isCanonical ||
      (url.protocol === "http:" && !loopback)
    )
      context.addIssue({
        code: "custom",
        message: "use a canonical HTTPS origin or exact loopback HTTP origin",
      });
  });

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.literal("127.0.0.1").default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  APP_ORIGIN: canonicalOrigin.default("http://127.0.0.1:3000"),
  SETUP_MODE: z.enum(["disabled", "local"]).default("disabled"),
  DATABASE_PATH: z.string().min(1).default("./data/lifemaxing.sqlite"),
  AI_MODE: z.literal("disabled").default("disabled"),
});

export type AppConfig = z.infer<typeof schema>;
export function parseConfig(
  input: Readonly<Record<string, string | undefined>>,
): AppConfig {
  return schema.parse(input);
}
