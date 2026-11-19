import { GRADES, gradeConfig, parseGrade, type Grade } from '../../shared/grades'
import { createExamCatalog } from '~/utils/examCatalog'
// Preserve the grade serialized with static HTML during hydration. The app
// then remounts grade-dependent screens once with the actual browser grade.
export function useGradeState() {
 const route = useRoute()
 return useState<Grade>('display-grade', () => parseGrade(route.query.grade))
}
export function useGrade() {
 const grade = useGradeState().value
 const config = gradeConfig(grade)
 return { grade, grades: GRADES, config, label: GRADES.find(g => g.code === grade)!.label,
 EXAM_CATALOG: createExamCatalog(config), QUESTIONS_PER_EXAM: config.exam.questions_per_exam,
 FREE_EXAM_MAX: config.payments.enabled ? config.payments.free_exam_count : config.exam.set_count,
 // Slots after this number are shown as "in development" and are not links;
 // a value above the slot count is treated as the slot count.
 AVAILABLE_EXAM_MAX: Math.min(GRADES.find(g => g.code === grade)!.available_exam_count ?? config.exam.set_count, config.exam.set_count) }
}
