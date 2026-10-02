import { createFileRoute } from "@tanstack/react-router";
import { WatchScreen } from "@/components/watch-screen";

export const Route = createFileRoute("/")({ component: WatchScreen });
