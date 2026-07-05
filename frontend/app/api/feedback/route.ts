import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextResponse } from "next/server"

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5 MB

// POST /api/feedback — a rating and/or a message and/or a screenshot.
// Multipart FormData: rating (1-5, optional), message (optional),
// image (optional file). At least one of the three must be present.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "expected form data" }, { status: 400 })

  const ratingRaw = form.get("rating")
  const message = (form.get("message") as string | null)?.trim() || null
  const image = form.get("image")

  let rating: number | null = null
  if (typeof ratingRaw === "string" && ratingRaw !== "") {
    const n = Number(ratingRaw)
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return NextResponse.json({ error: "rating must be 1-5" }, { status: 400 })
    }
    rating = n
  }

  const hasImage = image instanceof File && image.size > 0
  if (rating === null && !message && !hasImage) {
    return NextResponse.json({ error: "add a rating, a message, or a screenshot" }, { status: 400 })
  }

  // Upload the screenshot through the service role (bucket has no public
  // policy, so the client can't write to it directly) before writing the row.
  let imagePath: string | null = null
  if (hasImage) {
    const file = image as File
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "attachment must be an image" }, { status: 400 })
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "image too large (max 5 MB)" }, { status: 400 })
    }
    const ext = file.type.split("/")[1]?.replace(/[^a-z0-9]/gi, "") || "png"
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`
    const bytes = new Uint8Array(await file.arrayBuffer())

    const admin = createAdminClient()
    const { error: uploadErr } = await admin.storage
      .from("feedback")
      .upload(path, bytes, { contentType: file.type, upsert: false })

    if (uploadErr) {
      console.error("feedback image upload failed:", uploadErr)
      return NextResponse.json({ error: "image upload failed" }, { status: 500 })
    }
    imagePath = path
  }

  // Insert via the caller's session so RLS enforces user_id = auth.uid().
  const { error } = await supabase
    .from("feedback")
    .insert({ user_id: user.id, rating, message, image_path: imagePath })

  if (error) {
    console.error("POST /api/feedback failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
