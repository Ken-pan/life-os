// Thin shim: domain repo lives in @life-os/finance-core; bind app Supabase client once.
import { bindFinanceSupabase } from '@life-os/finance-core/repo'
import { supabase } from './supabase'

bindFinanceSupabase(supabase)

export * from '@life-os/finance-core/repo'
