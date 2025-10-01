# Equipment Assessment Database Relationships

## Table Relationships Overview

```
COURSES
    ↓ (has many)
COURSE_MODULES
    ↓ (references)
EQUIPMENT_TEMPLATES (stored at course level)
    ↓ (responses stored in)
TRAINEE_EQUIPMENT_RESPONSES & ASSESSOR_EQUIPMENT_CONFIRMATIONS
```

## Key Tables and Their Purpose

### 1. **equipment_templates**
- Stores the equipment form questions/requirements at the COURSE level
- Key columns: `id`, `course_id`, `equipment_name`, `description`, `required`, `category`, `order_index`
- One set of equipment requirements per course, shared by all modules

### 2. **course_modules** 
- Key column: `include_equipment_assessment` (boolean)
- When TRUE on an `onsite_assessment` module, it displays the course's equipment templates
- Links: `course_id` → courses table

### 3. **trainee_equipment_responses**
- Stores trainee's responses to equipment forms
- Key columns: `user_id`, `course_id`, `equipment_id`, `response_text`
- Links to: `equipment_templates.id` via `equipment_id`

### 4. **assessor_equipment_confirmations**
- Stores assessor's confirmations of equipment checks
- Key columns: `trainee_id`, `assessor_id`, `equipment_id`, `confirmed`, `assessor_notes`
- Links to: `equipment_templates.id` via `equipment_id`

### 5. **form_instances** & **form_items**
- Alternative/newer form system
- `form_instances`: Container for a form, can link to `module_id`
- `form_items`: Individual questions within a form instance
- Used for more complex form structures

### 6. **form_responses**
- Stores responses for the newer form system
- Links to `form_items` via `item_id`
- Has `is_latest` flag for versioning

### 7. **onsite_requirements**
- Different from equipment forms - these are checklist items for trainers/assessors
- Linked directly to modules via `module_id`
- Used for onsite training/assessment checklists

### 8. **requirement_responses**
- Stores responses to `onsite_requirements`
- Different from equipment responses - these are for trainer/assessor checklists

## How Equipment Assessment Works

1. **Course Creator** creates equipment templates at the course level
2. **Module Creator** enables `include_equipment_assessment` on an onsite assessment module
3. **When displayed**, the system:
   - Checks if module has `include_equipment_assessment = true`
   - Fetches all `equipment_templates` for that course
   - Shows them as requirements to be completed

4. **Response Storage**:
   - Trainee fills out form → stored in `trainee_equipment_responses`
   - Assessor confirms → stored in `assessor_equipment_confirmations`
   - OR uses new form system → stored in `form_responses`

## Required Columns Check

Run these checks to ensure all necessary columns exist:

```sql
-- Check for include_equipment_assessment in course_modules
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'course_modules' 
AND column_name = 'include_equipment_assessment';

-- Check for module_id in form_instances (if using new form system)
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'form_instances' 
AND column_name = 'module_id';
```

## Migration Path

If you need to add missing columns:

```sql
-- Add equipment assessment flag to modules
ALTER TABLE course_modules 
ADD COLUMN IF NOT EXISTS include_equipment_assessment BOOLEAN DEFAULT false;

-- Add module link to form instances (if needed)
ALTER TABLE form_instances 
ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES course_modules(id);
```