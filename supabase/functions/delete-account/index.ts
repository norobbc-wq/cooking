import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://cooking-norobbc-4570.vercel.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = request.headers.get('Authorization') ?? ''
  const projectUrl = Deno.env.get('SUPABASE_URL')
  const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!projectUrl || !publishableKey || !serviceRoleKey) return Response.json({ message: 'إعداد الخادم غير مكتمل.' }, { status: 500, headers: corsHeaders })

  const caller = createClient(projectUrl, publishableKey, { global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: userError } = await caller.auth.getUser()
  if (userError || !user) return Response.json({ message: 'انتهت الجلسة. أعد فتح رابط التأكيد من بريدك.' }, { status: 401, headers: corsHeaders })

  const { data: claimsData } = await caller.auth.getClaims()
  const amr = Array.isArray(claimsData?.claims?.amr) ? claimsData.claims.amr : []
  const confirmedAt = amr.find((item: { method?: string; timestamp?: number }) => item.method === 'otp')?.timestamp
  if (!confirmedAt || Date.now() - confirmedAt * 1000 > 15 * 60 * 1000) return Response.json({ message: 'تأكيد البريد غير صالح أو انتهت مدته. أرسل رابطاً جديداً.' }, { status: 403, headers: corsHeaders })

  const admin = createClient(projectUrl, serviceRoleKey)
  const { data: memberships, error: membershipsError } = await admin.from('household_members').select('household_id, role, joined_at').eq('user_id', user.id)
  if (membershipsError) return Response.json({ message: 'تعذر التحقق من العائلات.' }, { status: 500, headers: corsHeaders })

  for (const membership of memberships ?? []) {
    let replacementId: string | null = null
    if (membership.role === 'owner') {
      const { data: replacement } = await admin.from('household_members').select('user_id').eq('household_id', membership.household_id).neq('user_id', user.id).order('joined_at').limit(1).maybeSingle()
      if (!replacement) return Response.json({ message: 'لا يمكن حذف الحساب لأن إحدى عائلاتك لا تضم عضواً آخر لنقل الملكية إليه.' }, { status: 409, headers: corsHeaders })
      replacementId = replacement.user_id
      const { error: ownerError } = await admin.from('households').update({ owner_id: replacementId }).eq('id', membership.household_id)
      if (ownerError) return Response.json({ message: 'تعذر نقل ملكية العائلة.' }, { status: 500, headers: corsHeaders })
      await admin.from('household_members').update({ role: 'owner' }).eq('household_id', membership.household_id).eq('user_id', replacementId)
      await admin.from('household_members').update({ role: 'member' }).eq('household_id', membership.household_id).eq('user_id', user.id)
    } else {
      const { data: household } = await admin.from('households').select('owner_id').eq('id', membership.household_id).single()
      replacementId = household?.owner_id ?? null
    }
    if (!replacementId) return Response.json({ message: 'تعذر تحديد مالك بديل للعائلة.' }, { status: 500, headers: corsHeaders })
    const filters = (table: 'dishes' | 'shopping_lists' | 'meal_plan') => admin.from(table).update({ created_by: replacementId }).eq('household_id', membership.household_id).eq('created_by', user.id)
    const results = await Promise.all([filters('dishes'), filters('shopping_lists'), filters('meal_plan')])
    if (results.some((result) => result.error)) return Response.json({ message: 'تعذر حفظ بيانات العائلة قبل الحذف.' }, { status: 500, headers: corsHeaders })
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
  if (deleteError) return Response.json({ message: 'تعذر حذف الحساب.' }, { status: 500, headers: corsHeaders })
  return Response.json({ ok: true }, { headers: corsHeaders })
})
