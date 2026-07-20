import { CreditAction } from "@prisma/client";
import { CREDIT_COSTS } from "@/lib/types";

export function getCreditCost(action: CreditAction): number {
  switch (action) {
    case CreditAction.CONCEPT_GENERATION:
      return CREDIT_COSTS.CONCEPT_GENERATION;
    case CreditAction.VISUALIZATION:
      return CREDIT_COSTS.VISUALIZATION;
    case CreditAction.PDF_EXPORT:
      return CREDIT_COSTS.PDF_EXPORT;
    case CreditAction.PPTX_EXPORT:
      return CREDIT_COSTS.PPTX_EXPORT;
    case CreditAction.DOCX_EXPORT:
      return CREDIT_COSTS.DOCX_EXPORT;
    case CreditAction.ADMIN_GRANT:
      return 0;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function creditActionForExportFormat(format: "pdf" | "pptx" | "docx"): CreditAction {
  switch (format) {
    case "pdf":
      return CreditAction.PDF_EXPORT;
    case "pptx":
      return CreditAction.PPTX_EXPORT;
    case "docx":
      return CreditAction.DOCX_EXPORT;
  }
}
