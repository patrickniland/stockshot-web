// StockShot — Auth helpers

import { supabase } from './supabase'

export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })
  if (error) throw error
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUpWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Get or create organisation for a user
export async function getOrCreateOrg(userId: string, orgName = 'My Studio'): Promise<string> {
  // Check if user already belongs to an org
  const { data: memberships, error: memberError } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', userId)

  if (!memberError && memberships && memberships.length > 0) {
    return memberships[0].org_id
  }

  // Create a new org
  const { data: org, error: orgError } = await supabase
    .from('organisations')
    .insert({ name: orgName })
    .select('id')
    .single()

  if (orgError || !org) {
    console.error('Org creation error:', orgError)
    throw new Error('Failed to create organisation')
  }

  // Add user as member
  const { error: memberInsertError } = await supabase
    .from('org_members')
    .insert({
      org_id: org.id,
      user_id: userId,
      role: 'admin',
    })

  if (memberInsertError) {
    console.error('Member insert error:', memberInsertError)
    throw new Error('Failed to add org member')
  }

  return org.id
}
