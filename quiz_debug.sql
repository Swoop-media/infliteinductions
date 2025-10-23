-- 1. Check quiz table structure and sample data
SELECT 'QUIZ TABLE STRUCTURE' as section;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'quizzes'
ORDER BY ordinal_position;

SELECT 'SAMPLE QUIZZES' as section;
SELECT * FROM quizzes LIMIT 5;

-- 2. Check quiz_questions table structure and sample data
SELECT 'QUIZ_QUESTIONS TABLE STRUCTURE' as section;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'quiz_questions'
ORDER BY ordinal_position;

SELECT 'SAMPLE QUIZ QUESTIONS' as section;
SELECT * FROM quiz_questions LIMIT 5;

-- 3. Check quiz_options table structure and sample data
SELECT 'QUIZ_OPTIONS TABLE STRUCTURE' as section;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'quiz_options'
ORDER BY ordinal_position;

SELECT 'SAMPLE QUIZ OPTIONS' as section;
SELECT * FROM quiz_options LIMIT 5;

-- 4. Check quiz_attempts table structure and sample data
SELECT 'QUIZ_ATTEMPTS TABLE STRUCTURE' as section;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'quiz_attempts'
ORDER BY ordinal_position;

SELECT 'SAMPLE QUIZ ATTEMPTS' as section;
SELECT * FROM quiz_attempts LIMIT 5;

-- 5. Check how quizzes are linked to modules/courses
SELECT 'QUIZ TO MODULE/COURSE LINKS' as section;
SELECT 
    q.id as quiz_id,
    q.module_id,
    q.course_id,
    cm.title as module_title,
    c.title as course_title
FROM quizzes q
LEFT JOIN course_modules cm ON cm.id = q.module_id
LEFT JOIN courses c ON c.id = q.course_id
LIMIT 10;

-- 6. Check how questions are linked to quizzes
SELECT 'QUESTION TO QUIZ LINKS' as section;
SELECT 
    qq.id as question_id,
    qq.quiz_id,
    qq.module_id,
    qq.course_id,
    qq.question,
    q.id as linked_quiz_id
FROM quiz_questions qq
LEFT JOIN quizzes q ON q.id = qq.quiz_id
LIMIT 10;

-- 7. Count questions per quiz
SELECT 'QUESTIONS PER QUIZ' as section;
SELECT 
    q.id as quiz_id,
    q.module_id,
    q.course_id,
    COUNT(qq.id) as question_count
FROM quizzes q
LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id 
    OR qq.module_id = q.module_id 
    OR qq.course_id = q.course_id
GROUP BY q.id, q.module_id, q.course_id
LIMIT 10;

-- 8. Check if there are any quiz attempts with their questions
SELECT 'QUIZ ATTEMPTS WITH QUESTIONS' as section;
SELECT 
    qa.id as attempt_id,
    qa.user_id,
    qa.quiz_id,
    qa.score_pct,
    qa.passed,
    q.module_id,
    q.course_id,
    COUNT(DISTINCT qq.id) as question_count
FROM quiz_attempts qa
LEFT JOIN quizzes q ON q.id = qa.quiz_id
LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id 
    OR qq.module_id = q.module_id 
    OR qq.course_id = q.course_id
GROUP BY qa.id, qa.user_id, qa.quiz_id, qa.score_pct, qa.passed, q.module_id, q.course_id
LIMIT 10;

-- 9. Check for orphaned questions (questions without proper links)
SELECT 'ORPHANED QUESTIONS CHECK' as section;
SELECT 
    COUNT(*) as total_questions,
    SUM(CASE WHEN quiz_id IS NOT NULL THEN 1 ELSE 0 END) as with_quiz_id,
    SUM(CASE WHEN module_id IS NOT NULL THEN 1 ELSE 0 END) as with_module_id,
    SUM(CASE WHEN course_id IS NOT NULL THEN 1 ELSE 0 END) as with_course_id,
    SUM(CASE WHEN quiz_id IS NULL AND module_id IS NULL AND course_id IS NULL THEN 1 ELSE 0 END) as orphaned
FROM quiz_questions;