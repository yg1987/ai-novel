import { writeProjectFile } from '../api/tauri'
import type { LightCheckResult } from '../types/review'
import type { ChapterRef } from '../types/chapter'
import { reviewReportStem } from './reviewReportStorage'
import { runLightCheck } from './reviewLightCheck'

const LIGHT_DIR = 'tracks/review-reports/light'

/**
 * Run a light check and save the report.
 * Called automatically on chapter save.
 */
export async function runAndSaveLightCheck(
  projectId: string,
  ref: ChapterRef,
  chapterHtml: string,
): Promise<LightCheckResult> {
  const result = await runLightCheck(projectId, chapterHtml)
  const filename = `${reviewReportStem(ref)}.json`
  await writeProjectFile(projectId, LIGHT_DIR, filename, JSON.stringify(result, null, 2))
  return result
}
