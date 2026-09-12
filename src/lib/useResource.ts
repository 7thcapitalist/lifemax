"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

export type Resource<T> =
  | { status: "loading" }
  | { status: "empty"; data: T }
  | { status: "error"; message: string }
  | { status: "ready"; data: T };

export function useResource<T>(
  path: string | null,
  isEmpty: (data: T) => boolean = () => false,
) {
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;
  const [resource, setResource] = useState<Resource<T>>({ status: "loading" });
  const load = useCallback(async () => {
    if (!path) return;
    setResource({ status: "loading" });
    try {
      const data = await apiFetch<T>(path);
      setResource(
        isEmptyRef.current(data)
          ? { status: "empty", data }
          : { status: "ready", data },
      );
    } catch (error) {
      setResource({
        status: "error",
        message:
          error instanceof ApiError
            ? error.message
            : "This part of your world could not be loaded.",
      });
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  return { resource, reload: load, setResource };
}
