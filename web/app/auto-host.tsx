"use client";

import { useEffect } from "react";

export default function AutoHost() {
  useEffect(() => {
    if (window.location.hostname === "localhost") {
      window.location.replace(
        `http://127.0.0.1:3000${window.location.pathname}${window.location.search}`
      );
    }
  }, []);
  return null;
}