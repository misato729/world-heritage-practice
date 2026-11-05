import { AsyncLocalStorage } from 'node:async_hooks'
import type { Grade } from '../../shared/grades.ts'
export const gradeScope = new AsyncLocalStorage<Grade>()
export const currentGrade = (): Grade => gradeScope.getStore() ?? '2'
