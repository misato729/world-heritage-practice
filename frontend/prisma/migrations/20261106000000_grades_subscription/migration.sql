ALTER TABLE questions ADD COLUMN grade varchar(10) NOT NULL DEFAULT '2';
ALTER TABLE questions ADD CONSTRAINT questions_grade_valid CHECK (grade IN ('2','pre1','1'));
DROP INDEX index_questions_on_exam_number_and_question_number;
CREATE UNIQUE INDEX index_questions_on_grade_exam_question ON questions(grade,exam_number,question_number);
CREATE INDEX index_questions_grade_practice ON questions(grade,publication_status,exam_number,question_number);
CREATE TABLE subscriptions (
 id bigserial PRIMARY KEY, user_id bigint NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
 stripe_subscription_id text UNIQUE, stripe_customer_id text, checkout_session_id text UNIQUE,
 status varchar(30) NOT NULL DEFAULT 'pending', paid_until timestamp(6), cancel_at_period_end boolean NOT NULL DEFAULT false,
 updated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
