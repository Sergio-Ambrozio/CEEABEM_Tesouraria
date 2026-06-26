import { EyeOff, RotateCcw } from "lucide-react";
import { Role } from "@prisma/client";
import { CategoryForm } from "@/components/category-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleCategoryAction } from "@/lib/actions/category-actions";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma/db";

export default async function CategoriesPage() {
  await requireUser([Role.ADMINISTRATOR, Role.TREASURER, Role.ACCOUNT_REVIEWER, Role.AUDITOR]);
  const categories = await prisma.category.findMany({
    include: { parentCategory: true, rules: { orderBy: { priority: "asc" } } },
    orderBy: [{ active: "desc" }, { name: "asc" }]
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Categories</h1>
        <p className="text-sm text-muted-foreground">Maintain the chart of accounts and the rule base used by auto categorization.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Category</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryForm categories={categories.map(({ id, name }) => ({ id, name }))} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Category Register</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Name</th>
                <th>Parent</th>
                <th>Rules</th>
                <th>Status</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category.id} className="border-b last:border-0">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                      {category.name}
                    </div>
                  </td>
                  <td>{category.parentCategory?.name ?? "-"}</td>
                  <td>{category.rules.map((rule) => rule.keyword).join(", ") || "-"}</td>
                  <td>{category.active ? "Active" : "Inactive"}</td>
                  <td className="text-right">
                    <form action={toggleCategoryAction}>
                      <input type="hidden" name="id" value={category.id} />
                      <Button type="submit" variant="outline" size="sm">
                        {category.active ? <EyeOff className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        {category.active ? "Deactivate" : "Reactivate"}
                      </Button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
