"use server";

const MENTOR_ACCESS_CODE = "MENTOR";

export async function verifyMentorAccessCode(code: string): Promise<{ ok: boolean }> {
  return { ok: code.trim().toUpperCase() === MENTOR_ACCESS_CODE };
}
