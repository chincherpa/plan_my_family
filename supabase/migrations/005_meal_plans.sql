-- Meal planning: one free-text entry per family, day and meal (lunch/dinner)
CREATE TABLE IF NOT EXISTS meal_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('lunch', 'dinner')),
  text TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, date, meal_type)
);

ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;

-- Same family-scoped access pattern as the other tables
CREATE POLICY "meal_plans_select" ON meal_plans
  FOR SELECT USING (
    family_id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
  );

CREATE POLICY "meal_plans_insert" ON meal_plans
  FOR INSERT WITH CHECK (
    family_id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
  );

CREATE POLICY "meal_plans_update" ON meal_plans
  FOR UPDATE USING (
    family_id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
  );

CREATE POLICY "meal_plans_delete" ON meal_plans
  FOR DELETE USING (
    family_id IN (SELECT family_id FROM family_members WHERE user_id = auth.uid())
  );
