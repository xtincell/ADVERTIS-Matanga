import { NextResponse } from "next/server";
import { db } from "~/server/db";

export async function GET() {
  try {
    // Verify database connectivity
    await db.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
    });
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Database connection failed",
      },
      { status: 503 },
    );
  }
}
