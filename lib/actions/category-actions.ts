"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";

const categorySchema = z.object({
  name: z.string().trim().min(2),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  parentCategoryId: z.string().optional().transform((value) => value || undefined)
});

export async function createCategoryAction(input: z.infer<typeof categorySchema>) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const data = categorySchema.parse(input);
  const category = await prisma.category.create({ data });
  await audit({ entityType: "Category", entityId: category.id, action: "CREATE", after: category, userId: user.id });
  revalidatePath("/categories");
}

export async function toggleCategoryAction(formData: FormData) {
  const user = await requireUser([Role.ADMINISTRATOR, Role.TREASURER]);
  const id = String(formData.get("id"));
  const before = await prisma.category.findUniqueOrThrow({ where: { id } });
  const after = await prisma.category.update({ where: { id }, data: { active: !before.active } });
  await audit({ entityType: "Category", entityId: id, action: "UPDATE", before, after, userId: user.id });
  revalidatePath("/categories");
}
