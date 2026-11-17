import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GRADES, parseGrade, gradeConfig } from '../shared/grades.ts'
import { gradeScope } from '../server/core/grade.ts'
import { seedContent, importContent } from '../server/operations/content.ts'
test('grade selection defaults legacy URLs to 2 and validates the configured catalog',()=>{
 assert.deepEqual(GRADES.map(g=>g.code),['2','pre1','1'])
 assert.equal(parseGrade(undefined),'2')
 assert.equal(gradeConfig('1').exam.questions_per_exam,90)
 assert.equal(gradeConfig('pre1').exam.questions_per_exam,60)
 assert.throws(()=>parseGrade('3'))
})
test('other grades never automatically seed or import the bundled grade 2 material',async()=>{
 for(const grade of ['1','pre1'] as const) await gradeScope.run(grade,async()=>{
  assert.deepEqual(await seedContent({mode:'development',db:{} as any}),{status:'skipped'})
  await assert.rejects(()=>importContent(),/INPUT/)
 })
})

test('grade palettes and free boundaries share one configuration and validate bounds', () => {
 for (const [grade, free, color] of [['2',3,'#087ca6'],['pre1',2,'#86438f'],['1',1,'#34363a']] as const) {
  const config = gradeConfig(grade)
  assert.equal(config.payments.free_exam_count, free)
  assert.equal(config.site.primary_color, color)
 }
})
