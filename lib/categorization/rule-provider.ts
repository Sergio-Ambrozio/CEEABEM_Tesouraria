import { RuleMatchType } from "@prisma/client";
import { prisma } from "@/lib/prisma/db";
import type { CategorizationProvider } from "./types";

export const ruleBasedCategorizationProvider: CategorizationProvider = {
  name: "rules",
  async suggest(transaction) {
    const haystack = `${transaction.description} ${transaction.reference ?? ""}`.trim();
    const rules = await prisma.categorizationRule.findMany({
      where: { enabled: true, category: { active: true } },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
    });

    for (const rule of rules) {
      if (matches(rule.matchType, haystack, rule.keyword)) {
        return {
          categoryId: rule.categoryId,
          confidence: rule.matchType === RuleMatchType.REGEX ? 0.92 : 0.85,
          reason: `Matched ${rule.matchType.toLowerCase()} rule "${rule.keyword}"`
        };
      }
    }

    return null;
  }
};

function matches(matchType: RuleMatchType, value: string, keyword: string) {
  const lowerValue = value.toLowerCase();
  const lowerKeyword = keyword.toLowerCase();

  if (matchType === RuleMatchType.STARTS_WITH) return lowerValue.startsWith(lowerKeyword);
  if (matchType === RuleMatchType.CONTAINS) return lowerValue.includes(lowerKeyword);

  try {
    return new RegExp(keyword, "i").test(value);
  } catch {
    return false;
  }
}
