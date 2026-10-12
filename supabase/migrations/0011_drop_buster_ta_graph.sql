-- The know-how graph is gone from tiny-axe's home: the site is the chat
-- history and the remote chat now. These tables held only the graph (0006's
-- vault manifest and notes, 0008's Notes folder) and the session graph's chat
-- reviews (0009). Their indexes and constraints go with them; no function,
-- trigger or policy used them.
--
-- Kept: buster_ta_keys, buster_ta_members, buster_ta_accounts,
-- buster_ta_chats and buster_ta_remote.

drop table if exists public.buster_ta_reviews;
drop table if exists public.buster_ta_notes;
drop table if exists public.buster_ta_vault;
