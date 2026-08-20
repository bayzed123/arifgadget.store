-- Blocking a customer account.
--
-- A shop occasionally needs to shut one account out — repeated fraudulent
-- orders, abuse toward staff — without deleting the account or its order
-- history, which stays exactly as useful as evidence either way. `active`
-- defaults to 1 so every existing account keeps working the moment this
-- migration runs.
ALTER TABLE customers ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
