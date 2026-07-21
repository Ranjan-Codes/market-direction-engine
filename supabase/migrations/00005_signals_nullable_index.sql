-- Watch-only (off-index) stocks get signals too; they have no index, no
-- regime gate. index_id becomes nullable.
alter table signals alter column index_id drop not null;
