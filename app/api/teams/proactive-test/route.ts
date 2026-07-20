import { NextResponse } from "next/server";

export async function POST() {
  return new NextResponse(null, { status: 410 });
}

export async function GET() {
  return new NextResponse(null, { status: 410 });
}
