-- Notes the model writes (graph_add_note, tiny-axe docs/plan-lobsterattack.md)
-- go in a Notes folder of the owner's vault on the site.

alter table public.buster_ta_notes drop constraint if exists buster_ta_notes_folder_check;
alter table public.buster_ta_notes add constraint buster_ta_notes_folder_check
  check (folder in ('Sites', 'Pages', 'Controls', 'Paths', 'Tools', 'Tasks', 'Workflows', 'Notes'));
