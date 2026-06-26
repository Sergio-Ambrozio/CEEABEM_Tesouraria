"use client";

import { useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createCategoryAction } from "@/lib/actions/category-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

const schema = z.object({
  name: z.string().trim().min(2, "Enter a category name."),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  parentCategoryId: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export function CategoryForm({ categories }: { categories: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", color: "#155e75", parentCategoryId: "" }
  });

  return (
    <form
      className="grid gap-3 md:grid-cols-[1fr_140px_1fr_auto]"
      onSubmit={form.handleSubmit((values) => {
        startTransition(async () => {
          await createCategoryAction(values);
          form.reset({ name: "", color: "#155e75", parentCategoryId: "" });
        });
      })}
    >
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...form.register("name")} />
        {form.formState.errors.name ? <p className="text-xs text-destructive">{form.formState.errors.name.message}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="color">Color</Label>
        <Input id="color" type="color" {...form.register("color")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="parentCategoryId">Parent</Label>
        <Select id="parentCategoryId" {...form.register("parentCategoryId")}>
          <option value="">None</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </form>
  );
}
