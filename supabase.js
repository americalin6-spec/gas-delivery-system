import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kczlhowwxmpuqgwpkjha.supabase.co";

const supabaseAnonKey = "sb_publishable_joKNakCWhCqGiTFTlCQn2Q__FZsU39K";

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);