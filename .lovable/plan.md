

## Fix Plan

### Phase 1: Make Testing Work (Fix Auth Bypass)
1. **Update `src/pages/Index.tsx`:**
   - Add a mock user object for testing when auth is bypassed
   - Or properly skip all user-dependent operations

2. **Update `supabase/functions/finalize-job/index.ts`:**
   - Use `SUPABASE_SERVICE_ROLE_KEY` like `process-job`
   - Remove `.eq("user_id", user.id)` filter
   - Make auth optional for testing

3. **Update `supabase/functions/create-job/index.ts`:**
   - Make auth optional for testing (or provide test user)

### Phase 2: Fix Core Functionality
4. **Fix video selfie validation** in `src/lib/fileValidation.ts`:
   - Add video MIME types to `ALLOWED_MIME_TYPES.selfie`

5. **Fix `handleRegenerate`** to actually pass the style to the backend

6. **Fix audio file extension** in FFmpeg to use correct extension

### Phase 3: Clean Up
7. Remove duplicate/conflicting emotion constants in `constants.ts`
8. Add proper error handling for FFmpeg failures
9. Consider caching Google access tokens

