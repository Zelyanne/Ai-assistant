-- Add label_preferences to workspace_integrations
-- Default to empty array (meaning no filtering/all labels, or as defined by business logic)

ALTER TABLE workspace_integrations 
ADD COLUMN label_preferences JSONB DEFAULT '[]'::jsonb;

-- Comment on column
COMMENT ON COLUMN workspace_integrations.label_preferences IS 'Array of Gmail label IDs to ingest. Empty array means all labels.';
