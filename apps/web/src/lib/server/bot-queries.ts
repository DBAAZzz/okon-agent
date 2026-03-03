import "server-only";
import { cache } from "react";
import { createServerTrpcClient } from "./trpc-client";

export const getBots = cache(async () => {
  const trpc = createServerTrpcClient();
  return trpc.bot.list.query();
});

export const getBotById = cache(async (id: number) => {
  const trpc = createServerTrpcClient();
  return trpc.bot.get.query({ id });
});
