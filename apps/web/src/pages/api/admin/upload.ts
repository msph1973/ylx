import type { APIRoute } from "astro";
import { sanityWriteClient } from "@ylx/sanity/client";
import { requireAdmin } from "../../../lib/auth";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];

export const POST: APIRoute = async ({ request, cookies }) => {
  const session = requireAdmin(cookies);
  if (!session) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const albumId = formData.get("albumId") as string;
    const filename = formData.get("filename") as string;

    if (!file || !albumId || !filename) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(
        JSON.stringify({ error: "Unsupported file type" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(
        JSON.stringify({ error: "File too large (max 50MB)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Upload image to Sanity
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = await sanityWriteClient.upload('image', buffer, {
      filename: filename,
      contentType: file.type,
    });

    // Create photo document
    const photoDoc = await sanityWriteClient.create({
      _type: 'photo',
      filename: filename,
      image: {
        _type: 'image',
        asset: {
          _type: 'reference',
          _ref: asset._ref,
        },
      },
      album: {
        _type: 'reference',
        _ref: albumId,
      },
    });

    return new Response(
      JSON.stringify({ success: true, photoId: photoDoc._id }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[Upload] Error:", err);
    return new Response(
      JSON.stringify({ error: "Upload failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
