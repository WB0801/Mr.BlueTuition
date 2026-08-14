import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  SchoolExam,
  SchoolExamHistoricalCandidate,
  SchoolExamRosterEntry,
  SchoolExamScore,
  TuitionQuiz,
  TuitionQuizRosterEntry,
  TuitionQuizScore,
} from '../../../types/domain'

const schoolExamSelection = '*, subject:subjects(id,name)'
const quizSelection = '*, class:classes(*,subject:subjects(id,name))'

export interface SchoolExamInput {
  subject_id: string
  year: number
  exam_date: string
  name: string
  max_score: number
}

export interface TuitionQuizInput {
  class_id: string
  name: string
  quiz_date: string
  max_score: number
}

export interface ScorePayload {
  student_id: string
  enrollment_id?: string
  score: number | null
}

export async function listSchoolExams(filters: { year?: number; subjectId?: string } = {}) {
  let query = requireSupabase()
    .from('school_exams')
    .select(schoolExamSelection)
    .order('year', { ascending: false })
    .order('exam_date', { ascending: false })

  if (filters.year) query = query.eq('year', filters.year)
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapSchoolExam)
}

export async function getSchoolExam(examId: string) {
  const { data, error } = await requireSupabase()
    .from('school_exams')
    .select(schoolExamSelection)
    .eq('id', examId)
    .single()
  if (error) throw error
  return mapSchoolExam(data)
}

export async function createSchoolExam(input: SchoolExamInput) {
  const { data, error } = await requireSupabase().rpc('create_school_exam', {
    p_subject_id: input.subject_id,
    p_year: input.year,
    p_exam_date: input.exam_date,
    p_name: input.name.trim(),
    p_max_score: Number(input.max_score),
  })
  if (error) throw error
  return mapSchoolExam(data)
}

export async function deleteSchoolExam(examId: string) {
  const { data, error } = await requireSupabase().rpc('delete_school_exam', { p_exam_id: examId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function listSchoolExamRoster(examId: string, classId?: string) {
  const { data, error } = await requireSupabase().rpc('list_school_exam_roster', {
    p_exam_id: examId,
    p_class_id: classId ?? null,
  })
  if (error) throw error
  return (data ?? []) as SchoolExamRosterEntry[]
}

export async function listSchoolExamHistoricalCandidates(examId: string, query: string) {
  const { data, error } = await requireSupabase().rpc('list_school_exam_historical_candidates', {
    p_exam_id: examId,
    p_query: query.trim(),
  })
  if (error) throw error
  return (data ?? []) as SchoolExamHistoricalCandidate[]
}

export async function listSchoolExamScores(examId: string) {
  const { data, error } = await requireSupabase()
    .from('school_exam_scores')
    .select('*')
    .eq('exam_id', examId)
  if (error) throw error
  return (data ?? []).map(mapSchoolExamScore)
}

export async function saveSchoolExamScores(examId: string, scores: ScorePayload[]) {
  const { data, error } = await requireSupabase().rpc('save_school_exam_scores', {
    p_exam_id: examId,
    p_scores: scores,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function listStudentSchoolExamScores(studentId: string, subjectId?: string) {
  let query = requireSupabase()
    .from('school_exam_scores')
    .select(`*, exam:school_exams!inner(${schoolExamSelection})`)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })

  if (subjectId) query = query.eq('exam.subject_id', subjectId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...mapSchoolExamScore(row),
    exam: row.exam ? mapSchoolExam(row.exam) : null,
  })) as SchoolExamScore[]
}

export async function listTuitionQuizzes(classId?: string) {
  let query = requireSupabase()
    .from('tuition_quizzes')
    .select(quizSelection)
    .order('quiz_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (classId) query = query.eq('class_id', classId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapTuitionQuiz)
}

export async function getTuitionQuiz(quizId: string) {
  const { data, error } = await requireSupabase()
    .from('tuition_quizzes')
    .select(quizSelection)
    .eq('id', quizId)
    .single()
  if (error) throw error
  return mapTuitionQuiz(data)
}

export async function createTuitionQuiz(input: TuitionQuizInput) {
  const { data, error } = await requireSupabase().rpc('create_tuition_quiz', {
    p_class_id: input.class_id,
    p_name: input.name.trim(),
    p_quiz_date: input.quiz_date,
    p_max_score: Number(input.max_score),
  })
  if (error) throw error
  return mapTuitionQuiz(data)
}

export async function deleteTuitionQuiz(quizId: string) {
  const { data, error } = await requireSupabase().rpc('delete_tuition_quiz', { p_quiz_id: quizId })
  if (error) throw error
  return Number(data ?? 0)
}

export async function listTuitionQuizRoster(quizId: string) {
  const { data, error } = await requireSupabase().rpc('list_tuition_quiz_roster', {
    p_quiz_id: quizId,
  })
  if (error) throw error
  return (data ?? []) as TuitionQuizRosterEntry[]
}

export async function listTuitionQuizScores(quizId: string) {
  const { data, error } = await requireSupabase()
    .from('tuition_quiz_scores')
    .select('*')
    .eq('quiz_id', quizId)
  if (error) throw error
  return (data ?? []).map(mapTuitionQuizScore)
}

export async function saveTuitionQuizScores(quizId: string, scores: ScorePayload[]) {
  const { data, error } = await requireSupabase().rpc('save_tuition_quiz_scores', {
    p_quiz_id: quizId,
    p_scores: scores,
  })
  if (error) throw error
  return Number(data ?? 0)
}

export async function listEnrollmentTuitionQuizScores(enrollmentId: string) {
  const { data, error } = await requireSupabase()
    .from('tuition_quiz_scores')
    .select(`*, quiz:tuition_quizzes!inner(${quizSelection})`)
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...mapTuitionQuizScore(row),
    quiz: row.quiz ? mapTuitionQuiz(row.quiz) : null,
  })) as TuitionQuizScore[]
}

export async function listStudentTuitionQuizScores(studentId: string) {
  const { data, error } = await requireSupabase()
    .from('tuition_quiz_scores')
    .select(`*, quiz:tuition_quizzes!inner(${quizSelection})`)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map((row) => ({
    ...mapTuitionQuizScore(row),
    quiz: row.quiz ? mapTuitionQuiz(row.quiz) : null,
  })) as TuitionQuizScore[]
}

function mapSchoolExam(row: Record<string, unknown>): SchoolExam {
  return {
    ...row,
    year: Number(row.year),
    max_score: Number(row.max_score),
  } as SchoolExam
}

function mapSchoolExamScore(row: Record<string, unknown>): SchoolExamScore {
  return { ...row, score: Number(row.score) } as SchoolExamScore
}

function mapTuitionQuiz(row: Record<string, unknown>): TuitionQuiz {
  return { ...row, max_score: Number(row.max_score) } as TuitionQuiz
}

function mapTuitionQuizScore(row: Record<string, unknown>): TuitionQuizScore {
  return { ...row, score: Number(row.score) } as TuitionQuizScore
}
