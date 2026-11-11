"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { wsUrl } from "@/lib/api";
import { keepLastLines } from "@/lib/logBuffer";

// Chatty containers send hundreds of messages a second. Rendering each one froze the tab,
// so messages are collected and drawn at most this often.
const FLUSH_MS = 100;

/** Streams a container's logs, keeping the last `maxLines` lines. */
export function useLogStream(containerId: string, maxLines: number) {
  const [text, setText] = useState("");
  const pending = useRef<string[]>([]);

  useEffect(() => {
    setText("");
    pending.current = [];
    const ws = new WebSocket(wsUrl(`/ws/containers/${containerId}/logs`));
    ws.onmessage = (ev) => pending.current.push(String(ev.data));
    const timer = setInterval(() => {
      if (pending.current.length === 0) return;
      const chunk = pending.current.join("");
      pending.current = [];
      setText((prev) => keepLastLines(prev + chunk, maxLines));
    }, FLUSH_MS);
    return () => {
      clearInterval(timer);
      ws.close();
    };
  }, [containerId, maxLines]);

  const clear = useCallback(() => {
    pending.current = [];
    setText("");
  }, []);

  return { text, clear };
}
