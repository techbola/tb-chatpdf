import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ message: "API is working" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("Received body:", body);

    return NextResponse.json({ message: "POST request received", body });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
