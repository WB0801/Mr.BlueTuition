import { describe, expect, it } from 'vitest'
import { calculateGradeStats, parseScoreColumnPaste, validateScoreValue } from './gradeEntry'

describe('grade entry helpers', () => {
  it('keeps blank distinct from a valid zero score', () => {
    expect(validateScoreValue('', 100)).toBeNull()
    expect(validateScoreValue('0', 100)).toBeNull()
    expect(calculateGradeStats(['', '0', '80'], 3)).toEqual({
      recorded: 2,
      total: 3,
      average: 40,
      highest: 80,
      lowest: 0,
    })
  })

  it('parses a copied score column in order', () => {
    expect(parseScoreColumnPaste('\n 72 \n81\n0\n', 0, 4, 100)).toEqual({
      values: ['72', '81', '0'],
      error: null,
    })
  })

  it('rejects internal blank lines so later scores cannot shift to another student', () => {
    expect(parseScoreColumnPaste('72\n\n81', 0, 3, 100)).toEqual({
      values: null,
      error: '粘贴内容包含空白行。请整理整列后再试，以免成绩错位。',
    })
  })

  it('rejects overflow, invalid scores and multiple columns without partial placement', () => {
    expect(parseScoreColumnPaste('1\n2\n3', 1, 3, 100).error).toContain('粘贴了 3 个成绩')
    expect(parseScoreColumnPaste('101', 0, 1, 100).error).toContain('不能超过满分')
    expect(parseScoreColumnPaste('50\t60', 0, 2, 100).error).toContain('一整列')
  })
})
