"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildAgentBriefPayload = buildAgentBriefPayload;
exports.compactIdeaForCritic = compactIdeaForCritic;
const project_brief_profile_util_1 = require("../providers/llm/project-brief-profile.util");
function buildAgentBriefPayload(ctx) {
    const profile = ctx.projectProfile ??
        (0, project_brief_profile_util_1.extractProjectBriefProfile)({
            userPrompt: ctx.userQuery,
            projectCategory: ctx.category,
            colors: ctx.colors,
            allowedItems: ctx.includeCatalogConstraints ? ctx.allowedItems : [],
            forbiddenItems: ctx.includeCatalogConstraints ? ctx.forbiddenItems : [],
        });
    const catalogConstraints = ctx.includeCatalogConstraints !== false
        ? {
            themesToExplore: ctx.allowedItems?.length ? ctx.allowedItems : null,
            mustAvoid: ctx.forbiddenItems?.length ? ctx.forbiddenItems : null,
        }
        : { themesToExplore: null, mustAvoid: null };
    return {
        clientBrief: ctx.userQuery,
        briefSummary: profile.briefSummary,
        projectProfile: (0, project_brief_profile_util_1.profileToLlmPayload)(profile),
        category: ctx.category ?? null,
        categoryNote: 'Project category is a SOFT signal only — do not treat catalog rawCategory as hard filter. ' +
            'Match products by name, description, tags, use case and brief fit.',
        budgetRubPerUnit: ctx.budgetMin != null || ctx.budgetMax != null
            ? { min: ctx.budgetMin ?? null, max: ctx.budgetMax ?? null }
            : null,
        runQuantity: ctx.quantity ?? null,
        brandColors: ctx.colors ?? [],
        constraints: catalogConstraints,
        extraNotes: ctx.notes ?? null,
        hasLogo: Boolean(ctx.hasLogo),
        ideaRequirements: {
            explainBriefFit: true,
            explainProductRoles: true,
            cohesiveSetNotRandomPick: true,
            eachIdeaMustStateWhyProductsFit: true,
        },
    };
}
function compactIdeaForCritic(idea) {
    return {
        title: idea.title,
        hook: idea.hook ?? '',
        description: idea.description,
        styleTags: idea.styleTags ?? [],
        whyItFits: idea.whyItFits ?? '',
    };
}
//# sourceMappingURL=brief-context.util.js.map