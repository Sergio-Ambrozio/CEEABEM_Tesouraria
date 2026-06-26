"use client";

import { useState, useTransition } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { reviewAndApproveTransactionAction, reviewTransactionAction } from "@/lib/actions/transaction-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const schema = z.object({
  id: z.string(),
  categoryId: z.string().optional(),
  notes: z.string().optional(),
  createRule: z.boolean().optional(),
  ruleKeyword: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export function TransactionReviewForm({
  transaction,
  categories,
  disabled
}: {
  transaction: { id: string; categoryId: string | null; notes: string | null; description: string };
  categories: Array<{ id: string; name: string }>;
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [actionMode, setActionMode] = useState<"save" | "approve">("save");
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      id: transaction.id,
      categoryId: transaction.categoryId ?? "",
      notes: transaction.notes ?? "",
      createRule: false,
      ruleKeyword: keywordFromDescription(transaction.description)
    }
  });
  const createRule = form.watch("createRule");
  const categoryId = form.watch("categoryId");

  function submit(mode: "save" | "approve") {
    setActionMode(mode);
    return form.handleSubmit((values) => {
      startTransition(async () => {
        if (mode === "approve") {
          await reviewAndApproveTransactionAction(values);
        } else {
          await reviewTransactionAction(values);
        }
        router.refresh();
      });
    });
  }

  return (
    <form
      className="grid gap-2 lg:grid-cols-[180px_1fr_150px]"
      onSubmit={submit("save")}
    >
      <input type="hidden" {...form.register("id")} />
      <div className="space-y-1">
        <Label>Category</Label>
        <Select {...form.register("categoryId")} disabled={disabled || pending}>
          <option value="">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea rows={2} {...form.register("notes")} disabled={disabled || pending} />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" {...form.register("createRule")} disabled={disabled || pending} />
          Suggest this categorization next time
        </label>
        {createRule ? <Input placeholder="Rule keyword" {...form.register("ruleKeyword")} disabled={disabled || pending} /> : null}
      </div>
      <div className="flex items-end justify-end gap-2">
        <Button type="submit" variant="outline" disabled={disabled || pending}>
          <Save className="h-4 w-4" />
          {pending && actionMode === "save" ? "Saving" : "Save Review"}
        </Button>
        <Button
          type="button"
          disabled={disabled || pending || !categoryId}
          onClick={submit("approve")}
        >
          <CheckCircle2 className="h-4 w-4" />
          {pending && actionMode === "approve" ? "Approving" : "Approve"}
        </Button>
      </div>
    </form>
  );
}

function keywordFromDescription(description: string) {
  return description.split(/\s+/).slice(0, 2).join(" ");
}
