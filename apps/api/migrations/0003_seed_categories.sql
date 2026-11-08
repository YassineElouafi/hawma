INSERT INTO catalogue.category (id, name_i18n, required_tier, default_mode) VALUES
  ('cleaning', '{"fr":"Ménage","ar":"تنظيف","da":"نقاء"}', 2, 'catalogue'),
  ('diy',      '{"fr":"Bricolage","ar":"إصلاحات","da":"بريكولاج"}', 2, 'catalogue'),
  ('garden',   '{"fr":"Jardin","ar":"حديقة","da":"جردة"}', 1, 'catalogue'),
  ('tutoring', '{"fr":"Cours","ar":"دروس","da":"دروس"}', 1, 'catalogue'),
  ('errands',  '{"fr":"Courses","ar":"مشتريات","da":"كورسات"}', 1, 'dispatch'),
  ('rides',    '{"fr":"Transport","ar":"نقل","da":"نقل"}', 2, 'dispatch'),
  ('pets',     '{"fr":"Animaux","ar":"حيوانات","da":"حيوانات"}', 2, 'catalogue'),
  ('lending',  '{"fr":"Prêt","ar":"إعارة","da":"تسليف"}', 1, 'catalogue')
ON CONFLICT (id) DO NOTHING;
