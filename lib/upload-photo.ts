import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Uploads a player photo to Supabase Storage and returns the public URL.
 * File is stored as: {userId}/{playerId}-{timestamp}.{ext}
 */
export async function uploadPlayerPhoto(
  supabase: SupabaseClient,
  userId: string,
  playerId: string,
  file: File
): Promise<string | null> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const sanitizedName = `${userId}/${playerId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("player-photos")
    .upload(sanitizedName, file, {
      cacheControl: "3600",
      upsert: true,
    });

  if (error) {
    console.error("Photo upload failed:", error.message);
    return null;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("player-photos").getPublicUrl(sanitizedName);

  // Update the player's avatar_url
  await supabase
    .from("players")
    .update({ avatar_url: publicUrl })
    .eq("id", playerId);

  return publicUrl;
}
