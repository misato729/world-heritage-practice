import { defineApiHandler } from '../../../core/api-handler.ts'
import { getAchievementReport } from '../../../services/achievement.ts'
export default defineApiHandler((_event,user)=>getAchievementReport(user),{authentication:'required'})
