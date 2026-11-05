import { EXAM_CONFIG, type ExamConfiguration } from './examConfig.ts'
export const GRADES = EXAM_CONFIG.grades.map(g => ({...g, questions:g.questions_per_exam}))
export type Grade = typeof GRADES[number]['code']
export function parseGrade(value: unknown): Grade {
 if (value === undefined || value === null || value === '') return '2'
 if (!GRADES.some(g => g.code === value)) throw new Error('Invalid grade')
 return value as Grade
}
export function gradeConfig(grade: Grade, base: ExamConfiguration = EXAM_CONFIG): ExamConfiguration {
 return { ...base, exam: { ...base.exam, questions_per_exam: grade === '2' ? base.exam.questions_per_exam : GRADES.find(g => g.code === grade)!.questions } }
}
