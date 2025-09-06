
-- Add pending_approval status to the authorization assignments table
ALTER TABLE public.authorisation_assignments 
DROP CONSTRAINT IF EXISTS authorisation_assignments_assignment_status_check;

ALTER TABLE public.authorisation_assignments 
ADD CONSTRAINT authorisation_assignments_assignment_status_check 
CHECK (assignment_status IN ('assigned', 'in_progress', 'pending_approval', 'completed', 'expired'));

-- Update the trigger function query to include the new status
UPDATE public.authorisation_assignments 
SET assignment_status = 'pending_approval' 
WHERE assignment_status = 'completed' 
AND id IN (
    SELECT aa.id 
    FROM public.authorisation_assignments aa
    JOIN public.authorisations a ON a.id = aa.authorisation_id
    WHERE a.title = 'test Authorisation'
);
