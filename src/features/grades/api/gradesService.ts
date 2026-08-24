import { requireSupabase } from '../../../lib/requireSupabase'
import type {
  SchoolExam,
  SchoolExamHistoricalCandidate,
  SchoolExamRosterEntry,
  SchoolExamScore,
  TuitionQuiz,
  QuizRewardOverview,
  QuizTopThreePreview,
  TuitionQuizRosterEntry,
  TuitionQuizScore,
} from '../../../types/domain'
import { buildSchoolExamOverviews, buildTuitionQuizOverviews } from '../gradeOverview'

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

export async function listSchoolExamOverviews(filters: { year?: number; subjectId?: string } = {}) {
  const exams = await listSchoolExams(filters)
  if (exams.length === 0) return []
  const examIds = exams.map((exam) => exam.id)
  const subjectIds = [...new Set(exams.map((exam) => exam.subject_id))]
  const client = requireSupabase()
  const [scoresResult, enrollmentsResult] = await Promise.all([
    client.from('school_exam_scores').select('exam_id,student_id').in('exam_id', examIds),
    client.from('enrollments').select('student_id,class_id,join_date,end_date,class:classes!inner(subject_id)').in('class.subject_id', subjectIds),
  ])
  if (scoresResult.error) throw scoresResult.error
  if (enrollmentsResult.error) throw enrollmentsResult.error
  return buildSchoolExamOverviews(
    exams,
    (scoresResult.data ?? []).map((row) => ({ parent_id: row.exam_id, student_id: row.student_id })),
    (enrollmentsResult.data ?? []).map((row) => ({
      student_id: row.student_id,
      class_id: row.class_id,
      subject_id: row.class?.[0]?.subject_id,
      join_date: row.join_date,
      end_date: row.end_date,
    })),
  )
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

export async function listTuitionQuizOverviews(classId?: string) {
  const quizzes = await listTuitionQuizzes(classId)
  if (quizzes.length === 0) return []
  const quizIds = quizzes.map((quiz) => quiz.id)
  const classIds = [...new Set(quizzes.map((quiz) => quiz.class_id))]
  const client = requireSupabase()
  const [scoresResult, enrollmentsResult] = await Promise.all([
    client.from('tuition_quiz_scores').select('quiz_id,student_id').in('quiz_id', quizIds),
    client.from('enrollments').select('student_id,class_id,join_date,end_date').in('class_id', classIds),
  ])
  if (scoresResult.error) throw scoresResult.error
  if (enrollmentsResult.error) throw enrollmentsResult.error
  return buildTuitionQuizOverviews(
    quizzes,
    (scoresResult.data ?? []).map((row) => ({ parent_id: row.quiz_id, student_id: row.student_id })),
    enrollmentsResult.data ?? [],
  )
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

export async function previewTuitionQuizTopThree(quizId: string) {
  const { data, error } = await requireSupabase().rpc('preview_tuition_quiz_top_three', {
    p_quiz_id: quizId,
  })
  if (error) throw error
  return normalizeTopThreePreview(data)
}

export async function confirmTuitionQuizTopThree(
  quizId: string,
  options: { allowIncomplete?: boolean; allowAwardedHistoryImpact?: boolean } = {},
) {
  const { data, error } = await requireSupabase().rpc('confirm_tuition_quiz_top_three', {
    p_quiz_id: quizId,
    p_allow_incomplete: options.allowIncomplete ?? false,
    p_allow_awarded_history_impact: options.allowAwardedHistoryImpact ?? false,
  })
  if (error) throw error
  return normalizeTopThreePreview(data)
}

export async function listQuizRewardOverview(classId?: string) {
  const { data, error } = await requireSupabase().rpc('list_quiz_reward_overview', {
    p_class_id: classId || null,
  })
  if (error) throw error
  return normalizeRewardOverview(data)
}

export async function getStudentQuizRewardSummary(studentId: string) {
  const { data, error } = await requireSupabase().rpc('get_student_quiz_reward_summary', {
    p_student_id: studentId,
  })
  if (error) throw error
  return normalizeRewardOverview(data)
}

export async function countPendingQuizRewards() {
  const { data, error } = await requireSupabase().rpc('count_pending_quiz_rewards')
  if (error) throw error
  return Number(data ?? 0)
}

export async function markQuizRewardAwarded(studentId: string, classId: string, clientRequestId: string) {
  const { data, error } = await requireSupabase().rpc('mark_quiz_reward_awarded', {
    p_student_id: studentId,
    p_class_id: classId,
    p_client_request_id: clientRequestId,
  })
  if (error) throw error
  return data as { claim_id: string; remaining_count: number; idempotent: boolean }
}

export async function reverseQuizReward(claimId: string) {
  const { data, error } = await requireSupabase().rpc('reverse_quiz_reward', {
    p_claim_id: claimId,
  })
  if (error) throw error
  return data as { claim_id: string; released_count: number; idempotent: boolean }
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

function normalizeTopThreePreview(value: unknown): QuizTopThreePreview {
  const preview = (value ?? {}) as Record<string, unknown>
  const numeric = (entry: Record<string, unknown>) => ({
    ...entry,
    rank: Number(entry.rank ?? 0),
    score: Number(entry.score ?? 0),
    ...(entry.unredeemed_after === undefined ? {} : { unredeemed_after: Number(entry.unredeemed_after) }),
    ...(entry.old_rank === undefined ? {} : { old_rank: Number(entry.old_rank) }),
    ...(entry.new_rank === undefined ? {} : { new_rank: Number(entry.new_rank) }),
    ...(entry.old_score === undefined ? {} : { old_score: Number(entry.old_score) }),
    ...(entry.new_score === undefined ? {} : { new_score: Number(entry.new_score) }),
  })
  const differences = (preview.differences ?? {}) as Record<string, unknown>
  return {
    ...preview,
    roster_count: Number(preview.roster_count ?? 0),
    score_count: Number(preview.score_count ?? 0),
    awarded_history_impact: Number(preview.awarded_history_impact ?? 0),
    missing_students: Array.isArray(preview.missing_students) ? preview.missing_students : [],
    candidates: Array.isArray(preview.candidates) ? preview.candidates.map((entry) => numeric(entry as Record<string, unknown>)) : [],
    recorded: Array.isArray(preview.recorded) ? preview.recorded.map((entry) => numeric(entry as Record<string, unknown>)) : [],
    differences: {
      added: Array.isArray(differences.added) ? differences.added.map((entry) => numeric(entry as Record<string, unknown>)) : [],
      removed: Array.isArray(differences.removed) ? differences.removed.map((entry) => numeric(entry as Record<string, unknown>)) : [],
      changed: Array.isArray(differences.changed) ? differences.changed.map((entry) => numeric(entry as Record<string, unknown>)) : [],
    },
  } as QuizTopThreePreview
}

function normalizeRewardOverview(value: unknown): QuizRewardOverview {
  const overview = (value ?? {}) as Record<string, unknown>
  const mapRecords = (records: unknown) => Array.isArray(records) ? records.map((record) => {
    const item = record as Record<string, unknown>
    return { ...item, rank: Number(item.rank ?? 0), score: Number(item.score ?? 0) }
  }) : []
  const mapProgress = (rows: unknown) => Array.isArray(rows) ? rows.map((row) => {
    const item = row as Record<string, unknown>
    return {
      ...item,
      unredeemed_count: Number(item.unredeemed_count ?? 0),
      ...(item.reward_count === undefined ? {} : { reward_count: Number(item.reward_count) }),
      records: mapRecords(item.records),
    }
  }) : []
  const history = Array.isArray(overview.history) ? overview.history.map((row) => {
    const item = row as Record<string, unknown>
    return { ...item, records: mapRecords(item.records) }
  }) : []
  return {
    pending_count: Number(overview.pending_count ?? 0),
    pending: mapProgress(overview.pending),
    progress: mapProgress(overview.progress),
    history,
  } as QuizRewardOverview
}
