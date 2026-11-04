"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { getDb } from "@/lib/db";
import { profileSchema } from "@/lib/validation";
import type { Result } from "./actions";
export async function updateProfile(
  _: Result,
  form: FormData,
): Promise<Result> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    await getDb().user.update({
      where: { id: user.id },
      data: { name: parsed.data.name },
    });
    revalidatePath("/dashboard", "layout");
    return { success: true };
  } catch {
    return { error: "Could not update your name. Please try again." };
  }
}
