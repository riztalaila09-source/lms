-- +goose Up
-- Class-based visibility cleanup: remove any enrollment whose student's class is
-- NOT among the course's assigned classes. Earlier seeds enrolled students
-- directly (bypassing class checks), which let students see courses meant for
-- other classes. The general ("Materi Umum") course is exempt (open to all).
DELETE FROM course_enrollments
WHERE course_id <> 'general'
  AND NOT EXISTS (
    SELECT 1
    FROM course_classes cc
    JOIN classes cl ON cl.id = cc.class_id
    JOIN users u   ON u.id = course_enrollments.student_id
    WHERE cc.course_id = course_enrollments.course_id
      AND cl.name = u.kelas
  );

-- +goose Down
-- Data cleanup is not reversible.
