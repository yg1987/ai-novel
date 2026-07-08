# Task A4: Light Check + Review Service

## File Structure

**Files:**
- Modify: src/types/review.ts (add review types)
- Create: src/services/reviewLightCheck.ts
- Create: src/services/reviewService.ts

**Interfaces:**
- Consumes: listProjectFiles, eadProjectFile, writeProjectFile from src/api/tauri.ts; checkBannedWords from src/services/bannedWords.ts; loadProviderConfig from src/api/tauri.ts
- Produces: unLightCheck(projectId, chapterHtml) -> LightCheckResult
- Produces: unAndSaveLightCheck(projectId, chapterId, chapterHtml) -> LightCheckResult
- Produces: unDeepReview(projectId, chapterId, chapterHtml) -> DeepCheckResult
- Produces: listReviewReports(projectId) -> ReviewReportMeta[]
- Produces: getReviewReport(projectId, type, filename) -> string

## Steps

1. Add review types to src/types/review.ts: ReviewIssue, LightCheckResult, DeepCheckResult, ReviewReportMeta, ReviewSeverity, ReviewDimension, CheckType
2. Create src/services/reviewLightCheck.ts: runLightCheck() — character name loading + banned words + content health check
3. Create src/services/reviewService.ts: runAndSaveLightCheck() — wraps light check + save report; runDeepReview() — AI call with context + save report; listReviewReports() and getReviewReport()
4. LSP diagnostics on all files
5. Commit: feat(review): add light check rule engine and review service with deep AI review

## Exact Code Reference

See plan file at docs/superpowers/plans/2026-07-08-v04-quality-assurance.md lines 1005-1357 for the complete TypeScript code.
