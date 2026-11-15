import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url: string | undefined = import.meta.env.VITE_SUPABASE_URL;
const key: string | undefined = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * The connection to the academy database, or null where none is set up (the tests, and any build
 * without the two settings), in which case the app works as it always has, on this device alone.
 */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
