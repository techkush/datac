-- Drop the workspaces table: the workspace registry is the local
-- ~/.datac/workspaces.json file (single source of truth); this table was
-- only needed to feed the retired cloud app.
DROP TABLE "workspaces";
