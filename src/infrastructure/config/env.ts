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

const databaseUrl = z
  .string()
  .url()
  .superRefine((value, context) => {
    const url = new URL(value);
    if (!["libsql:", "https:", "file:"].includes(url.protocol))
      context.addIssue({
        code: "custom",
        message: "use a libsql://, https://, or local file: database URL",
      });
    if (url.username || url.password)
      context.addIssue({
        code: "custom",
        message: "database credentials must not be embedded in the URL",
      });
  });

const schema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().min(1).default("127.0.0.1"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    APP_ORIGIN: canonicalOrigin.default("http://127.0.0.1:3000"),
    SETUP_MODE: z.enum(["disabled", "local"]).default("disabled"),
    DB_DRIVER: z.enum(["sqlite", "libsql"]).default("sqlite"),
    DATABASE_PATH: z.string().min(1).default("./data/lifemaxing.sqlite"),
    DATABASE_URL: databaseUrl.optional(),
    DATABASE_AUTH_TOKEN: z.string().min(1).optional(),
    DATABASE_ENVIRONMENT: z.enum(["preview", "production"]).optional(),
    VERCEL: z.literal("1").optional(),
    VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
    VERCEL_URL: z.string().min(1).optional(),
    AI_MODE: z.literal("disabled").default("disabled"),
  })
  .superRefine((config, context) => {
    if (config.DB_DRIVER === "libsql") {
      if (!config.DATABASE_URL)
        context.addIssue({
          code: "custom",
          path: ["DATABASE_URL"],
          message: "DATABASE_URL is required for the libsql driver",
        });
      if (!config.DATABASE_AUTH_TOKEN)
        context.addIssue({
          code: "custom",
          path: ["DATABASE_AUTH_TOKEN"],
          message: "DATABASE_AUTH_TOKEN is required for the libsql driver",
        });
    }
    if (config.VERCEL === "1" && config.DB_DRIVER !== "libsql")
      context.addIssue({
        code: "custom",
        path: ["DB_DRIVER"],
        message: "Vercel deployments require durable libsql storage",
      });
    if (
      config.VERCEL === "1" &&
      config.DATABASE_URL &&
      !["libsql:", "https:"].includes(new URL(config.DATABASE_URL).protocol)
    )
      context.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "Vercel requires a remote durable database URL",
      });
    if (config.VERCEL_ENV === "production") {
      if (!config.APP_ORIGIN.startsWith("https://"))
        context.addIssue({
          code: "custom",
          path: ["APP_ORIGIN"],
          message: "production requires an explicit HTTPS APP_ORIGIN",
        });
      if (config.DATABASE_ENVIRONMENT !== "production")
        context.addIssue({
          code: "custom",
          path: ["DATABASE_ENVIRONMENT"],
          message: "production must use a production-tagged database",
        });
    }
    if (
      config.VERCEL_ENV === "preview" &&
      config.DATABASE_ENVIRONMENT !== "preview"
    )
      context.addIssue({
        code: "custom",
        path: ["DATABASE_ENVIRONMENT"],
        message: "preview must use a preview-tagged database",
      });
  });

export type AppConfig = z.infer<typeof schema>;
export function parseConfig(
  input: Readonly<Record<string, string | undefined>>,
): AppConfig {
  const derived = { ...input };
  if (
    !derived.APP_ORIGIN &&
    derived.VERCEL_ENV === "preview" &&
    derived.VERCEL_URL
  )
    derived.APP_ORIGIN = `https://${derived.VERCEL_URL}`;
  return schema.parse(derived);
}
