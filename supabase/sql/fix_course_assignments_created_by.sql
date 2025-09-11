-- Migration to standardize on created_by column in course_assignments table
-- This handles the schema drift between assigned_by and created_by

-- Step 1: Check if created_by column exists, if not rename assigned_by to created_by
DO $$ 
BEGIN 
    -- If created_by column doesn't exist but assigned_by does, rename it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'created_by'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'assigned_by'
    ) THEN
        ALTER TABLE public.course_assignments 
        RENAME COLUMN assigned_by TO created_by;
        
        RAISE NOTICE 'Renamed assigned_by to created_by in course_assignments table';
    
    -- If neither exists, add created_by column
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE public.course_assignments 
        ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;
        
        RAISE NOTICE 'Added created_by column to course_assignments table';
    END IF;
END $$;

-- Step 2: Backfill created_by if there's data with assigned_by (in case both columns exist)
DO $$ 
BEGIN 
    -- If both columns exist, copy data from assigned_by to created_by where needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'assigned_by'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'created_by'
    ) THEN
        UPDATE public.course_assignments 
        SET created_by = assigned_by 
        WHERE created_by IS NULL AND assigned_by IS NOT NULL;
        
        -- Now drop the assigned_by column
        ALTER TABLE public.course_assignments 
        DROP COLUMN assigned_by;
        
        RAISE NOTICE 'Backfilled created_by from assigned_by and dropped assigned_by column';
    END IF;
END $$;

-- Step 3: Ensure created_by is NOT NULL
DO $$ 
BEGIN 
    -- Check if the column allows NULL
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND column_name = 'created_by'
        AND is_nullable = 'YES'
    ) THEN
        -- First backfill any NULL values with a system user or the first admin
        UPDATE public.course_assignments 
        SET created_by = (
            SELECT id FROM auth.users 
            WHERE id IN (
                SELECT user_id FROM public.user_roles 
                WHERE role_id IN (
                    SELECT id FROM public.roles WHERE name = 'Admin'
                )
            ) 
            LIMIT 1
        )
        WHERE created_by IS NULL;
        
        -- Now make it NOT NULL
        ALTER TABLE public.course_assignments 
        ALTER COLUMN created_by SET NOT NULL;
        
        RAISE NOTICE 'Set created_by column to NOT NULL';
    END IF;
END $$;

-- Step 4: Ensure foreign key constraint exists
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = 'course_assignments'
        AND kcu.column_name = 'created_by'
        AND tc.constraint_type = 'FOREIGN KEY'
    ) THEN
        ALTER TABLE public.course_assignments 
        ADD CONSTRAINT course_assignments_created_by_fkey 
        FOREIGN KEY (created_by) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE;
        
        RAISE NOTICE 'Added foreign key constraint for created_by';
    END IF;
END $$;

-- Step 5: Update the unique constraint to ensure it matches (user_id, course_id, role)
-- This is already correct in the existing schema, but let's ensure it
DO $$ 
BEGIN 
    -- Check if the correct unique constraint exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
        AND table_name = 'course_assignments' 
        AND constraint_type = 'UNIQUE'
        AND constraint_name = 'course_assignments_user_id_course_id_role_key'
    ) THEN
        -- Drop any existing unique constraints that don't match
        DROP CONSTRAINT IF EXISTS course_assignments_user_id_course_id_key ON public.course_assignments;
        
        -- Add the correct unique constraint
        ALTER TABLE public.course_assignments 
        ADD CONSTRAINT course_assignments_user_id_course_id_role_key 
        UNIQUE(user_id, course_id, role);
        
        RAISE NOTICE 'Updated unique constraint to (user_id, course_id, role)';
    END IF;
END $$;

RAISE NOTICE 'Migration completed: course_assignments table now uses created_by column consistently';