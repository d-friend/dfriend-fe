import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse(null, { status: 404 });
  }

  try {
    const payload = await request.json() as {
      level?: "info" | "warn" | "error";
      message?: string;
      data?: Record<string, unknown>;
    };
    const level = payload.level === "warn" || payload.level === "error" ? payload.level : "info";
    const message = typeof payload.message === "string" ? payload.message : "unknown frontend event";

    console[level]("[D-Friend/PostHog][browser]", message, payload.data ?? {});
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
