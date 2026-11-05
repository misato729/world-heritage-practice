import { GRADES, gradeConfig, parseGrade } from '../../shared/grades'
import { createExamCatalog } from '~/utils/examCatalog'
export function useGrade() {
 const route = useRoute()
 const grade = parseGrade(route.query.grade)
 const config = gradeConfig(grade)
 return { grade, grades: GRADES, config, label: GRADES.find(g => g.code === grade)!.label,
 EXAM_CATALOG: createExamCatalog(config), QUESTIONS_PER_EXAM: config.exam.questions_per_exam,
 FREE_EXAM_MAX: config.payments.enabled ? config.payments.free_exam_count : config.exam.set_count }
}
