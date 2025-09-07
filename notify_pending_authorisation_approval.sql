
-- Function to notify Senior Management when an authorisation is pending approval
CREATE OR REPLACE FUNCTION notify_pending_authorisation_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    senior_manager_id UUID;
    authorisation_title TEXT;
    trainee_name TEXT;
    trainee_email TEXT;
    webhook_url TEXT;
    webhook_secret TEXT;
    webhook_payload JSON;
BEGIN
    -- Only proceed if the status changed to 'pending_approval'
    IF NEW.assignment_status = 'pending_approval' AND 
       (OLD.assignment_status IS NULL OR OLD.assignment_status != 'pending_approval') THEN
        
        -- Get authorisation title
        SELECT title INTO authorisation_title
        FROM authorisations 
        WHERE id = NEW.authorisation_id;
        
        -- Get trainee details
        SELECT full_name, email INTO trainee_name, trainee_email
        FROM profiles 
        WHERE id = NEW.user_id;
        
        -- Notify all users with Senior Management role (in-app notifications)
        FOR senior_manager_id IN 
            SELECT DISTINCT p.id
            FROM profiles p
            JOIN user_roles ur ON p.id = ur.user_id
            JOIN roles r ON ur.role_id = r.id
            WHERE r.name = 'Senior Management'
        LOOP
            -- Insert notification using the notification dispatcher pattern
            INSERT INTO notifications (
                recipient_id,
                type,
                payload,
                read,
                created_at
            ) VALUES (
                senior_manager_id,
                'authorisation_pending_approval',
                jsonb_build_object(
                    'event_id', 'auth_pending_' || NEW.id::text || '_' || extract(epoch from now())::text,
                    'title', 'Authorisation Pending Approval',
                    'authorizationTitle', authorisation_title,
                    'learnerName', trainee_name,
                    'learner_email', trainee_email,
                    'assignmentId', NEW.id,
                    'url', '/app/admin/review/' || NEW.id::text
                ),
                false,
                now()
            );
        END LOOP;
        
        -- Call webhook for Teams notifications
        BEGIN
            SELECT current_setting('app.webhook_url', true) INTO webhook_url;
            SELECT current_setting('app.webhook_secret', true) INTO webhook_secret;
            
            IF webhook_url IS NOT NULL AND webhook_url != '' THEN
                webhook_payload := json_build_object(
                    'assignment_id', NEW.id,
                    'user_id', NEW.user_id,
                    'authorisation_id', NEW.authorisation_id,
                    'authorisation_title', authorisation_title,
                    'trainee_name', trainee_name,
                    'trainee_email', trainee_email
                );
                
                PERFORM net.http_post(
                    url := webhook_url || '/api/webhooks/authorisation-pending-approval',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'x-webhook-secret', webhook_secret
                    ),
                    body := webhook_payload::jsonb
                );
                
                RAISE NOTICE 'Called webhook for authorisation pending approval: %', NEW.id;
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Webhook call failed for authorisation pending approval: %', SQLERRM;
        END;
        
        RAISE NOTICE 'Notified Senior Management users about pending authorisation approval for assignment %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for authorisation assignment status changes
DROP TRIGGER IF EXISTS trigger_notify_pending_authorisation_approval ON authorisation_assignments;
CREATE TRIGGER trigger_notify_pending_authorisation_approval
    AFTER UPDATE ON authorisation_assignments
    FOR EACH ROW
    EXECUTE FUNCTION notify_pending_authorisation_approval();
