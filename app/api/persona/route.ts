import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

// Whitelist of allowed file extensions to prevent path traversal abuse
const ALLOWED_EXT = [".md", ".txt"];

export async function GET(req: NextRequest) {
  const file = req.nextUrl.searchParams.get("file");
  if (!file) return NextResponse.json({ error: "file param required" }, { status: 400 });

  // Guard against path traversal: only allow simple filenames or persona/<file>
  if (file.includes("..") || file.startsWith("/")) {
    return NextResponse.json({ error: "invalid file path" }, { status: 400 });
  }
  const ext = path.extname(file).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return NextResponse.json({ error: "unsupported file type" }, { status: 400 });
  }

  const personaDir = path.join(process.cwd(), "persona");
  const filePath = path.join(personaDir, file);

  // Verify the resolved path is still inside personaDir
  if (!filePath.startsWith(personaDir)) {
    return NextResponse.json({ error: "invalid file path" }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "file not found", file }, { status: 404 });
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    return NextResponse.json({ file, content });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "read failed" }, { status: 500 });
  }
}
